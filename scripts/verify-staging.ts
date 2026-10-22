import { lookup } from "node:dns/promises";
import postgres from "postgres";
import {
  evaluateStagingBucket,
  evaluateStagingSchema,
  STAGING_TABLES,
} from "../server/staging-checks";

const CONFIRMATION = "I_CONFIRM_READ_ONLY_STAGING_CHECKS";
const checks: { name: string; passed: boolean; detail: string }[] = [];

function record(name: string, passed: boolean, detail: string) {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

function errorCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return "CONNECTION_FAILED";
}

function requireConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function verifyDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    prepare: false,
  });
  try {
    const schemaChecks = await client.begin(async transaction => {
      await transaction.unsafe("SET TRANSACTION READ ONLY");
      const tables = await transaction.unsafe(
        `SELECT c.relname AS table_name,
                c.relrowsecurity AS rls_enabled,
                COUNT(p.policyname)::int AS policy_count,
                COALESCE(BOOL_OR(p.roles::text[] && ARRAY['anon','authenticated','public']::text[]), false) AS client_policy
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
          GROUP BY c.relname, c.relrowsecurity`,
        [[...STAGING_TABLES]]
      );
      const privileges = await transaction.unsafe(
        `SELECT r.rolname AS role_name,
                c.relname AS table_name,
                (has_table_privilege(r.oid, c.oid, 'SELECT') OR
                 has_table_privilege(r.oid, c.oid, 'INSERT') OR
                 has_table_privilege(r.oid, c.oid, 'UPDATE') OR
                 has_table_privilege(r.oid, c.oid, 'DELETE') OR
                 has_table_privilege(r.oid, c.oid, 'TRUNCATE')) AS has_client_privilege
           FROM pg_roles r
           CROSS JOIN pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE r.rolname IN ('anon', 'authenticated')
            AND n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
        [[...STAGING_TABLES]]
      );
      return evaluateStagingSchema(tables as never[], privileges as never[]);
    });
    for (const check of schemaChecks) record(`Database / ${check.name}`, check.passed, check.detail);
    if (schemaChecks.some(check => !check.passed)) return;
    record("Database read-only transaction", true, "Catalog inspection completed with READ ONLY transaction.");
  } catch (error) {
    record("Database connectivity/schema", false, errorCode(error));
  } finally {
    await client.end({ timeout: 2 }).catch(() => undefined);
  }
}

async function verifyStorage(baseUrl: string, key: string, bucketName: string) {
  const bucketUrl = `${baseUrl.replace(/\/+$/, "")}/storage/v1/bucket/${encodeURIComponent(bucketName)}`;
  try {
    const response = await fetch(bucketUrl, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      record("Storage bucket metadata", false, `HTTP_${response.status}; verify staging key permissions and bucket name.`);
      return;
    }
    const config = (await response.json()) as {
      public?: unknown;
      file_size_limit?: unknown;
      allowed_mime_types?: unknown;
    };
    for (const check of evaluateStagingBucket(config))
      record(`Storage / ${check.name}`, check.passed, check.detail);
  } catch (error) {
    record("Storage connectivity", false, errorCode(error));
  }
}

async function main() {
  if (process.env.STAGING_CHECK_CONFIRMATION !== CONFIRMATION) {
    record("Safety confirmation", false, `Set STAGING_CHECK_CONFIRMATION=${CONFIRMATION} to run read-only checks.`);
    process.exitCode = 1;
    return;
  }

  let databaseUrl: URL;
  let supabaseUrl: URL;
  let secretKey: string;
  let bucket: string;
  try {
    databaseUrl = new URL(requireConfig("STAGING_DATABASE_URL"));
    if (!/[?&]sslmode=(require|verify-ca|verify-full)(?:&|$)/i.test(databaseUrl.search))
      throw new Error("STAGING_DATABASE_URL must require TLS using sslmode=require or stricter.");
    supabaseUrl = new URL(requireConfig("STAGING_SUPABASE_URL"));
    if (supabaseUrl.protocol !== "https:")
      throw new Error("STAGING_SUPABASE_URL must use HTTPS.");
    secretKey = requireConfig("STAGING_SUPABASE_SECRET_KEY");
    bucket = process.env.STAGING_STORAGE_BUCKET?.trim() || "teachfolio-evidence";
  } catch (error) {
    record("Staging configuration", false, error instanceof Error ? error.message : "Invalid staging configuration.");
    process.exitCode = 1;
    return;
  }

  for (const [label, hostname] of [
    ["Staging database DNS", databaseUrl.hostname],
    ["Staging Supabase DNS", supabaseUrl.hostname],
  ] as const) {
    try {
      await lookup(hostname);
      record(label, true, "Host resolves.");
    } catch (error) {
      record(label, false, errorCode(error));
    }
  }
  try {
    await lookup("supabase.com");
    record("General DNS control", true, "Public DNS resolves.");
  } catch (error) {
    record("General DNS control", false, errorCode(error));
  }

  if (checks.some(check => !check.passed)) {
    console.log("Skipping remote checks because configuration or DNS checks failed.");
  } else {
    await verifyDatabase(databaseUrl.toString());
    await verifyStorage(
      supabaseUrl.toString(),
      secretKey,
      bucket
    );
  }
  if (checks.some(check => !check.passed)) process.exitCode = 1;
}

void main();
