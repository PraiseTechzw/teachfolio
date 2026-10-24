import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { accessAssignments, auditLogs, institutions, invitations, notifications, placements, portfolioEntries, portfolioRequirements, reviews, submissionVersions, users, type AccessRole, type InsertUser } from "../drizzle/schema";
import { isReservedDemoIdentity } from "./authz-policy";

let _db: ReturnType<typeof drizzle> | null = null;
let _connection: ReturnType<typeof postgres> | null = null;
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _connection = postgres(process.env.DATABASE_URL, { max: 5, prepare: false, ssl: "require" });
      _db = drizzle(_connection);
    }
    catch (error) { console.warn("[Database] Connection setup failed:", error instanceof Error ? error.message : "unknown error"); }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ disabled: users.disabled, deletionPending: users.deletionPending, name: users.name }).from(users).where(eq(users.openId, user.openId)).limit(1);
  if (existing[0]?.disabled) throw new Error(existing[0].deletionPending ? "This account is being deleted." : "This account is disabled.");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "phone", "emailVerified", "loginMethod"] as const) {
    if (field === "name" && existing[0]?.name) continue;
    if (user[field] !== undefined) { Object.assign(values, { [field]: user[field] ?? null }); updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  // Legacy users.role is retained for migration compatibility but NEVER grants application access.
  // Do not silently promote OWNER_OPEN_ID into an institution/platform administrator.
  values.role = "user";
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getApplicationAccess(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const identity = await db.select({ openId: users.openId, disabled: users.disabled, emailVerified: users.emailVerified }).from(users).where(eq(users.id, userId)).limit(1);
  if (!identity[0] || identity[0].disabled || !identity[0].emailVerified || isReservedDemoIdentity(identity[0].openId)) return null;
  const rows = await db.select().from(accessAssignments).where(and(eq(accessAssignments.userId, userId), eq(accessAssignments.status, "active")));
  if (rows.length === 0) return null;
  if (rows.some(row => row.role === "platform_admin" && row.institutionId !== null)) return null;
  const platform = rows.filter(row => row.role === "platform_admin" && row.institutionId === null);
  if (platform.length) return rows.length === platform.length ? { institutionId: null, roles: ["platform_admin"] as AccessRole[], assignmentIds: platform.map(x => x.id) } : null;
  const tenantIds = [...new Set(rows.map(row => row.institutionId).filter((id): id is number => id !== null))];
  // Ambiguous multi-tenant memberships fail closed; no client-selected tenant context.
  if (tenantIds.length !== 1 || rows.some(row => row.institutionId !== tenantIds[0])) return null;
  const activeTenant = await db.select({ id: institutions.id }).from(institutions).where(and(eq(institutions.id, tenantIds[0]!), eq(institutions.active, true))).limit(1);
  if (!activeTenant.length) return null;
  return { institutionId: tenantIds[0]!, roles: [...new Set(rows.map(row => row.role))], assignmentIds: rows.map(x => x.id) };
}

export async function getEntriesForStudent(institutionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(portfolioEntries).where(and(eq(portfolioEntries.institutionId, institutionId), eq(portfolioEntries.userId, userId))).orderBy(desc(portfolioEntries.updatedAt));
}

export async function assignedStudentIds(institutionId: number, reviewerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ studentUserId: placements.studentUserId }).from(placements).where(and(eq(placements.institutionId, institutionId), or(eq(placements.supervisorUserId, reviewerId), eq(placements.lecturerUserId, reviewerId))));
  return [...new Set(rows.map(row => row.studentUserId))];
}

export async function verifyReviewerAssignment(institutionId: number, studentUserId: number, reviewerId: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: placements.id }).from(placements).where(and(eq(placements.institutionId, institutionId), eq(placements.studentUserId, studentUserId), or(eq(placements.supervisorUserId, reviewerId), eq(placements.lecturerUserId, reviewerId)))).limit(1);
  return rows.length > 0;
}

export async function writeAudit(input: { institutionId: number | null; actorUserId: number; action: string; targetType: string; targetId: string; detail?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(auditLogs).values({ ...input, detail: input.detail ?? null });
}

export async function makeNotification(input: { institutionId: number; userId: number; type: string; message: string; href: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(notifications).values(input);
}

export async function listRequirements(institutionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(portfolioRequirements).where(eq(portfolioRequirements.institutionId, institutionId)).orderBy(portfolioRequirements.id);
}

export async function listNotifications(userId: number, institutionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.institutionId, institutionId))).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function acceptInvitation(tokenHash: string, email: string, userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is not available");
  return database.transaction(async tx => {
    const rows = await tx.select().from(invitations).where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.email, email.toLowerCase()))).limit(1);
    const invitation = rows[0];
    const now = new Date();
    if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= now.getTime()) return null;
    const tenant = await tx.select({ active: institutions.active }).from(institutions).where(eq(institutions.id, invitation.institutionId)).limit(1);
    if (!tenant[0]?.active) return null;
    const existing = await tx.select().from(accessAssignments).where(and(eq(accessAssignments.userId, userId), eq(accessAssignments.institutionId, invitation.institutionId), eq(accessAssignments.role, invitation.role))).limit(1);
    if (existing[0]?.status === "suspended") return null;
    const claim = await tx.update(invitations).set({ acceptedAt: now }).where(and(eq(invitations.id, invitation.id), eq(invitations.tokenHash, tokenHash), isNull(invitations.acceptedAt), gt(invitations.expiresAt, now))).returning({ id: invitations.id });
    if (claim.length !== 1) return null;
    if (!existing.length) await tx.insert(accessAssignments).values({ userId, institutionId: invitation.institutionId, role: invitation.role, status: "active", assignedBy: invitation.createdBy });
    else await tx.update(accessAssignments).set({ status: "active" }).where(eq(accessAssignments.id, existing[0]!.id));
    await tx.insert(auditLogs).values({ institutionId: invitation.institutionId, actorUserId: userId, action: "account_activated_from_invitation", targetType: "user", targetId: String(userId), detail: `Invitation ${invitation.id}; inviter ${invitation.createdBy}; assigned role ${invitation.role}.` });
    return invitation;
  });
}

export async function getPlacementForStudent(institutionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(placements).where(and(eq(placements.institutionId, institutionId), eq(placements.studentUserId, userId))).limit(1);
  return rows[0] ?? null;
}

export async function getVisibleUsers(institutionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({
    assignment: { id: accessAssignments.id, userId: accessAssignments.userId, institutionId: accessAssignments.institutionId, role: accessAssignments.role, status: accessAssignments.status, assignedBy: accessAssignments.assignedBy, createdAt: accessAssignments.createdAt, updatedAt: accessAssignments.updatedAt },
    user: { id: users.id, name: users.name, email: users.email, phone: users.phone, emailVerified: users.emailVerified, disabled: users.disabled, lastSignedIn: users.lastSignedIn },
  }).from(accessAssignments).innerJoin(users, eq(accessAssignments.userId, users.id)).where(eq(accessAssignments.institutionId, institutionId)).orderBy(desc(accessAssignments.createdAt)).limit(250);
}

export const dbTables = { users, accessAssignments, invitations, portfolioEntries, submissionVersions, reviews, placements, portfolioRequirements, notifications, auditLogs };
export { eq, and, inArray, isNull, or };
