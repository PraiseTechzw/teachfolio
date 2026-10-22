import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, like, or } from "drizzle-orm";
import {
  accessAssignments,
  auditLogs,
  evidenceFiles,
  institutions,
  invitations,
  notifications,
  placements,
  portfolioEntries,
  portfolioRequirements,
  reviews,
  submissionVersions,
  users,
  type AccessRole,
} from "../drizzle/schema";
import * as db from "./db";
import { applicationProcedure, requireRoles } from "./authz";
import {
  canAccessPortfolioRecord,
  canChangeAssignmentStatus,
  canDecideSubmission,
  canManageInstitution,
} from "./authz-policy";
import {
  validPortfolioLink,
  validatePortfolioSubmission,
} from "./portfolio-validation";
import {
  evidenceIdsFromSnapshot,
} from "./evidence-policy";
import { REVIEW_RUBRIC } from "../shared/review-rubric";
import {
  affectedRowCount,
  createSubmissionSnapshot,
  nextSubmissionVersion,
  prepareReviewDecision,
  ReviewWorkflowError,
  startReviewStatus,
} from "./review-workflow";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { changePassword, clearAuthCookies, establishSupabaseSession, REFRESH_COOKIE, registerAccount, revokeSession, sendPasswordReset, signInAccount, supabaseIdentity } from "./supabase-auth";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const kindSchema = z.enum([
  "scheme",
  "lesson",
  "reflection",
  "evidence",
  "observation",
  "supporting_document",
  "final_report",
]);
const decisionSchema = z.enum(["revision_required", "approved", "rejected"]);
const entrySelect = {
  id: portfolioEntries.id,
  institutionId: portfolioEntries.institutionId,
  userId: portfolioEntries.userId,
  kind: portfolioEntries.kind,
  title: portfolioEntries.title,
  subject: portfolioEntries.subject,
  className: portfolioEntries.className,
  lessonDate: portfolioEntries.lessonDate,
  status: portfolioEntries.status,
  version: portfolioEntries.version,
  payload: portfolioEntries.payload,
  createdAt: portfolioEntries.createdAt,
  updatedAt: portfolioEntries.updatedAt,
};

async function scopedEntry(
  id: number,
  institutionId: number,
  ownerId?: number
) {
  const database = await db.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Database is unavailable.",
    });
  const rows = await database
    .select()
    .from(portfolioEntries)
    .where(
      and(
        eq(portfolioEntries.id, id),
        eq(portfolioEntries.institutionId, institutionId),
        ...(ownerId ? [eq(portfolioEntries.userId, ownerId)] : [])
      )
    )
    .limit(1);
  if (!rows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Portfolio entry not found.",
    });
  return rows[0];
}

async function assertOwnedLinkedEntry(
  database: NonNullable<Awaited<ReturnType<typeof db.getDb>>>,
  input: {
    institutionId: number;
    userId: number;
    kind: string;
    payload: Record<string, unknown>;
  }
) {
  const linkedId = validPortfolioLink(input.payload.linkedEntryId);
  if (linkedId === null) return;
  if (linkedId === "invalid")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The linked portfolio record is invalid.",
    });
  const allowedKinds =
    input.kind === "lesson"
      ? ["scheme"]
      : input.kind === "reflection"
        ? ["lesson", "scheme"]
        : input.kind === "evidence"
          ? ["lesson", "scheme", "reflection"]
          : [];
  if (!allowedKinds.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This portfolio category cannot link to another record.",
    });
  const linked = await database
    .select({ id: portfolioEntries.id })
    .from(portfolioEntries)
    .where(
      and(
        eq(portfolioEntries.id, linkedId),
        eq(portfolioEntries.institutionId, input.institutionId),
        eq(portfolioEntries.userId, input.userId),
        inArray(
          portfolioEntries.kind,
          allowedKinds as (typeof portfolioEntries.$inferSelect.kind)[]
        )
      )
    )
    .limit(1);
  if (!linked.length)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The linked record is unavailable in your portfolio.",
    });
}

async function canReadEntry(
  ctx: {
    user: { id: number };
    appAccess: { institutionId: number | null; roles: AccessRole[] };
  },
  entry: { institutionId: number; userId: number }
) {
  const assignedReviewer =
    ctx.appAccess.institutionId !== null &&
    ctx.appAccess.roles.some(
      role => role === "supervisor" || role === "lecturer"
    )
      ? await db.verifyReviewerAssignment(
          entry.institutionId,
          entry.userId,
          ctx.user.id
        )
      : false;
  return canAccessPortfolioRecord({
    actorId: ctx.user.id,
    institutionId: ctx.appAccess.institutionId,
    roles: ctx.appAccess.roles,
    recordInstitutionId: entry.institutionId,
    ownerId: entry.userId,
    assignedReviewer,
  });
}

const appRouter = router({
  system: systemRouter,
  auth: router({
    register: publicProcedure.input(z.object({ email: z.string().email().max(320), name: z.string().trim().min(1).max(120), password: z.string().min(12).max(128) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await registerAccount(input, ctx.req, ctx.res);
        if (result.user && !result.requiresEmailConfirmation) {
          const identity = supabaseIdentity(result.user);
          await db.upsertUser({ ...identity, loginMethod: "supabase", lastSignedIn: new Date() });
        }
        return { success: true, requiresEmailConfirmation: result.requiresEmailConfirmation } as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Account registration failed.";
        if (message.toLowerCase().includes("already registered")) throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),
    login: publicProcedure.input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      let authUser;
      try { authUser = await signInAccount(input.email, input.password, ctx.req, ctx.res); }
      catch { throw new TRPCError({ code: "UNAUTHORIZED", message: "Email or password is incorrect, or email confirmation is still required." }); }
      const identity = supabaseIdentity(authUser);
      await db.upsertUser({ ...identity, loginMethod: "supabase", lastSignedIn: new Date() });
      return { success: true } as const;
    }),
    confirmSession: publicProcedure.input(z.object({ accessToken: z.string().min(20), refreshToken: z.string().min(20) })).mutation(async ({ ctx, input }) => {
      try {
        const authUser = await establishSupabaseSession(input.accessToken, input.refreshToken, ctx.req, ctx.res);
        await db.upsertUser({ ...supabaseIdentity(authUser), loginMethod: "supabase", lastSignedIn: new Date() });
        return { success: true } as const;
      } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "This email confirmation link is invalid or expired. Request a new link and try again." }); }
    }),
    requestPasswordReset: publicProcedure.input(z.object({ email: z.string().email().max(320) })).mutation(async ({ ctx, input }) => {
      const origin = `${ctx.req.protocol}://${ctx.req.get("host")}`;
      try { await sendPasswordReset(input.email, origin); } catch { /* Keep responses indistinguishable for unknown emails. */ }
      return { success: true } as const;
    }),
    updatePassword: publicProcedure.input(z.object({ accessToken: z.string().min(20), refreshToken: z.string().min(20), password: z.string().min(12).max(128) })).mutation(async ({ ctx, input }) => {
      try {
        const authUser = await changePassword(input.accessToken, input.refreshToken, input.password, ctx.req, ctx.res);
        await db.upsertUser({ ...supabaseIdentity(authUser), loginMethod: "supabase", lastSignedIn: new Date() });
        return { success: true } as const;
      } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "This password reset link is invalid or expired. Request a new one and try again." }); }
    }),
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const access = await db
        .getApplicationAccess(ctx.user.id)
        .catch(() => null);
      return {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        openId: ctx.user.openId,
        activated: Boolean(access),
        institutionId: access?.institutionId ?? null,
        roles: access?.roles ?? [],
      };
    }),
    claimInvitation: protectedProcedure
      .input(z.object({ token: z.string().min(20).max(256) }))
      .mutation(async ({ ctx, input }) => {
        const email = ctx.user.email?.trim().toLowerCase();
        if (!email)
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Your account needs an email address to accept this invitation.",
          });
        const tokenHash = createHash("sha256")
          .update(input.token)
          .digest("hex");
        const invitation = await db.acceptInvitation(
          tokenHash,
          email,
          ctx.user.id
        );
        if (!invitation)
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Invitation is invalid, expired, already used, or not issued to this account.",
          });
        return { success: true };
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
      try { if (cookies[COOKIE_NAME]) await revokeSession(cookies[COOKIE_NAME], cookies[REFRESH_COOKIE]); }
      finally { clearAuthCookies(ctx.res, ctx.req); }
      return { success: true } as const;
    }),
  }),
  portfolio: router({
    overview: applicationProcedure.query(async ({ ctx }) => {
      if (ctx.appAccess.institutionId === null)
        return {
          entries: [],
          requirements: [],
          placement: null,
          tenantName: "Platform administration",
          demoLabel: false,
        };
      const institutionId = ctx.appAccess.institutionId;
      const database = await db.getDb();
      if (!database)
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Database is unavailable.",
        });
      const tenant = await database
        .select({ name: institutions.name, isDemo: institutions.isDemo })
        .from(institutions)
        .where(eq(institutions.id, institutionId))
        .limit(1);
      const privileged = ctx.appAccess.roles.some(role =>
        ["institution_admin", "coordinator", "platform_admin"].includes(role)
      );
      const own = ctx.appAccess.roles.includes("student_teacher");
      const reviewedStudents = ctx.appAccess.roles.some(role =>
        ["supervisor", "lecturer"].includes(role)
      )
        ? await db.assignedStudentIds(institutionId, ctx.user.id)
        : [];
      const visibility = privileged
        ? eq(portfolioEntries.institutionId, institutionId)
        : own
          ? and(
              eq(portfolioEntries.institutionId, institutionId),
              eq(portfolioEntries.userId, ctx.user.id)
            )
          : reviewedStudents.length
            ? and(
                eq(portfolioEntries.institutionId, institutionId),
                inArray(portfolioEntries.userId, reviewedStudents)
              )
            : eq(portfolioEntries.userId, -1);
      const entries = await database
        .select(entrySelect)
        .from(portfolioEntries)
        .where(visibility)
        .orderBy(desc(portfolioEntries.updatedAt))
        .limit(100);
      const requirements = await db.listRequirements(institutionId);
      const placementsForUser = own
        ? await database
            .select()
            .from(placements)
            .where(
              and(
                eq(placements.institutionId, institutionId),
                eq(placements.studentUserId, ctx.user.id)
              )
            )
            .limit(1)
        : [];
      return {
        entries,
        requirements,
        placement: placementsForUser[0] ?? null,
        tenantName: tenant[0]?.name ?? "Institution workspace",
        demoLabel: tenant[0]?.isDemo ?? false,
      };
    }),
    list: applicationProcedure
      .input(
        z
          .object({
            kind: kindSchema.optional(),
            status: z.string().optional(),
            search: z.string().max(100).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        if (ctx.appAccess.institutionId === null) return [];
        const result = await db.getDb();
        if (!result) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const roles = ctx.appAccess.roles;
        const privileged = roles.some(role =>
          ["institution_admin", "coordinator"].includes(role)
        );
        let predicate = eq(
          portfolioEntries.institutionId,
          ctx.appAccess.institutionId
        );
        if (!privileged && roles.includes("student_teacher"))
          predicate = and(predicate, eq(portfolioEntries.userId, ctx.user.id))!;
        else if (
          !privileged &&
          roles.some(role => ["supervisor", "lecturer"].includes(role))
        ) {
          const assigned = await db.assignedStudentIds(
            ctx.appAccess.institutionId,
            ctx.user.id
          );
          predicate = assigned.length
            ? and(predicate, inArray(portfolioEntries.userId, assigned))!
            : and(predicate, eq(portfolioEntries.userId, -1))!;
        } else if (!privileged) return [];
        if (input?.kind)
          predicate = and(predicate, eq(portfolioEntries.kind, input.kind))!;
        if (input?.status)
          predicate = and(
            predicate,
            eq(
              portfolioEntries.status,
              input.status as typeof portfolioEntries.$inferSelect.status
            )
          )!;
        const query = input?.search?.trim();
        if (query) {
          const escaped = query.replace(/[\\%_]/g, "\\$&");
          const pattern = `%${escaped}%`;
          predicate = and(
            predicate,
            or(
              like(portfolioEntries.title, pattern),
              like(portfolioEntries.subject, pattern),
              like(portfolioEntries.className, pattern)
            )
          )!;
        }
        const rows = await result
          .select(entrySelect)
          .from(portfolioEntries)
          .where(predicate)
          .orderBy(desc(portfolioEntries.updatedAt))
          .limit(100);
        return rows;
      }),
    get: applicationProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "NOT_FOUND" });
        const entry = await scopedEntry(input.id, tenant);
        if (!(await canReadEntry(ctx, entry)))
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Portfolio entry not found.",
          });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const versions = await database
          .select()
          .from(submissionVersions)
          .where(
            and(
              eq(submissionVersions.institutionId, tenant),
              eq(submissionVersions.entryId, entry.id)
            )
          )
          .orderBy(desc(submissionVersions.version));
        const currentSnapshot =
          versions.find(version => version.version === entry.version) ?? null;
        const reviewerRole = ctx.appAccess.roles.some(
          role => role === "supervisor" || role === "lecturer"
        );
        if (reviewerRole && !currentSnapshot)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Submitted portfolio version not found.",
          });
        const snapshotRecord = currentSnapshot?.snapshot ?? {};
        const snapshotPayload =
          snapshotRecord.payload &&
          typeof snapshotRecord.payload === "object" &&
          !Array.isArray(snapshotRecord.payload)
            ? (snapshotRecord.payload as Record<string, unknown>)
            : {};
        const snapshotKind = kindSchema.safeParse(snapshotRecord.kind);
        const detailEntry = reviewerRole
          ? {
              ...entry,
              title:
                typeof snapshotRecord.title === "string"
                  ? snapshotRecord.title
                  : "Submitted portfolio item",
              kind: snapshotKind.success ? snapshotKind.data : entry.kind,
              subject:
                typeof snapshotRecord.subject === "string"
                  ? snapshotRecord.subject
                  : "",
              className:
                typeof snapshotRecord.className === "string"
                  ? snapshotRecord.className
                  : "",
              lessonDate:
                typeof snapshotRecord.lessonDate === "string"
                  ? snapshotRecord.lessonDate
                  : "",
              status: currentSnapshot!.status as typeof entry.status,
              version: currentSnapshot!.version,
              payload: snapshotPayload,
              updatedAt: currentSnapshot!.submittedAt,
            }
          : entry;
        const history = await database
          .select({
            id: reviews.id,
            institutionId: reviews.institutionId,
            entryId: reviews.entryId,
            submissionVersion: reviews.submissionVersion,
            reviewerUserId: reviews.reviewerUserId,
            reviewerName: users.name,
            decision: reviews.decision,
            comments: reviews.comments,
            rubric: reviews.rubric,
            createdAt: reviews.createdAt,
          })
          .from(reviews)
          .innerJoin(users, eq(reviews.reviewerUserId, users.id))
          .where(
            and(
              eq(reviews.institutionId, tenant),
              eq(reviews.entryId, entry.id)
            )
          )
          .orderBy(asc(reviews.createdAt), asc(reviews.id));
        const allFiles = await database
          .select({
            id: evidenceFiles.id,
            fileName: evidenceFiles.fileName,
            mimeType: evidenceFiles.mimeType,
            byteSize: evidenceFiles.byteSize,
            createdAt: evidenceFiles.createdAt,
          })
          .from(evidenceFiles)
          .where(
            and(
              eq(evidenceFiles.institutionId, tenant),
              eq(evidenceFiles.entryId, entry.id)
            )
          );
        const submittedEvidenceIds = new Set(
          versions.flatMap(version => evidenceIdsFromSnapshot(version.snapshot))
        );
        const files = reviewerRole
          ? allFiles.filter(file => submittedEvidenceIds.has(file.id))
          : allFiles;
        const linkedPayload = reviewerRole ? snapshotPayload : entry.payload;
        const linkedId = validPortfolioLink(linkedPayload.linkedEntryId);
        let linkedEntry: {
          id: number;
          title: string;
          kind: typeof entry.kind;
        } | null = null;
        if (linkedId && linkedId !== "invalid") {
          if (reviewerRole) {
            const linkedRows = await database
              .select({
                id: portfolioEntries.id,
                currentKind: portfolioEntries.kind,
                snapshot: submissionVersions.snapshot,
              })
              .from(portfolioEntries)
              .innerJoin(
                submissionVersions,
                and(
                  eq(submissionVersions.entryId, portfolioEntries.id),
                  eq(
                    submissionVersions.institutionId,
                    portfolioEntries.institutionId
                  ),
                  eq(submissionVersions.version, portfolioEntries.version)
                )
              )
              .where(
                and(
                  eq(portfolioEntries.id, linkedId),
                  eq(portfolioEntries.institutionId, tenant),
                  eq(portfolioEntries.userId, entry.userId)
                )
              )
              .limit(1);
            const linked = linkedRows[0];
            if (linked) {
              const submitted = linked.snapshot;
              const submittedKind = kindSchema.safeParse(submitted.kind);
              linkedEntry = {
                id: linked.id,
                title:
                  typeof submitted.title === "string"
                    ? submitted.title
                    : "Submitted linked record",
                kind: submittedKind.success
                  ? submittedKind.data
                  : linked.currentKind,
              };
            }
          } else {
            const linkedRows = await database
              .select({
                id: portfolioEntries.id,
                title: portfolioEntries.title,
                kind: portfolioEntries.kind,
              })
              .from(portfolioEntries)
              .where(
                and(
                  eq(portfolioEntries.id, linkedId),
                  eq(portfolioEntries.institutionId, tenant),
                  eq(portfolioEntries.userId, entry.userId)
                )
              )
              .limit(1);
            linkedEntry = linkedRows[0] ?? null;
          }
        }
        return {
          entry: detailEntry,
          currentSnapshot,
          versions,
          history,
          files,
          linkedEntry,
        };
      }),
    saveDraft: requireRoles("student_teacher")
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          kind: kindSchema,
          title: z.string().trim().min(3).max(220),
          subject: z.string().max(140).default(""),
          className: z.string().max(100).default(""),
          lessonDate: z.string().max(10).default(""),
          payload: z.record(z.string(), z.unknown()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        if (Buffer.byteLength(JSON.stringify(input.payload), "utf8") > 100_000)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Portfolio text and structured rows are limited to 100 KB per record.",
          });
        await assertOwnedLinkedEntry(database, {
          institutionId: tenant,
          userId: ctx.user.id,
          kind: input.kind,
          payload: input.payload,
        });
        if (input.id) {
          const entry = await scopedEntry(input.id, tenant, ctx.user.id);
          if (!["draft", "revision_required"].includes(entry.status))
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Submitted versions are read-only. Open a revision after feedback.",
            });
          await database
            .update(portfolioEntries)
            .set({
              title: input.title,
              kind: input.kind,
              subject: input.subject,
              className: input.className,
              lessonDate: input.lessonDate,
              payload: input.payload,
            })
            .where(
              and(
                eq(portfolioEntries.id, entry.id),
                eq(portfolioEntries.institutionId, tenant),
                eq(portfolioEntries.userId, ctx.user.id),
                inArray(portfolioEntries.status, ["draft", "revision_required"])
              )
            );
          return { id: entry.id, saved: true };
        }
        const inserted = await database.insert(portfolioEntries).values({
          institutionId: tenant,
          userId: ctx.user.id,
          kind: input.kind,
          title: input.title,
          subject: input.subject,
          className: input.className,
          lessonDate: input.lessonDate,
          payload: input.payload,
          status: "draft",
          version: 1,
        }).returning({ id: portfolioEntries.id });
        return { id: inserted[0]!.id, saved: true };
      }),
    submit: requireRoles("student_teacher")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const entry = await scopedEntry(input.id, tenant, ctx.user.id);
        if (!["draft", "revision_required"].includes(entry.status))
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This version cannot be submitted from its current status.",
          });
        const validationError = validatePortfolioSubmission({
          kind: entry.kind,
          title: entry.title,
          subject: entry.subject,
          className: entry.className,
          lessonDate: entry.lessonDate,
          payload: entry.payload,
        });
        if (validationError)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: validationError,
          });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        await assertOwnedLinkedEntry(database, {
          institutionId: tenant,
          userId: ctx.user.id,
          kind: entry.kind,
          payload: entry.payload,
        });
        let evidenceFileIds: number[] = [];
        if (entry.kind === "evidence") {
          const files = await database
            .select({ id: evidenceFiles.id })
            .from(evidenceFiles)
            .where(
              and(
                eq(evidenceFiles.entryId, entry.id),
                eq(evidenceFiles.institutionId, tenant),
                eq(evidenceFiles.uploaderUserId, ctx.user.id)
              )
            );
          if (!files.length)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Upload at least one authorized evidence file before submission.",
            });
          evidenceFileIds = files.map(file => file.id);
        }
        const transition = nextSubmissionVersion({
          status: entry.status as "draft" | "revision_required",
          version: entry.version,
        });
        const { version, status } = transition;
        const snapshot = createSubmissionSnapshot({
          entry,
          version,
          evidenceFileIds,
        });
        await database.transaction(async tx => {
          const updateResult = await tx
            .update(portfolioEntries)
            .set({ version, status })
            .where(
              and(
                eq(portfolioEntries.id, entry.id),
                eq(portfolioEntries.institutionId, tenant),
                eq(portfolioEntries.userId, ctx.user.id),
                eq(portfolioEntries.version, entry.version),
                eq(
                  portfolioEntries.status,
                  entry.status as "draft" | "revision_required"
                )
              )
            ).returning({ id: portfolioEntries.id });
          if (affectedRowCount(updateResult) !== 1)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The portfolio item changed. Refresh and submit the current version.",
            });
          await tx.insert(submissionVersions).values({
            institutionId: tenant,
            entryId: entry.id,
            version,
            snapshot,
            status,
          });
          const placementsForStudent = await tx
            .select({
              supervisorId: placements.supervisorUserId,
              lecturerId: placements.lecturerUserId,
            })
            .from(placements)
            .where(
              and(
                eq(placements.institutionId, tenant),
                eq(placements.studentUserId, ctx.user.id)
              )
            );
          const candidateIds = [
            ...new Set(
              placementsForStudent.flatMap(item => [
                item.supervisorId,
                item.lecturerId,
              ])
            ),
          ].filter((id): id is number => Boolean(id) && id !== ctx.user.id);
          const activeReviewers = candidateIds.length
            ? await tx
                .select({ userId: accessAssignments.userId })
                .from(accessAssignments)
                .where(
                  and(
                    eq(accessAssignments.institutionId, tenant),
                    eq(accessAssignments.status, "active"),
                    inArray(accessAssignments.role, ["supervisor", "lecturer"]),
                    inArray(accessAssignments.userId, candidateIds)
                  )
                )
            : [];
          const uniqueReviewerIds = [
            ...new Set(activeReviewers.map(reviewer => reviewer.userId)),
          ];
          if (uniqueReviewerIds.length)
            await tx.insert(notifications).values(
              uniqueReviewerIds.map(reviewerId => ({
                institutionId: tenant,
                userId: reviewerId,
                type: "submission",
                message: `${entry.title} is ready for review.`,
                href: "/reviews",
              }))
            );
        });
        return { success: true, version, submittedAt: new Date() };
      }),
    revise: requireRoles("student_teacher")
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const entry = await scopedEntry(input.id, tenant, ctx.user.id);
        if (entry.status !== "revision_required")
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A revision can only be opened after an authorized reviewer requests one.",
          });
        return {
          id: entry.id,
          revision: entry.version + 1,
          payload: entry.payload,
        };
      }),
  }),
  review: router({
    queue: requireRoles("supervisor", "lecturer").query(async ({ ctx }) => {
      if (ctx.appAccess.institutionId === null) return [];
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const studentIds = await db.assignedStudentIds(
        ctx.appAccess.institutionId,
        ctx.user.id
      );
      const where = studentIds.length
        ? and(
            eq(portfolioEntries.institutionId, ctx.appAccess.institutionId),
            inArray(portfolioEntries.userId, studentIds),
            inArray(portfolioEntries.status, [
              "submitted",
              "resubmitted",
              "under_review",
            ])
          )
        : eq(portfolioEntries.userId, -1);
      const rows = await database
        .select({
          ...entrySelect,
          studentName: users.name,
          submittedSnapshot: submissionVersions.snapshot,
          submittedAt: submissionVersions.submittedAt,
        })
        .from(portfolioEntries)
        .innerJoin(users, eq(portfolioEntries.userId, users.id))
        .innerJoin(
          submissionVersions,
          and(
            eq(submissionVersions.entryId, portfolioEntries.id),
            eq(
              submissionVersions.institutionId,
              portfolioEntries.institutionId
            ),
            eq(submissionVersions.version, portfolioEntries.version),
            inArray(submissionVersions.status, [
              "submitted",
              "resubmitted",
              "under_review",
            ])
          )
        )
        .where(where)
        .orderBy(desc(portfolioEntries.updatedAt))
        .limit(100);
      return rows.map(({ submittedSnapshot, submittedAt, ...entry }) => {
        const snapshot = (submittedSnapshot ?? {}) as Record<string, unknown>;
        const payload =
          snapshot.payload &&
          typeof snapshot.payload === "object" &&
          !Array.isArray(snapshot.payload)
            ? (snapshot.payload as Record<string, unknown>)
            : {};
        return {
          ...entry,
          title:
            typeof snapshot.title === "string" ? snapshot.title : entry.title,
          kind: typeof snapshot.kind === "string" ? snapshot.kind : entry.kind,
          subject:
            typeof snapshot.subject === "string"
              ? snapshot.subject
              : entry.subject,
          className:
            typeof snapshot.className === "string"
              ? snapshot.className
              : entry.className,
          lessonDate:
            typeof snapshot.lessonDate === "string"
              ? snapshot.lessonDate
              : entry.lessonDate,
          version:
            typeof snapshot.version === "number"
              ? snapshot.version
              : entry.version,
          payload,
          submittedAt,
        };
      });
    }),
    start: requireRoles("supervisor", "lecturer")
      .input(z.object({ entryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "NOT_FOUND" });
        const entry = await scopedEntry(input.entryId, tenant);
        const assignedReviewer = await db.verifyReviewerAssignment(
          tenant,
          entry.userId,
          ctx.user.id
        );
        if (
          !canDecideSubmission({
            actorId: ctx.user.id,
            ownerId: entry.userId,
            institutionAllowed:
              ctx.appAccess.institutionId === entry.institutionId,
            assignedReviewer,
            roles: ctx.appAccess.roles,
          })
        )
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "This student is not assigned to you, or this review is not permitted.",
          });
        let transition: ReturnType<typeof startReviewStatus>;
        try {
          transition = startReviewStatus(entry.status);
        } catch (error) {
          if (error instanceof ReviewWorkflowError)
            throw new TRPCError({ code: error.code, message: error.message });
          throw error;
        }
        if (!transition.changed)
          return {
            success: true,
            status: transition.status,
            alreadyStarted: true,
          };
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        await database.transaction(async tx => {
          const updateEntry = await tx
            .update(portfolioEntries)
            .set({ status: transition.status })
            .where(
              and(
                eq(portfolioEntries.id, entry.id),
                eq(portfolioEntries.institutionId, tenant),
                eq(portfolioEntries.version, entry.version),
                eq(
                  portfolioEntries.status,
                  entry.status as "submitted" | "resubmitted"
                )
              )
            ).returning({ id: portfolioEntries.id });
          if (affectedRowCount(updateEntry) !== 1)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This submission changed. Refresh before beginning review.",
            });
          const updateSnapshot = await tx
            .update(submissionVersions)
            .set({ status: transition.status })
            .where(
              and(
                eq(submissionVersions.institutionId, tenant),
                eq(submissionVersions.entryId, entry.id),
                eq(submissionVersions.version, entry.version),
                inArray(submissionVersions.status, ["submitted", "resubmitted"])
              )
            ).returning({ id: submissionVersions.id });
          if (affectedRowCount(updateSnapshot) !== 1)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The immutable submission snapshot is no longer available for review.",
            });
          await tx.insert(auditLogs).values({
            institutionId: tenant,
            actorUserId: ctx.user.id,
            action: "submission_under_review",
            targetType: "portfolio_entry",
            targetId: String(entry.id),
            detail: `Version ${entry.version}`,
          });
        });
        return {
          success: true,
          status: transition.status,
          alreadyStarted: false,
        };
      }),
    decide: requireRoles("supervisor", "lecturer")
      .input(
        z.object({
          entryId: z.number().int().positive(),
          decision: decisionSchema,
          comments: z.string().trim().min(3).max(5000),
          rubricScores: z
            .array(
              z.object({
                criterionId: z.string().min(1).max(64),
                score: z.number().int().min(1).max(4),
                comment: z.string().max(1000).optional(),
              })
            )
            .length(REVIEW_RUBRIC.length),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "NOT_FOUND" });
        const entry = await scopedEntry(input.entryId, tenant);
        const assignedReviewer = await db.verifyReviewerAssignment(
          tenant,
          entry.userId,
          ctx.user.id
        );
        let prepared;
        try {
          prepared = prepareReviewDecision({
            actorId: ctx.user.id,
            ownerId: entry.userId,
            institutionId: ctx.appAccess.institutionId,
            recordInstitutionId: entry.institutionId,
            assignedReviewer,
            roles: ctx.appAccess.roles,
            status: entry.status,
            version: entry.version,
            decision: input.decision,
            comments: input.comments,
            rubricScores: input.rubricScores,
          });
        } catch (error) {
          if (error instanceof ReviewWorkflowError)
            throw new TRPCError({ code: error.code, message: error.message });
          throw error;
        }
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        await database.transaction(async tx => {
          const updateEntry = await tx
            .update(portfolioEntries)
            .set({ status: prepared.status })
            .where(
              and(
                eq(portfolioEntries.id, entry.id),
                eq(portfolioEntries.institutionId, tenant),
                eq(portfolioEntries.version, prepared.submissionVersion),
                inArray(portfolioEntries.status, [
                  "submitted",
                  "resubmitted",
                  "under_review",
                ])
              )
            ).returning({ id: portfolioEntries.id });
          if (affectedRowCount(updateEntry) !== 1)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This submission version was already reviewed or has changed.",
            });
          const updateVersion = await tx
            .update(submissionVersions)
            .set({ status: prepared.status })
            .where(
              and(
                eq(submissionVersions.institutionId, tenant),
                eq(submissionVersions.entryId, entry.id),
                eq(submissionVersions.version, prepared.submissionVersion),
                inArray(submissionVersions.status, [
                  "submitted",
                  "resubmitted",
                  "under_review",
                ])
              )
            ).returning({ id: submissionVersions.id });
          if (affectedRowCount(updateVersion) !== 1)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The immutable submission snapshot is no longer awaiting review.",
            });
          await tx.insert(reviews).values({
            institutionId: tenant,
            entryId: entry.id,
            submissionVersion: prepared.submissionVersion,
            reviewerUserId: ctx.user.id,
            decision: prepared.status,
            comments: prepared.comments,
            rubric: prepared.rubric,
          });
          await tx.insert(notifications).values({
            institutionId: tenant,
            userId: entry.userId,
            type: prepared.status,
            message:
              `${entry.title}: ${prepared.status.replaceAll("_", " ")}. ${prepared.comments}`.slice(
                0,
                500
              ),
            href: "/submissions",
          });
          await tx.insert(auditLogs).values({
            institutionId: tenant,
            actorUserId: ctx.user.id,
            action: `submission_${prepared.status}`,
            targetType: "portfolio_entry",
            targetId: String(entry.id),
            detail: `Version ${prepared.submissionVersion}; rubric ${prepared.rubric.rubricVersion}; score ${prepared.rubric.totalScore}/${prepared.rubric.maximumScore}`,
          });
        });
        return { success: true };
      }),
  }),
  placement: router({
    mine: applicationProcedure.query(async ({ ctx }) => {
      if (ctx.appAccess.institutionId === null) return null;
      if (!ctx.appAccess.roles.includes("student_teacher"))
        throw new TRPCError({ code: "FORBIDDEN" });
      return db.getPlacementForStudent(
        ctx.appAccess.institutionId,
        ctx.user.id
      );
    }),
  }),
  notifications: router({
    mine: applicationProcedure.query(async ({ ctx }) =>
      ctx.appAccess.institutionId === null
        ? []
        : db.listNotifications(ctx.user.id, ctx.appAccess.institutionId)
    ),
    markRead: applicationProcedure
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          all: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.appAccess.institutionId === null) return { count: 0 };
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const where = input.all
          ? and(
              eq(notifications.userId, ctx.user.id),
              eq(notifications.institutionId, ctx.appAccess.institutionId)
            )
          : and(
              eq(notifications.userId, ctx.user.id),
              eq(notifications.institutionId, ctx.appAccess.institutionId),
              eq(notifications.id, input.id ?? -1)
            );
        await database
          .update(notifications)
          .set({ readAt: new Date() })
          .where(where);
        return { count: 1 };
      }),
  }),
  admin: router({
    requirements: requireRoles("coordinator", "institution_admin").query(
      async ({ ctx }) => {
        if (ctx.appAccess.institutionId === null)
          throw new TRPCError({ code: "FORBIDDEN" });
        return db.listRequirements(ctx.appAccess.institutionId);
      }
    ),
    updateRequirement: requireRoles("coordinator", "institution_admin")
      .input(
        z.object({
          id: z.number().int().positive(),
          requiredCount: z.number().int().min(0).max(100),
          required: z.boolean(),
          deadline: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const existing = await database
          .select()
          .from(portfolioRequirements)
          .where(
            and(
              eq(portfolioRequirements.id, input.id),
              eq(portfolioRequirements.institutionId, tenant)
            )
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });
        await database
          .update(portfolioRequirements)
          .set({
            requiredCount: input.requiredCount,
            required: input.required,
            deadline: input.deadline,
          })
          .where(
            and(
              eq(portfolioRequirements.id, input.id),
              eq(portfolioRequirements.institutionId, tenant)
            )
          );
        await db.writeAudit({
          institutionId: tenant,
          actorUserId: ctx.user.id,
          action: "portfolio_requirement_updated",
          targetType: "portfolio_requirement",
          targetId: String(input.id),
          detail: `Required=${input.required}; count=${input.requiredCount}; deadline=${input.deadline ?? "none"}`,
        });
        return { success: true };
      }),
    institutions: requireRoles("platform_admin").query(async ({ ctx }) => {
      if (
        !canManageInstitution({
          actorInstitutionId: ctx.appAccess.institutionId,
          actorRoles: ctx.appAccess.roles,
        })
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      return database
        .select({
          id: institutions.id,
          name: institutions.name,
          code: institutions.code,
          active: institutions.active,
          isDemo: institutions.isDemo,
          createdAt: institutions.createdAt,
        })
        .from(institutions)
        .orderBy(desc(institutions.createdAt))
        .limit(500);
    }),
    setInstitutionStatus: requireRoles("platform_admin")
      .input(
        z.object({
          institutionId: z.number().int().positive(),
          active: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          !canManageInstitution({
            actorInstitutionId: ctx.appAccess.institutionId,
            actorRoles: ctx.appAccess.roles,
          })
        )
          throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const existing = await database
          .select({ id: institutions.id, name: institutions.name })
          .from(institutions)
          .where(eq(institutions.id, input.institutionId))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });
        await database
          .update(institutions)
          .set({ active: input.active })
          .where(eq(institutions.id, input.institutionId));
        await db.writeAudit({
          institutionId: null,
          actorUserId: ctx.user.id,
          action: input.active
            ? "institution_reactivated"
            : "institution_deactivated",
          targetType: "institution",
          targetId: String(input.institutionId),
          detail: `${existing[0].name}; active=${input.active}`,
        });
        return { success: true };
      }),
    createInstitution: requireRoles("platform_admin")
      .input(
        z.object({
          name: z.string().trim().min(3).max(220),
          code: z
            .string()
            .trim()
            .regex(/^[A-Z0-9-]{2,40}$/),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          !canManageInstitution({
            actorInstitutionId: ctx.appAccess.institutionId,
            actorRoles: ctx.appAccess.roles,
          })
        )
          throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const inserted = await database.insert(institutions).values({
          name: input.name,
          code: input.code,
          isDemo: false,
          active: true,
        }).returning({ id: institutions.id });
        const institutionId = inserted[0]!.id;
        await database.insert(portfolioRequirements).values([
          {
            institutionId,
            category: "scheme",
            label: "Scheme of work",
            requiredCount: 1,
            required: true,
          },
          {
            institutionId,
            category: "lesson",
            label: "Lesson plans",
            requiredCount: 4,
            required: true,
          },
          {
            institutionId,
            category: "reflection",
            label: "Reflective journal",
            requiredCount: 4,
            required: true,
          },
          {
            institutionId,
            category: "evidence",
            label: "Teaching evidence",
            requiredCount: 2,
            required: false,
          },
          {
            institutionId,
            category: "final_report",
            label: "Final teaching-practice report",
            requiredCount: 1,
            required: false,
          },
        ]);
        await db.writeAudit({
          institutionId: null,
          actorUserId: ctx.user.id,
          action: "institution_created",
          targetType: "institution",
          targetId: String(institutionId),
          detail: input.name,
        });
        return { institutionId, name: input.name };
      }),
    invitations: requireRoles("institution_admin", "platform_admin")
      .input(
        z
          .object({ institutionId: z.number().int().positive().optional() })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const isPlatformAdmin = ctx.appAccess.roles.includes("platform_admin");
        const tenant = isPlatformAdmin
          ? input?.institutionId
          : ctx.appAccess.institutionId;
        if (
          tenant === null ||
          tenant === undefined ||
          (!isPlatformAdmin &&
            input?.institutionId !== undefined &&
            input.institutionId !== tenant)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Invitation institution is outside your authorized scope.",
          });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const rows = await database
          .select({
            id: invitations.id,
            institutionId: invitations.institutionId,
            email: invitations.email,
            role: invitations.role,
            expiresAt: invitations.expiresAt,
            acceptedAt: invitations.acceptedAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .where(eq(invitations.institutionId, tenant))
          .orderBy(desc(invitations.createdAt))
          .limit(200);
        const now = Date.now();
        return rows.map(row => ({
          ...row,
          status: row.acceptedAt
            ? ("redeemed" as const)
            : row.expiresAt.getTime() <= now
              ? ("expired" as const)
              : ("pending_activation" as const),
        }));
      }),
    invite: requireRoles("institution_admin", "platform_admin")
      .input(
        z.object({
          institutionId: z.number().int().positive().optional(),
          email: z.string().email().max(320),
          role: z.enum([
            "student_teacher",
            "supervisor",
            "lecturer",
            "coordinator",
            "institution_admin",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const isPlatformAdmin = ctx.appAccess.roles.includes("platform_admin");
        const tenant = isPlatformAdmin
          ? input.institutionId
          : ctx.appAccess.institutionId;
        if (
          tenant === null ||
          tenant === undefined ||
          (!isPlatformAdmin &&
            input.institutionId !== undefined &&
            input.institutionId !== tenant)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Invitation institution is outside your authorized scope.",
          });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        if (isPlatformAdmin) {
          const institution = await database
            .select({ id: institutions.id })
            .from(institutions)
            .where(
              and(eq(institutions.id, tenant), eq(institutions.active, true))
            )
            .limit(1);
          if (!institution[0])
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Institution not found.",
            });
          if (input.role !== "institution_admin")
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Platform administrators may only bootstrap an institution administrator invitation.",
            });
        }
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const inserted = await database.insert(invitations).values({
          institutionId: tenant,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdBy: ctx.user.id,
        }).returning({ id: invitations.id });
        await db.writeAudit({
          institutionId: tenant,
          actorUserId: ctx.user.id,
          action: "invitation_created",
          targetType: "invitation",
          targetId: String(inserted[0]!.id),
          detail: `Role ${input.role}; expires in 7 days.`,
        });
        return { token, expiresInDays: 7, delivery: "manual" as const };
      }),
    users: requireRoles("institution_admin").query(async ({ ctx }) => {
      if (ctx.appAccess.institutionId === null)
        throw new TRPCError({ code: "FORBIDDEN" });
      return db.getVisibleUsers(ctx.appAccess.institutionId);
    }),
    setAccountStatus: requireRoles("institution_admin")
      .input(
        z.object({
          assignmentId: z.number().int().positive(),
          status: z.enum(["active", "suspended"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const assignment = await database
          .select()
          .from(accessAssignments)
          .where(
            and(
              eq(accessAssignments.id, input.assignmentId),
              eq(accessAssignments.institutionId, tenant)
            )
          )
          .limit(1);
        if (!assignment[0] || assignment[0].role === "platform_admin")
          throw new TRPCError({ code: "NOT_FOUND" });
        let activeInstitutionAdminCount = 0;
        if (
          assignment[0].role === "institution_admin" &&
          input.status === "suspended"
        ) {
          const countRows = await database
            .select({ total: count() })
            .from(accessAssignments)
            .where(
              and(
                eq(accessAssignments.institutionId, tenant),
                eq(accessAssignments.role, "institution_admin"),
                eq(accessAssignments.status, "active")
              )
            );
          activeInstitutionAdminCount = Number(countRows[0]?.total ?? 0);
        }
        if (
          !canChangeAssignmentStatus({
            actorId: ctx.user.id,
            actorInstitutionId: ctx.appAccess.institutionId,
            actorRoles: ctx.appAccess.roles,
            targetUserId: assignment[0].userId,
            targetInstitutionId: assignment[0].institutionId,
            targetRole: assignment[0].role,
            currentStatus: assignment[0].status,
            nextStatus: input.status,
            activeInstitutionAdminCount,
          })
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "This assignment cannot be changed in your scope. Administrators cannot change their own assignment or suspend the last active institution administrator.",
          });
        await database
          .update(accessAssignments)
          .set({ status: input.status })
          .where(
            and(
              eq(accessAssignments.id, input.assignmentId),
              eq(accessAssignments.institutionId, tenant)
            )
          );
        await db.writeAudit({
          institutionId: tenant,
          actorUserId: ctx.user.id,
          action:
            input.status === "suspended"
              ? "account_suspended"
              : "account_reactivated",
          targetType: "access_assignment",
          targetId: String(input.assignmentId),
          detail: `Assigned role ${assignment[0].role}`,
        });
        return { success: true };
      }),
    audit: requireRoles("institution_admin", "platform_admin").query(
      async ({ ctx }) => {
        const isPlatformAdmin =
          ctx.appAccess.roles.includes("platform_admin") &&
          ctx.appAccess.institutionId === null;
        if (!isPlatformAdmin && ctx.appAccess.institutionId === null)
          throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        return isPlatformAdmin
          ? database
              .select()
              .from(auditLogs)
              .orderBy(desc(auditLogs.createdAt))
              .limit(100)
          : database
              .select()
              .from(auditLogs)
              .where(eq(auditLogs.institutionId, ctx.appAccess.institutionId!))
              .orderBy(desc(auditLogs.createdAt))
              .limit(100);
      }
    ),
  }),
  reports: router({
    csv: requireRoles("coordinator", "institution_admin")
      .input(z.object({ kind: kindSchema.optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.appAccess.institutionId === null)
          throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const where = input?.kind
          ? and(
              eq(portfolioEntries.institutionId, ctx.appAccess.institutionId),
              eq(portfolioEntries.kind, input.kind)
            )
          : eq(portfolioEntries.institutionId, ctx.appAccess.institutionId);
        const rows = await database
          .select(entrySelect)
          .from(portfolioEntries)
          .where(where)
          .orderBy(desc(portfolioEntries.updatedAt));
        const quote = (value: unknown) =>
          `"${String(value ?? "").replaceAll('"', '""')}"`;
        return [
          "id,title,category,subject,class,status,version,updatedAt",
          ...rows.map(row =>
            [
              row.id,
              row.title,
              row.kind,
              row.subject,
              row.className,
              row.status,
              row.version,
              row.updatedAt.toISOString(),
            ]
              .map(quote)
              .join(",")
          ),
        ].join("\n");
      }),
  }),
});

export { appRouter };
export type AppRouter = typeof appRouter;
