import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { accessAssignments, users } from "../drizzle/schema";
import { getDb } from "../server/db";

const [openId, confirmation] = process.argv.slice(2);
if (!openId || openId.length > 64 || confirmation !== "--confirm-trusted-platform-admin") {
  console.error("Usage: pnpm provision:platform-admin <supabase-auth-user-id> --confirm-trusted-platform-admin");
  console.error("Run only as a trusted operator after the target user has signed in once. This grants platform-wide administration.");
  process.exit(2);
}

const database = await getDb();
if (!database) throw new Error("DATABASE_URL is unavailable.");
try {
  const rows = await database.select().from(users).where(eq(users.openId, openId)).limit(1);
  const user = rows[0];
  if (!user) throw new Error("No Supabase Auth user with that exact user ID exists.");
  const existing = await database.select().from(accessAssignments).where(and(eq(accessAssignments.userId, user.id), isNull(accessAssignments.institutionId), eq(accessAssignments.role, "platform_admin"))).limit(1);
  if (!existing.length) {
    await database.insert(accessAssignments).values({ userId: user.id, institutionId: null, role: "platform_admin", status: "active", assignedBy: user.id });
  } else if (existing[0]!.status !== "active") {
    await database.update(accessAssignments).set({ status: "active" }).where(eq(accessAssignments.id, existing[0]!.id));
  }
  const { auditLogs } = await import("../drizzle/schema");
  await database.insert(auditLogs).values({ institutionId: null, actorUserId: user.id, action: "platform_admin_bootstrap", targetType: "user", targetId: String(user.id), detail: "Explicit trusted server-side bootstrap operation." });
  console.log("Platform administrator explicitly provisioned.");
} finally {
  const client = (database as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}
