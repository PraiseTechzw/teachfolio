import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { and, asc, count, countDistinct, desc, eq, gt, inArray, isNull, like, or, sql } from "drizzle-orm";
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
  userPreferences,
  platformSettings,
  type AccessRole,
} from "../drizzle/schema";
import * as db from "./db";
import { applicationProcedure, requireRoles } from "./authz";
import { csvCell } from "./csv";
import {
  hasActivePlacementRole,
  hasPlacementConflict,
  validPlacementDateRange,
} from "./placement-policy";
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
import { evidenceIdsFromSnapshot } from "./evidence-policy";
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
import { sameOriginUrl } from "./_core/request-origin";
import {
  changePassword,
  clearAuthCookies,
  deleteSupabaseIdentity,
  establishSupabaseSession,
  REFRESH_COOKIE,
  registerAccount,
  revokeSession,
  resendSignupConfirmation as resendSupabaseSignupConfirmation,
  sendPasswordReset,
  signInAccount,
  supabaseIdentity,
} from "./supabase-auth";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  emailNotificationRecipients,
  sendAccessActivatedEmail,
  sendInvitationEmail,
  type NotificationEmail,
} from "./email";

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
const inviteTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{20,256}$/)
  .optional();
const accountHasActiveAssignment = sql`EXISTS (SELECT 1 FROM access_assignments AS aa WHERE aa."userId" = ${users.id} AND aa.status = 'active')`;
const accountHasSuspendedAssignment = sql`EXISTS (SELECT 1 FROM access_assignments AS aa WHERE aa."userId" = ${users.id} AND aa.status = 'suspended')`;
const activeAccountCondition = sql`${users.disabled} = false AND ${users.emailVerified} = true AND ${accountHasActiveAssignment}`;
const deletedAccountCondition = eq(users.loginMethod, "deleted");
const suspendedAccountCondition = sql`${users.loginMethod} <> 'deleted' AND (${users.disabled} = true OR (NOT ${accountHasActiveAssignment} AND ${accountHasSuspendedAssignment}))`;
const pendingAccountCondition = sql`${users.loginMethod} <> 'deleted' AND ${users.disabled} = false AND (${users.emailVerified} = false OR (NOT ${accountHasActiveAssignment} AND NOT ${accountHasSuspendedAssignment}))`;
const dayAfter = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
};
function authRedirectUrl(origin: string, inviteToken?: string) {
  const url = new URL("/", origin);
  if (inviteToken) url.searchParams.set("invite", inviteToken);
  return url.toString();
}
const placementInput = z
  .object({
    id: z.number().int().positive().optional(),
    studentUserId: z.number().int().positive(),
    schoolName: z.string().trim().min(2).max(220),
    schoolLocation: z.string().trim().min(2).max(220),
    programme: z.string().trim().min(2).max(180),
    cohort: z.string().trim().max(100).default(""),
    studentNumber: z.string().trim().min(1).max(80),
    subject: z.string().trim().min(2).max(140),
    classes: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    supervisorUserId: z.number().int().positive().nullable(),
    lecturerUserId: z.number().int().positive().nullable(),
    status: z.enum(["active", "completed", "upcoming"]),
  })
  .superRefine((input, context) => {
    if (!validPlacementDateRange(input.startDate, input.endDate))
      context.addIssue({
        code: "custom",
        message:
          "Placement dates must be valid calendar dates with the end date on or after the start date.",
      });
    if (
      new Set(input.classes.map(value => value.toLowerCase())).size !==
      input.classes.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Class names must be unique.",
      });
    }
    if (input.supervisorUserId === null && input.lecturerUserId === null) {
      context.addIssue({
        code: "custom",
        message: "Assign at least one active supervisor or lecturer.",
        path: ["supervisorUserId"],
      });
    }
  });
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
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          name: z.string().trim().min(1).max(120),
          password: z.string().min(12).max(128),
          inviteToken: inviteTokenSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await registerAccount(input, ctx.req, ctx.res);
          if (result.user && !result.requiresEmailConfirmation) {
            const identity = supabaseIdentity(result.user);
            await db.upsertUser({
              ...identity,
              loginMethod: "supabase",
              lastSignedIn: new Date(),
            });
          }
          return {
            success: true,
            requiresEmailConfirmation: result.requiresEmailConfirmation,
          } as const;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Account registration failed.";
          if (message.toLowerCase().includes("already registered"))
            throw new TRPCError({
              code: "CONFLICT",
              message: "An account with this email already exists.",
            });
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          password: z.string().min(1).max(128),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let authUser;
        try {
          authUser = await signInAccount(
            input.email,
            input.password,
            ctx.req,
            ctx.res
          );
        } catch {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Email or password is incorrect, or email confirmation is still required.",
          });
        }
        const identity = supabaseIdentity(authUser);
        await db.upsertUser({
          ...identity,
          loginMethod: "supabase",
          lastSignedIn: new Date(),
        });
        return { success: true } as const;
      }),
    confirmSession: publicProcedure
      .input(
        z.object({
          accessToken: z.string().min(20),
          refreshToken: z.string().min(20),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const authUser = await establishSupabaseSession(
            input.accessToken,
            input.refreshToken,
            ctx.req,
            ctx.res
          );
          await db.upsertUser({
            ...supabaseIdentity(authUser),
            loginMethod: "supabase",
            lastSignedIn: new Date(),
          });
          return { success: true } as const;
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This email confirmation link is invalid or expired. Request a new link and try again.",
          });
        }
      }),
    requestPasswordReset: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          inviteToken: inviteTokenSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const origin = sameOriginUrl(ctx.req);
        try {
          if (origin)
            await sendPasswordReset(
              input.email,
              authRedirectUrl(origin, input.inviteToken)
            );
        } catch {
          /* Keep responses indistinguishable for unknown emails. */
        }
        return { success: true } as const;
      }),
    resendSignupConfirmation: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          inviteToken: inviteTokenSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const origin = sameOriginUrl(ctx.req);
        try {
          if (origin)
            await resendSupabaseSignupConfirmation(
              input.email,
              authRedirectUrl(origin, input.inviteToken)
            );
        } catch {
          // Keep the response indistinguishable for unknown or confirmed emails.
        }
        return { success: true } as const;
      }),
    updatePassword: publicProcedure
      .input(
        z.object({
          accessToken: z.string().min(20),
          refreshToken: z.string().min(20),
          password: z.string().min(12).max(128),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const authUser = await changePassword(
            input.accessToken,
            input.refreshToken,
            input.password,
            ctx.req,
            ctx.res
          );
          await db.upsertUser({
            ...supabaseIdentity(authUser),
            loginMethod: "supabase",
            lastSignedIn: new Date(),
          });
          return { success: true } as const;
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This password reset link is invalid or expired. Request a new one and try again.",
          });
        }
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
        institutionName: access?.institutionId ? (await (await db.getDb())?.select({ name: institutions.name }).from(institutions).where(eq(institutions.id, access.institutionId)).limit(1))?.[0]?.name ?? null : null,
      };
    }),
    updateProfile: applicationProcedure.input(z.object({ name: z.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      await database.update(users).set({ name: input.name }).where(eq(users.id, ctx.user.id));
      await db.writeAudit({ institutionId: ctx.appAccess.institutionId, actorUserId: ctx.user.id, action: "profile_name_updated", targetType: "user", targetId: String(ctx.user.id), detail: "Display name changed by account owner." });
      return { success: true };
    }),
    preferences: applicationProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const rows = await database.select().from(userPreferences).where(eq(userPreferences.userId, ctx.user.id)).limit(1);
      return { emailNotifications: rows[0]?.emailNotifications ?? true };
    }),
    updatePreferences: applicationProcedure.input(z.object({ emailNotifications: z.boolean() })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      await database.insert(userPreferences).values({ userId: ctx.user.id, emailNotifications: input.emailNotifications }).onConflictDoUpdate({ target: userPreferences.userId, set: { emailNotifications: input.emailNotifications, updatedAt: new Date() } });
      return { success: true };
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
        try {
          const database = await db.getDb();
          const institution = database
            ? await database
                .select({ name: institutions.name })
                .from(institutions)
                .where(eq(institutions.id, invitation.institutionId))
                .limit(1)
            : [];
          if (institution[0])
            await sendAccessActivatedEmail({
              email,
              role: invitation.role,
              institutionName: institution[0].name,
            });
        } catch (error) {
          console.warn(
            "[Email] Account activation email could not be prepared.",
            error instanceof Error ? error.name : "UnknownError"
          );
        }
        return { success: true };
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
      try {
        if (cookies[COOKIE_NAME])
          await revokeSession(cookies[COOKIE_NAME], cookies[REFRESH_COOKIE]);
      } finally {
        clearAuthCookies(ctx.res, ctx.req);
      }
      return { success: true } as const;
    }),
  }),
  portfolio: router({
    uploadLimit: applicationProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const rows = await database.select().from(platformSettings).where(eq(platformSettings.key, "max_evidence_mib")).limit(1);
      const value = rows[0]?.value?.mib;
      const maxEvidenceMiB = typeof value === "number" && value >= 1 && value <= 25 ? value : 25;
      return { maxEvidenceMiB, maxEvidenceBytes: maxEvidenceMiB * 1024 * 1024 };
    }),
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
        const inserted = await database
          .insert(portfolioEntries)
          .values({
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
          })
          .returning({ id: portfolioEntries.id });
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
        let reviewerRecipientIds: number[] = [];
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
            )
            .returning({ id: portfolioEntries.id });
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
          reviewerRecipientIds = uniqueReviewerIds;
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
        await emailNotificationRecipients({
          institutionId: tenant,
          notifications: reviewerRecipientIds.map(userId => ({
            userId,
            subject: `Submission ready for review: ${entry.title}`,
            heading: "A portfolio submission is ready for review",
            message: `${entry.title} is ready for review.`,
            href: "/reviews",
          })),
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
            )
            .returning({ id: portfolioEntries.id });
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
            )
            .returning({ id: submissionVersions.id });
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
        const notificationMessage =
          `${entry.title}: ${prepared.status.replaceAll("_", " ")}. ${prepared.comments}`.slice(
            0,
            500
          );
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
            )
            .returning({ id: portfolioEntries.id });
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
            )
            .returning({ id: submissionVersions.id });
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
            message: notificationMessage,
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
        await emailNotificationRecipients({
          institutionId: tenant,
          notifications: [
            {
              userId: entry.userId,
              subject: `Portfolio submission ${prepared.status.replaceAll("_", " ")}: ${entry.title}`,
              heading: prepared.status === "revision_required"
                ? "Your submission needs a revision"
                : prepared.status === "approved"
                  ? "Your portfolio submission was approved"
                  : "Your portfolio submission was reviewed",
              message: notificationMessage,
              href: "/submissions",
            },
          ],
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
    dashboardSummary: requireRoles("institution_admin").query(async ({ ctx }) => {
      const tenant = ctx.appAccess.institutionId;
      if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const now = new Date();
      const [activeAssignments, pendingInvitations, activePlacements, unassignedPlacements, portfolioStatuses] = await Promise.all([
        database.select({ total: count() }).from(accessAssignments).where(and(eq(accessAssignments.institutionId, tenant), eq(accessAssignments.status, "active"))),
        database.select({ total: count() }).from(invitations).where(and(eq(invitations.institutionId, tenant), isNull(invitations.acceptedAt), gt(invitations.expiresAt, now))),
        database.select({ total: count() }).from(placements).where(and(eq(placements.institutionId, tenant), eq(placements.status, "active"))),
        database.select({ total: count() }).from(placements).where(and(eq(placements.institutionId, tenant), or(isNull(placements.supervisorUserId), isNull(placements.lecturerUserId)))),
        database.select({ status: portfolioEntries.status, total: count() }).from(portfolioEntries).where(eq(portfolioEntries.institutionId, tenant)).groupBy(portfolioEntries.status),
      ]);
      return {
        activeAssignments: Number(activeAssignments[0]?.total ?? 0),
        pendingInvitations: Number(pendingInvitations[0]?.total ?? 0),
        activePlacements: Number(activePlacements[0]?.total ?? 0),
        unassignedPlacements: Number(unassignedPlacements[0]?.total ?? 0),
        portfolioStatuses: portfolioStatuses.map(row => ({ status: row.status, count: Number(row.total) })),
      };
    }),
    placementOptions: requireRoles("coordinator", "institution_admin").query(
      async ({ ctx }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const rows = await database
          .select({
            userId: accessAssignments.userId,
            role: accessAssignments.role,
            name: users.name,
            email: users.email,
          })
          .from(accessAssignments)
          .innerJoin(users, eq(accessAssignments.userId, users.id))
          .where(
            and(
              eq(accessAssignments.institutionId, tenant),
              eq(accessAssignments.status, "active"),
              inArray(accessAssignments.role, [
                "student_teacher",
                "supervisor",
                "lecturer",
              ])
            )
          )
          .orderBy(users.name);
        return {
          students: rows.filter(row => row.role === "student_teacher"),
          supervisors: rows.filter(row => row.role === "supervisor"),
          lecturers: rows.filter(row => row.role === "lecturer"),
        };
      }
    ),
    placements: requireRoles("coordinator", "institution_admin").query(
      async ({ ctx }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const rows = await database
          .select()
          .from(placements)
          .where(eq(placements.institutionId, tenant))
          .orderBy(desc(placements.startDate), desc(placements.id))
          .limit(1000);
        const ids = [
          ...new Set(
            rows
              .flatMap(row => [
                row.studentUserId,
                row.supervisorUserId,
                row.lecturerUserId,
              ])
              .filter((id): id is number => id !== null)
          ),
        ];
        const people = ids.length
          ? await database
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, ids))
          : [];
        const byId = new Map(people.map(person => [person.id, person]));
        return rows.map(row => ({
          ...row,
          studentName: byId.get(row.studentUserId)?.name ?? "Student teacher",
          studentEmail: byId.get(row.studentUserId)?.email ?? "",
          supervisorName: row.supervisorUserId
            ? (byId.get(row.supervisorUserId)?.name ?? "Supervisor")
            : null,
          lecturerName: row.lecturerUserId
            ? (byId.get(row.lecturerUserId)?.name ?? "Lecturer")
            : null,
        }));
      }
    ),
    savePlacement: requireRoles("coordinator", "institution_admin")
      .input(placementInput)
      .mutation(async ({ ctx, input }) => {
        const tenant = ctx.appAccess.institutionId;
        if (tenant === null) throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });

        const verifyAssignment = async (
          userId: number | null,
          role: "student_teacher" | "supervisor" | "lecturer"
        ) => {
          if (userId === null && role !== "student_teacher") return;
          if (userId === null) throw new TRPCError({ code: "BAD_REQUEST" });
          const found = await database
            .select({
              institutionId: accessAssignments.institutionId,
              role: accessAssignments.role,
              status: accessAssignments.status,
            })
            .from(accessAssignments)
            .where(eq(accessAssignments.userId, userId));
          if (!hasActivePlacementRole(found, tenant, role))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Choose an active ${role.replaceAll("_", " ")} assigned to this institution.`,
            });
        };
        await verifyAssignment(input.studentUserId, "student_teacher");
        await verifyAssignment(input.supervisorUserId, "supervisor");
        await verifyAssignment(input.lecturerUserId, "lecturer");

        let placementEmails: NotificationEmail[] = [];
        const result = await database.transaction(async tx => {
          // Serialize writes for a student so two coordinators cannot create
          // duplicate active placement rows at the same time.
          await tx.execute(
            sql`select pg_advisory_xact_lock(${tenant}, ${input.studentUserId})`
          );
          const existingRows = input.id
            ? await tx
                .select()
                .from(placements)
                .where(
                  and(
                    eq(placements.id, input.id),
                    eq(placements.institutionId, tenant)
                  )
                )
                .limit(1)
            : [];
          const existing = existingRows[0];
          if (input.id && !existing)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Placement not found in this institution.",
            });
          const duplicate = await tx
            .select({ id: placements.id })
            .from(placements)
            .where(
              and(
                eq(placements.institutionId, tenant),
                eq(placements.studentUserId, input.studentUserId),
                ...(input.id ? [sql`${placements.id} <> ${input.id}`] : [])
              )
            )
            .limit(1);
          if (
            hasPlacementConflict(
              duplicate.map(row => row.id),
              input.id
            )
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This student already has a placement. Edit the existing placement instead.",
            });

          const values = {
            institutionId: tenant,
            studentUserId: input.studentUserId,
            schoolName: input.schoolName,
            schoolLocation: input.schoolLocation,
            programme: input.programme,
            cohort: input.cohort,
            studentNumber: input.studentNumber,
            subject: input.subject,
            classes: input.classes,
            startDate: input.startDate,
            endDate: input.endDate,
            supervisorUserId: input.supervisorUserId,
            lecturerUserId: input.lecturerUserId,
            status: input.status,
          };
          const changed =
            !existing ||
            Object.entries(values).some(
              ([key, value]) =>
                JSON.stringify(existing[key as keyof typeof existing]) !==
                JSON.stringify(value)
            );
          let placementId: number;
          if (existing) {
            placementId = existing.id;
            if (changed)
              await tx
                .update(placements)
                .set(values)
                .where(
                  and(
                    eq(placements.id, existing.id),
                    eq(placements.institutionId, tenant)
                  )
                );
          } else {
            const inserted = await tx
              .insert(placements)
              .values(values)
              .returning({ id: placements.id });
            placementId = inserted[0]!.id;
          }
          if (changed) {
            const recipients = new Map<
              number,
              { type: string; message: string; href: string }
            >();
            recipients.set(input.studentUserId, {
              type: "placement",
              message: `Your teaching-practice placement at ${input.schoolName} has been ${existing ? "updated" : "assigned"}.`,
              href: "/placement",
            });
            for (const [reviewerId, role] of [
              [input.supervisorUserId, "supervisor"],
              [input.lecturerUserId, "lecturer"],
            ] as const) {
              if (!reviewerId || reviewerId === input.studentUserId) continue;
              recipients.set(reviewerId, {
                type: "placement_assignment",
                message: `You have been assigned as ${role} for ${input.studentUserId}'s teaching-practice placement at ${input.schoolName}.`,
                href: "/reviews",
              });
            }
            await tx.insert(notifications).values(
              [...recipients].map(([userId, notification]) => ({
                institutionId: tenant,
                userId,
                ...notification,
              }))
            );
            placementEmails = [...recipients].map(([userId, notification]) => ({
              userId,
              subject:
                notification.type === "placement_assignment"
                  ? "Teaching-practice reviewer assignment"
                  : "Teaching-practice placement update",
              heading:
                notification.type === "placement_assignment"
                  ? "A reviewer has been assigned to your placement"
                  : "Your teaching-practice placement has been updated",
              message: notification.message,
              href: notification.href,
            }));
            await tx.insert(auditLogs).values({
              institutionId: tenant,
              actorUserId: ctx.user.id,
              action: existing ? "placement_updated" : "placement_created",
              targetType: "placement",
              targetId: String(placementId),
              detail: `Student ${input.studentUserId}; school ${input.schoolName}; supervisor ${input.supervisorUserId ?? "unassigned"}; lecturer ${input.lecturerUserId ?? "unassigned"}.`,
            });
          }
          return { id: placementId, success: true };
        });
        await emailNotificationRecipients({
          institutionId: tenant,
          notifications: placementEmails,
        });
        return result;
      }),
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
          archived: institutions.archived,
          isDemo: institutions.isDemo,
          createdAt: institutions.createdAt,
        })
        .from(institutions)
        .orderBy(desc(institutions.createdAt))
        .limit(500);
    }),
    platformSummary: requireRoles("platform_admin").query(async () => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const [userRows, assignmentRows, invitationRows, entryRows, reviewRows, fileRows, activeUserRows, pendingUserRows, suspendedUserRows, deletedUserRows] = await Promise.all([
        database.select({ total: count() }).from(users),
        database.select({ total: count() }).from(accessAssignments).where(eq(accessAssignments.status, "active")),
        database.select({ total: count() }).from(invitations).where(and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()))),
        database.select({ total: count() }).from(portfolioEntries).where(inArray(portfolioEntries.status, ["submitted", "under_review", "resubmitted"])),
        database.select({ total: count() }).from(reviews),
        database.select({ total: count(), bytes: sql<number>`coalesce(sum(${evidenceFiles.byteSize}), 0)` }).from(evidenceFiles),
        database.select({ total: count() }).from(users).where(activeAccountCondition),
        database.select({ total: count() }).from(users).where(pendingAccountCondition),
        database.select({ total: count() }).from(users).where(suspendedAccountCondition),
        database.select({ total: count() }).from(users).where(deletedAccountCondition),
      ]);
      return { users: Number(userRows[0]?.total ?? 0), activeAssignments: Number(assignmentRows[0]?.total ?? 0), activeUsers: Number(activeUserRows[0]?.total ?? 0), pendingUsers: Number(pendingUserRows[0]?.total ?? 0), suspendedUsers: Number(suspendedUserRows[0]?.total ?? 0), deletedUsers: Number(deletedUserRows[0]?.total ?? 0), pendingInvitations: Number(invitationRows[0]?.total ?? 0), pendingSubmissions: Number(entryRows[0]?.total ?? 0), reviews: Number(reviewRows[0]?.total ?? 0), evidenceFiles: Number(fileRows[0]?.total ?? 0), evidenceBytes: Number(fileRows[0]?.bytes ?? 0) };
    }),
    platformConfiguration: requireRoles("platform_admin").query(async () => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const rows = await database.select().from(platformSettings).where(inArray(platformSettings.key, ["invitation_expiry_days", "max_evidence_mib"]));
      const expiry = rows.find(row => row.key === "invitation_expiry_days")?.value;
      const maxEvidence = rows.find(row => row.key === "max_evidence_mib")?.value;
      return { invitationExpiryDays: typeof expiry?.days === "number" ? expiry.days : 7, maxEvidenceMiB: typeof maxEvidence?.mib === "number" ? maxEvidence.mib : 25 };
    }),
    updatePlatformConfiguration: requireRoles("platform_admin").input(z.object({ invitationExpiryDays: z.number().int().min(1).max(30), maxEvidenceMiB: z.number().int().min(1).max(25) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      await database.insert(platformSettings).values({ key: "invitation_expiry_days", value: { days: input.invitationExpiryDays }, updatedBy: ctx.user.id }).onConflictDoUpdate({ target: platformSettings.key, set: { value: { days: input.invitationExpiryDays }, updatedBy: ctx.user.id, updatedAt: new Date() } });
      await database.insert(platformSettings).values({ key: "max_evidence_mib", value: { mib: input.maxEvidenceMiB }, updatedBy: ctx.user.id }).onConflictDoUpdate({ target: platformSettings.key, set: { value: { mib: input.maxEvidenceMiB }, updatedBy: ctx.user.id, updatedAt: new Date() } });
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: "platform_configuration_updated", targetType: "platform_setting", targetId: "platform_defaults", detail: `Invitation expiry ${input.invitationExpiryDays} days; evidence upload cap ${input.maxEvidenceMiB} MiB.` });
      return { success: true };
    }),
    platformUsers: requireRoles("platform_admin").input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(10).max(100).default(25), search: z.string().trim().max(120).default(""), role: z.enum(["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin", "platform_admin"]).optional(), status: z.enum(["active", "pending", "suspended", "deleted"]).optional(), verified: z.enum(["all", "verified", "unverified"]).default("all"), registeredFrom: z.string().date().optional(), registeredTo: z.string().date().optional(), sort: z.enum(["newest", "oldest", "last_sign_in"]).default("newest") }).default({ page: 1, pageSize: 25, search: "", verified: "all", sort: "newest" })).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const search = `%${input.search.toLowerCase()}%`;
      const conditions = [
        input.search ? sql`(lower(coalesce(${users.name}, '')) LIKE ${search} OR lower(coalesce(${users.email}, '')) LIKE ${search} OR lower(coalesce(${users.phone}, '')) LIKE ${search} OR cast(${users.id} as text) LIKE ${search})` : undefined,
        input.role ? eq(accessAssignments.role, input.role) : undefined,
        input.verified === "verified" ? eq(users.emailVerified, true) : input.verified === "unverified" ? eq(users.emailVerified, false) : undefined,
        input.status === "active" ? and(eq(users.disabled, false), eq(accessAssignments.status, "active"), eq(users.emailVerified, true)) : undefined,
        input.status === "pending" ? pendingAccountCondition : undefined,
        input.status === "suspended" ? suspendedAccountCondition : undefined,
        input.status === "deleted" ? deletedAccountCondition : undefined,
        input.registeredFrom ? sql`${users.createdAt} >= ${new Date(`${input.registeredFrom}T00:00:00.000Z`)}` : undefined,
        input.registeredTo ? sql`${users.createdAt} < ${dayAfter(input.registeredTo)}` : undefined,
      ];
      const where = and(...conditions);
      const totalRows = await database.select({ total: countDistinct(users.id) }).from(users).leftJoin(accessAssignments, eq(accessAssignments.userId, users.id)).where(where);
      const order = input.sort === "oldest" ? asc(users.createdAt) : input.sort === "last_sign_in" ? desc(users.lastSignedIn) : desc(users.createdAt);
      const pageRows = await database.select({ userId: users.id, name: users.name, email: users.email, phone: users.phone, emailVerified: users.emailVerified, disabled: users.disabled, deleted: deletedAccountCondition, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).leftJoin(accessAssignments, eq(accessAssignments.userId, users.id)).where(where).groupBy(users.id).orderBy(order).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
      const ids = pageRows.map(row => row.userId);
      const assignmentRows = ids.length ? await database.select({ id: accessAssignments.id, userId: accessAssignments.userId, institutionId: accessAssignments.institutionId, institutionName: institutions.name, role: accessAssignments.role, status: accessAssignments.status }).from(accessAssignments).leftJoin(institutions, eq(accessAssignments.institutionId, institutions.id)).where(inArray(accessAssignments.userId, ids)) : [];
      const rows = pageRows.map(user => ({ ...user, assignments: assignmentRows.filter(assignment => assignment.userId === user.userId) }));
      const totals = await Promise.all([
        database.select({ total: count() }).from(users),
        database.select({ total: count() }).from(users).where(activeAccountCondition),
        database.select({ total: count() }).from(users).where(pendingAccountCondition),
        database.select({ total: count() }).from(users).where(suspendedAccountCondition),
        database.select({ total: count() }).from(users).where(deletedAccountCondition),
      ]);
      return { rows, total: Number(totalRows[0]?.total ?? 0), page: input.page, pageSize: input.pageSize, pages: Math.ceil(Number(totalRows[0]?.total ?? 0) / input.pageSize), metrics: { all: Number(totals[0][0]?.total ?? 0), active: Number(totals[1][0]?.total ?? 0), pending: Number(totals[2][0]?.total ?? 0), suspended: Number(totals[3][0]?.total ?? 0), deleted: Number(totals[4][0]?.total ?? 0) } };
    }),
    platformUserDetails: requireRoles("platform_admin").input(z.object({ userId: z.number().int().positive() })).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const accountRows = await database.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, emailVerified: users.emailVerified, disabled: users.disabled, deleted: deletedAccountCondition, deletionPending: users.deletionPending, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.id, input.userId)).limit(1);
      const account = accountRows[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND" });
      const [assignments, linked] = await Promise.all([
        database.select({ id: accessAssignments.id, institutionId: accessAssignments.institutionId, institutionName: institutions.name, role: accessAssignments.role, status: accessAssignments.status, createdAt: accessAssignments.createdAt }).from(accessAssignments).leftJoin(institutions, eq(accessAssignments.institutionId, institutions.id)).where(eq(accessAssignments.userId, input.userId)),
        database.select({ entries: count() }).from(portfolioEntries).where(eq(portfolioEntries.userId, input.userId)),
      ]);
      const assignmentIds = assignments.map(row => String(row.id));
      const activity = await database.select().from(auditLogs).where(or(and(eq(auditLogs.targetType, "user"), eq(auditLogs.targetId, String(input.userId))), ...(assignmentIds.length ? [and(eq(auditLogs.targetType, "access_assignment"), inArray(auditLogs.targetId, assignmentIds))] : []))).orderBy(desc(auditLogs.createdAt)).limit(100);
      return { ...account, assignments, activity, linkedEntries: Number(linked[0]?.entries ?? 0) };
    }),
    setPlatformUserStatus: requireRoles("platform_admin").input(z.object({ userId: z.number().int().positive(), status: z.enum(["active", "suspended"]), reason: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const target = await database.select({ id: users.id, disabled: users.disabled, email: users.email, deletionPending: users.deletionPending }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (!target[0].email || target[0].deletionPending) throw new TRPCError({ code: "CONFLICT", message: "A deleted or deletion-pending identity cannot be reactivated." });
      const isPlatformAdmin = await database.select({ id: accessAssignments.id }).from(accessAssignments).where(and(eq(accessAssignments.userId, input.userId), eq(accessAssignments.role, "platform_admin"))).limit(1);
      if (isPlatformAdmin.length) throw new TRPCError({ code: "FORBIDDEN", message: "Platform administrator accounts can only be managed through the secured provisioning process." });
      if (input.status === "suspended") {
        const adminAssignments = await database.select({ institutionId: accessAssignments.institutionId }).from(accessAssignments).where(and(eq(accessAssignments.userId, input.userId), eq(accessAssignments.role, "institution_admin"), eq(accessAssignments.status, "active")));
        for (const row of adminAssignments) {
          if (row.institutionId === null) continue;
          const admins = await database.select({ total: count() }).from(accessAssignments).where(and(eq(accessAssignments.institutionId, row.institutionId), eq(accessAssignments.role, "institution_admin"), eq(accessAssignments.status, "active")));
          if (Number(admins[0]?.total ?? 0) <= 1) throw new TRPCError({ code: "CONFLICT", message: "Assign another active institution administrator before suspending this account." });
        }
      }
      await database.update(users).set({ disabled: input.status === "suspended" }).where(eq(users.id, input.userId));
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: input.status === "suspended" ? "platform_user_suspended" : "platform_user_reactivated", targetType: "user", targetId: String(input.userId), detail: input.reason });
      return { success: true };
    }),
    deletePlatformUser: requireRoles("platform_admin").input(z.object({ userId: z.number().int().positive(), confirmation: z.string().trim().min(1).max(320), reason: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete your own account." });
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const rows = await database.select({ openId: users.openId, email: users.email, deletionPending: users.deletionPending }).from(users).where(eq(users.id, input.userId)).limit(1);
      const target = rows[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (!target.email && !target.deletionPending) throw new TRPCError({ code: "CONFLICT", message: "This account has no email identity to verify for deletion." });
      const platformRole = await database.select({ id: accessAssignments.id }).from(accessAssignments).where(and(eq(accessAssignments.userId, input.userId), eq(accessAssignments.role, "platform_admin"))).limit(1);
      if (platformRole.length) throw new TRPCError({ code: "FORBIDDEN", message: "Platform administrator accounts must be removed through the secured provisioning process." });
      const expected = target.email?.toLowerCase() ?? `delete ${input.userId}`;
      if (input.confirmation.trim().toLowerCase() !== expected) throw new TRPCError({ code: "BAD_REQUEST", message: "Confirmation did not match the account email or required deletion code." });
      const adminAssignments = await database.select({ institutionId: accessAssignments.institutionId }).from(accessAssignments).where(and(eq(accessAssignments.userId, input.userId), eq(accessAssignments.role, "institution_admin"), eq(accessAssignments.status, "active")));
      for (const row of adminAssignments) {
        if (row.institutionId === null) continue;
        const admins = await database.select({ total: count() }).from(accessAssignments).where(and(eq(accessAssignments.institutionId, row.institutionId), eq(accessAssignments.role, "institution_admin"), eq(accessAssignments.status, "active")));
        if (Number(admins[0]?.total ?? 0) <= 1) throw new TRPCError({ code: "CONFLICT", message: "Assign another active institution administrator before deleting this account." });
      }
      await database.transaction(async tx => {
        await tx.update(users).set({ disabled: true, deletionPending: true, name: null, email: null, phone: null, emailVerified: false }).where(eq(users.id, input.userId));
        await tx.update(accessAssignments).set({ status: "suspended" }).where(eq(accessAssignments.userId, input.userId));
        await tx.delete(userPreferences).where(eq(userPreferences.userId, input.userId));
        await tx.delete(notifications).where(eq(notifications.userId, input.userId));
        if (target.email) await tx.update(invitations).set({ email: `deleted-${input.userId}@invalid.example`, expiresAt: new Date(0) }).where(eq(invitations.email, target.email.toLowerCase()));
        await tx.insert(auditLogs).values({ institutionId: null, actorUserId: ctx.user.id, action: "platform_user_deletion_started", targetType: "user", targetId: String(input.userId), detail: input.reason });
      });
      try {
        await deleteSupabaseIdentity(target.openId);
      } catch (error) {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error instanceof Error ? error.message : "Identity deletion failed. The anonymized account is disabled and can be retried." });
      }
      await database.update(users).set({ openId: `deleted-${input.userId}`, loginMethod: "deleted", deletionPending: false }).where(eq(users.id, input.userId));
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: "platform_user_deleted", targetType: "user", targetId: String(input.userId), detail: input.reason });
      return { success: true };
    }),
    changePlatformRole: requireRoles("platform_admin").input(z.object({ assignmentId: z.number().int().positive(), role: z.enum(["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin"]), reason: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const rows = await database.select().from(accessAssignments).where(eq(accessAssignments.id, input.assignmentId)).limit(1);
      const assignment = rows[0];
      if (!assignment || !assignment.institutionId || assignment.role === "platform_admin") throw new TRPCError({ code: "NOT_FOUND" });
      const account = await database.select({ disabled: users.disabled, deletionPending: users.deletionPending }).from(users).where(eq(users.id, assignment.userId)).limit(1);
      if (account[0]?.disabled || account[0]?.deletionPending) throw new TRPCError({ code: "CONFLICT", message: "Roles cannot be changed while an account is suspended or being deleted." });
      if (assignment.role === "institution_admin" && input.role !== "institution_admin" && assignment.status === "active") {
        const admins = await database.select({ total: count() }).from(accessAssignments).where(and(eq(accessAssignments.institutionId, assignment.institutionId), eq(accessAssignments.role, "institution_admin"), eq(accessAssignments.status, "active")));
        if (Number(admins[0]?.total ?? 0) <= 1) throw new TRPCError({ code: "CONFLICT", message: "Assign another active institution administrator before changing this role." });
      }
      const duplicate = await database.select({ id: accessAssignments.id }).from(accessAssignments).where(and(eq(accessAssignments.userId, assignment.userId), eq(accessAssignments.institutionId, assignment.institutionId), eq(accessAssignments.role, input.role))).limit(1);
      if (duplicate.length && duplicate[0]!.id !== assignment.id) throw new TRPCError({ code: "CONFLICT", message: "This user already has that role in this institution." });
      await database.update(accessAssignments).set({ role: input.role, assignedBy: ctx.user.id }).where(eq(accessAssignments.id, assignment.id));
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: "platform_user_role_changed", targetType: "user", targetId: String(assignment.userId), detail: `${assignment.role} → ${input.role}; ${input.reason}` });
      return { success: true };
    }),
    assignPlatformRole: requireRoles("platform_admin").input(z.object({ userId: z.number().int().positive(), institutionId: z.number().int().positive(), role: z.enum(["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin"]), reason: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const [target, institution] = await Promise.all([
        database.select({ emailVerified: users.emailVerified, disabled: users.disabled }).from(users).where(eq(users.id, input.userId)).limit(1),
        database.select({ active: institutions.active, isDemo: institutions.isDemo }).from(institutions).where(eq(institutions.id, input.institutionId)).limit(1),
      ]);
      if (!target[0] || !institution[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (target[0].disabled || !target[0].emailVerified) throw new TRPCError({ code: "CONFLICT", message: "Verify and enable this account before assigning a role." });
      if (!institution[0].active || institution[0].isDemo) throw new TRPCError({ code: "FORBIDDEN", message: "Roles can only be assigned in active institution workspaces." });
      const otherScope = await database.select({ institutionId: accessAssignments.institutionId }).from(accessAssignments).where(and(eq(accessAssignments.userId, input.userId), eq(accessAssignments.status, "active")));
      if (otherScope.some(row => row.institutionId !== input.institutionId)) throw new TRPCError({ code: "CONFLICT", message: "This account already has active access in another institution. Resolve the existing assignment first." });
      const existing = await database.select({ id: accessAssignments.id }).from(accessAssignments).where(and(eq(accessAssignments.userId, input.userId), eq(accessAssignments.institutionId, input.institutionId), eq(accessAssignments.role, input.role))).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "This user already has that institution role." });
      const assignmentStatus = input.role === "institution_admin" ? "active" : "pending";
      const inserted = await database.insert(accessAssignments).values({ userId: input.userId, institutionId: input.institutionId, role: input.role, status: assignmentStatus, assignedBy: ctx.user.id }).returning({ id: accessAssignments.id });
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: "platform_user_role_assigned", targetType: "user", targetId: String(input.userId), detail: `${input.role} assigned for institution ${input.institutionId} as ${assignmentStatus}; ${input.reason}` });
      return { assignmentId: inserted[0]!.id, status: assignmentStatus };
    }),
    platformUserRecovery: requireRoles("platform_admin").input(z.object({ userId: z.number().int().positive(), action: z.enum(["password_reset", "email_verification"]) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const target = await database.select({ email: users.email, verified: users.emailVerified }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]?.email) throw new TRPCError({ code: "NOT_FOUND", message: "Account email is unavailable." });
      const origin = sameOriginUrl(ctx.req);
      if (!origin) throw new TRPCError({ code: "BAD_REQUEST", message: "A same-origin recovery URL could not be prepared." });
      const href = authRedirectUrl(origin);
      if (input.action === "password_reset") await sendPasswordReset(target[0].email, href);
      else await resendSupabaseSignupConfirmation(target[0].email, href);
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: input.action === "password_reset" ? "platform_password_reset_requested" : "platform_email_verification_resent", targetType: "user", targetId: String(input.userId), detail: "Recovery email requested by platform administrator." });
      return { success: true };
    }),
    exportPlatformUsers: requireRoles("platform_admin").input(z.object({ search: z.string().trim().max(120).default(""), role: z.enum(["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin", "platform_admin"]).optional(), status: z.enum(["active", "pending", "suspended", "deleted"]).optional(), verified: z.enum(["all", "verified", "unverified"]).default("all"), registeredFrom: z.string().date().optional(), registeredTo: z.string().date().optional() }).default({ search: "", verified: "all" })).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const term = `%${input.search.toLowerCase()}%`;
      const where = and(input.search ? sql`(lower(coalesce(${users.name}, '')) LIKE ${term} OR lower(coalesce(${users.email}, '')) LIKE ${term} OR lower(coalesce(${users.phone}, '')) LIKE ${term} OR cast(${users.id} as text) LIKE ${term})` : undefined, input.role ? eq(accessAssignments.role, input.role) : undefined, input.verified === "verified" ? eq(users.emailVerified, true) : input.verified === "unverified" ? eq(users.emailVerified, false) : undefined, input.status === "active" ? and(eq(users.disabled, false), eq(users.emailVerified, true), eq(accessAssignments.status, "active")) : undefined, input.status === "pending" ? pendingAccountCondition : undefined, input.status === "suspended" ? suspendedAccountCondition : undefined, input.status === "deleted" ? deletedAccountCondition : undefined, input.registeredFrom ? sql`${users.createdAt} >= ${new Date(`${input.registeredFrom}T00:00:00.000Z`)}` : undefined, input.registeredTo ? sql`${users.createdAt} < ${dayAfter(input.registeredTo)}` : undefined);
      const idRows = await database.selectDistinct({ id: users.id }).from(users).leftJoin(accessAssignments, eq(accessAssignments.userId, users.id)).where(where).orderBy(desc(users.id)).limit(5000);
      const ids = idRows.map(row => row.id);
      const rows = ids.length ? await database.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, emailVerified: users.emailVerified, disabled: users.disabled, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).where(inArray(users.id, ids)).orderBy(desc(users.createdAt)) : [];
      const assignments = ids.length ? await database.select({ userId: accessAssignments.userId, role: accessAssignments.role, status: accessAssignments.status, institutionName: institutions.name }).from(accessAssignments).leftJoin(institutions, eq(accessAssignments.institutionId, institutions.id)).where(inArray(accessAssignments.userId, ids)) : [];
      return ["user_id,name,email,phone,email_verified,disabled,created_at,last_sign_in,roles_and_institutions", ...rows.map(row => [row.id, row.name, row.email, row.phone, row.emailVerified, row.disabled, row.createdAt.toISOString(), row.lastSignedIn.toISOString(), assignments.filter(item => item.userId === row.id).map(item => `${item.institutionName ?? "Platform"}: ${item.role} (${item.status})`).join("; ")].map(value => csvCell(value)).join(","))].join("\n");
    }),
    updateInstitution: requireRoles("platform_admin").input(z.object({ institutionId: z.number().int().positive(), name: z.string().trim().min(3).max(220), code: z.string().trim().regex(/^[A-Z0-9-]{2,40}$/) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const changed = await database.update(institutions).set({ name: input.name, code: input.code }).where(eq(institutions.id, input.institutionId)).returning({ id: institutions.id });
      if (!changed.length) throw new TRPCError({ code: "NOT_FOUND" });
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: "institution_updated", targetType: "institution", targetId: String(input.institutionId), detail: `${input.name} (${input.code})` });
      return { success: true };
    }),
    archiveInstitution: requireRoles("platform_admin").input(z.object({ institutionId: z.number().int().positive(), archived: z.boolean(), reason: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const existing = await database.select({ name: institutions.name, active: institutions.active, archived: institutions.archived, isDemo: institutions.isDemo }).from(institutions).where(eq(institutions.id, input.institutionId)).limit(1);
      if (!existing[0] || existing[0].isDemo) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.archived && existing[0].active) throw new TRPCError({ code: "CONFLICT", message: "Pause the institution before archiving it." });
      await database.update(institutions).set({ archived: input.archived, ...(input.archived ? {} : { active: true }) }).where(eq(institutions.id, input.institutionId));
      await db.writeAudit({ institutionId: null, actorUserId: ctx.user.id, action: input.archived ? "institution_archived" : "institution_restored", targetType: "institution", targetId: String(input.institutionId), detail: `${existing[0].name}; ${input.reason}` });
      return { success: true };
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
          .select({ id: institutions.id, name: institutions.name, archived: institutions.archived })
          .from(institutions)
          .where(eq(institutions.id, input.institutionId))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });
        if (existing[0].archived && input.active) throw new TRPCError({ code: "CONFLICT", message: "Restore the institution before reactivating it." });
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
        const inserted = await database
          .insert(institutions)
          .values({
            name: input.name,
            code: input.code,
            isDemo: false,
            active: true,
          })
          .returning({ id: institutions.id });
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
        const invitationInstitution = await database
          .select({
            id: institutions.id,
            name: institutions.name,
            isDemo: institutions.isDemo,
          })
          .from(institutions)
          .where(and(eq(institutions.id, tenant), eq(institutions.active, true)))
          .limit(1);
        if (!invitationInstitution[0])
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Institution not found.",
          });
        if (invitationInstitution[0].isDemo)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Invitations are not available for reserved practice workspaces.",
          });
        if (isPlatformAdmin) {
          if (input.role !== "institution_admin")
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Platform administrators may only bootstrap an institution administrator invitation.",
            });
        }
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const setting = await database.select().from(platformSettings).where(eq(platformSettings.key, "invitation_expiry_days")).limit(1);
        const configuredDays = setting[0]?.value?.days;
        const expiryDays = typeof configuredDays === "number" && configuredDays >= 1 && configuredDays <= 30 ? configuredDays : 7;
        const inserted = await database
          .insert(invitations)
          .values({
            institutionId: tenant,
            email: input.email.trim().toLowerCase(),
            role: input.role,
            tokenHash,
            expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
            createdBy: ctx.user.id,
          })
          .returning({ id: invitations.id });
        await db.writeAudit({
          institutionId: tenant,
          actorUserId: ctx.user.id,
          action: "invitation_created",
          targetType: "invitation",
          targetId: String(inserted[0]!.id),
          detail: `Role ${input.role}; expires in ${expiryDays} days.`,
        });
        const emailAccepted = await sendInvitationEmail({
          email: input.email.trim().toLowerCase(),
          role: input.role,
          institutionName: invitationInstitution[0].name,
          token,
        });
        return {
          token: emailAccepted ? null : token,
          expiresInDays: expiryDays,
          delivery: emailAccepted ? ("email" as const) : ("manual" as const),
        };
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
        const accountState = await database.select({ disabled: users.disabled, emailVerified: users.emailVerified }).from(users).where(eq(users.id, assignment[0].userId)).limit(1);
        if (input.status === "active" && (accountState[0]?.disabled || !accountState[0]?.emailVerified))
          throw new TRPCError({ code: "FORBIDDEN", message: "A platform-suspended or unverified account cannot be activated by an institution administrator." });
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
    audit: requireRoles("institution_admin", "platform_admin").input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(10).max(100).default(25), search: z.string().trim().max(120).default(""), action: z.string().trim().max(100).optional(), from: z.string().date().optional(), to: z.string().date().optional() }).default({ page: 1, pageSize: 25, search: "" })).query(
      async ({ ctx, input }) => {
        const isPlatformAdmin =
          ctx.appAccess.roles.includes("platform_admin") &&
          ctx.appAccess.institutionId === null;
        if (!isPlatformAdmin && ctx.appAccess.institutionId === null)
          throw new TRPCError({ code: "FORBIDDEN" });
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
        const search = `%${input.search.toLowerCase()}%`;
        const where = and(
          isPlatformAdmin ? undefined : eq(auditLogs.institutionId, ctx.appAccess.institutionId!),
          input.search ? sql`(lower(${auditLogs.action}) LIKE ${search} OR lower(${auditLogs.targetType}) LIKE ${search} OR lower(${auditLogs.targetId}) LIKE ${search} OR lower(coalesce(${auditLogs.detail}, '')) LIKE ${search})` : undefined,
          input.action ? eq(auditLogs.action, input.action) : undefined,
          input.from ? sql`${auditLogs.createdAt} >= ${new Date(`${input.from}T00:00:00.000Z`)}` : undefined,
          input.to ? sql`${auditLogs.createdAt} < ${dayAfter(input.to)}` : undefined,
        );
        const totalRows = await database.select({ total: count() }).from(auditLogs).where(where);
        const rows = await database.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
        return { rows, total: Number(totalRows[0]?.total ?? 0), page: input.page, pageSize: input.pageSize, pages: Math.ceil(Number(totalRows[0]?.total ?? 0) / input.pageSize) };
      }
    ),
    auditExport: requireRoles("platform_admin").input(z.object({ search: z.string().trim().max(120).default(""), action: z.string().trim().max(100).optional(), from: z.string().date().optional(), to: z.string().date().optional() }).default({ search: "" })).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const search = `%${input.search.toLowerCase()}%`;
      const where = and(input.search ? sql`(lower(${auditLogs.action}) LIKE ${search} OR lower(${auditLogs.targetType}) LIKE ${search} OR lower(${auditLogs.targetId}) LIKE ${search} OR lower(coalesce(${auditLogs.detail}, '')) LIKE ${search})` : undefined, input.action ? eq(auditLogs.action, input.action) : undefined, input.from ? sql`${auditLogs.createdAt} >= ${new Date(`${input.from}T00:00:00.000Z`)}` : undefined, input.to ? sql`${auditLogs.createdAt} < ${dayAfter(input.to)}` : undefined);
      const rows = await database.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(10000);
      return ["id,institution_id,actor_user_id,action,target_type,target_id,detail,created_at", ...rows.map(row => [row.id, row.institutionId, row.actorUserId, row.action, row.targetType, row.targetId, row.detail, row.createdAt.toISOString()].map(csvCell).join(","))].join("\n");
    }),
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
              .map(csvCell)
              .join(",")
          ),
        ].join("\n");
      }),
  }),
});

export { appRouter };
export type AppRouter = typeof appRouter;
