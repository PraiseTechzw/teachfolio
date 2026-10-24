import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { accessAssignments, institutions, users } from "../drizzle/schema";
import { ENV } from "../server/_core/env";
import { getDb } from "../server/db";

type SeedInstitution = { name: string; code: string };
type SeedAccount = {
  name: string;
  email: string;
  password: string;
  institutionCode: string;
  roles: Array<"institution_admin" | "coordinator" | "supervisor" | "lecturer" | "student_teacher">;
};

function readJson<T>(key: string): T {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required. Use real institution and account details from your deployment environment.`);
  try { return JSON.parse(value) as T; }
  catch { throw new Error(`${key} must contain valid JSON.`); }
}

if (process.argv[2] !== "--confirm-provision-accounts") {
  console.error("Usage: pnpm seed:demo --confirm-provision-accounts");
  console.error("Creates confirmed Supabase login accounts and institution memberships from TEACHFOLIO_SEED_* environment values.");
  process.exit(2);
}

const institutionsInput = readJson<SeedInstitution[]>("TEACHFOLIO_SEED_INSTITUTIONS");
const accountsInput = readJson<SeedAccount[]>("TEACHFOLIO_SEED_ACCOUNTS");
if (!Array.isArray(institutionsInput) || institutionsInput.length === 0 || !Array.isArray(accountsInput) || accountsInput.length === 0)
  throw new Error("Provide at least one institution and one account.");
if (!ENV.supabaseUrl || !ENV.supabaseSecretKey) throw new Error("SUPABASE_URL and server-only SUPABASE_SECRET_KEY are required.");
if (new Set(accountsInput.map(account => account.email?.trim().toLowerCase())).size !== accountsInput.length)
  throw new Error("Each role account must use a unique email address.");
if (new Set(accountsInput.map(account => account.password)).size !== accountsInput.length)
  throw new Error("Each account must use its own unique password; shared seed passwords are not allowed.");
const allowedRoles = new Set(["institution_admin", "coordinator", "supervisor", "lecturer", "student_teacher"]);
for (const account of accountsInput) {
  if (!account.name?.trim() || !account.email?.includes("@") || account.email.endsWith(".invalid") || account.password?.length < 12 || !account.roles?.length || account.roles.some(role => !allowedRoles.has(role)))
    throw new Error(`Invalid account config for ${account.email || "unknown email"}: use a real email, a unique password of at least 12 characters, and at least one institution role.`);
}
for (const institution of institutionsInput) {
  if (!institution.name?.trim() || !/^[A-Z0-9-]{2,40}$/.test(institution.code)) throw new Error(`Invalid institution config for ${institution.code || "unknown code"}.`);
}

const admin = createClient(ENV.supabaseUrl, ENV.supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const database = await getDb();
if (!database) throw new Error("DATABASE_URL is unavailable.");

async function findAuthUser(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Auth user lookup exceeded its safe page limit.");
}

try {
  const institutionIds = new Map<string, number>();
  for (const input of institutionsInput) {
    const existing = await database.select().from(institutions).where(eq(institutions.code, input.code)).limit(1);
    const institution = existing[0]
      ? (await database.update(institutions).set({ name: input.name, active: true, archived: false, isDemo: false }).where(eq(institutions.id, existing[0].id)).returning())[0]
      : (await database.insert(institutions).values({ name: input.name, code: input.code, active: true, archived: false, isDemo: false }).returning())[0];
    if (!institution) throw new Error(`Could not provision institution ${input.code}.`);
    institutionIds.set(input.code, institution.id);
  }

  for (const input of accountsInput) {
    const institutionId = institutionIds.get(input.institutionCode);
    if (!institutionId) throw new Error(`${input.email} references unknown institution code ${input.institutionCode}.`);
    let authUser = await findAuthUser(input.email);
    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.name.trim() },
      });
      if (error || !data.user) throw new Error(`Could not create ${input.email}: ${error?.message ?? "Auth returned no user."}`);
      authUser = data.user;
    } else if (!authUser.email_confirmed_at) {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, { email_confirm: true });
      if (error || !data.user) throw new Error(`Could not confirm ${input.email}: ${error?.message ?? "Auth returned no user."}`);
      authUser = data.user;
    }
    const existingUser = await database.select({ id: users.id }).from(users).where(eq(users.openId, authUser.id)).limit(1);
    const userId = existingUser[0]?.id ?? (await database.insert(users).values({
      openId: authUser.id,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      emailVerified: true,
      disabled: false,
      loginMethod: "email",
      role: "user",
    }).returning({ id: users.id }))[0]?.id;
    if (!userId) throw new Error(`Could not link ${input.email} to the application database.`);
    await database.update(users).set({ name: input.name.trim(), email: input.email.trim().toLowerCase(), emailVerified: true, disabled: false, loginMethod: "email" }).where(eq(users.id, userId));
    for (const role of [...new Set(input.roles)]) {
      const existingAssignment = await database.select({ id: accessAssignments.id }).from(accessAssignments).where(and(
        eq(accessAssignments.userId, userId), eq(accessAssignments.institutionId, institutionId), eq(accessAssignments.role, role),
      )).limit(1);
      if (existingAssignment.length) await database.update(accessAssignments).set({ status: "active" }).where(eq(accessAssignments.id, existingAssignment[0]!.id));
      else await database.insert(accessAssignments).values({ userId, institutionId, role, status: "active", assignedBy: userId });
    }
    console.log(`Ready: ${input.email} — ${[...new Set(input.roles)].join(", ")} @ ${input.institutionCode}. New accounts use the configured password; existing passwords are unchanged.`);
  }
  console.log("Account and institution provisioning complete. Passwords were not printed.");
} finally {
  const client = (database as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}
