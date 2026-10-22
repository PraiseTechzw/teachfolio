export const STAGING_TABLES = [
  "users",
  "institutions",
  "access_assignments",
  "invitations",
  "placements",
  "portfolio_requirements",
  "portfolio_entries",
  "submission_versions",
  "evidence_files",
  "reviews",
  "notifications",
  "audit_logs",
] as const;

export const STAGING_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "video/mp4",
] as const;

export type StagingCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

type TableCheckRow = {
  table_name: string;
  rls_enabled: boolean;
  policy_count: number;
  client_policy: boolean;
};

type PrivilegeCheckRow = {
  role_name: string;
  table_name: string;
  has_client_privilege: boolean;
};

export function evaluateStagingSchema(
  tables: readonly TableCheckRow[],
  privileges: readonly PrivilegeCheckRow[]
): StagingCheck[] {
  const tableByName = new Map(tables.map(row => [row.table_name, row]));
  const missing = STAGING_TABLES.filter(name => !tableByName.has(name));
  const rlsOff = STAGING_TABLES.filter(
    name => tableByName.has(name) && !tableByName.get(name)!.rls_enabled
  );
  const clientPolicies = STAGING_TABLES.filter(
    name => tableByName.get(name)?.client_policy
  );
  const policyCount = STAGING_TABLES.reduce(
    (total, name) => total + (tableByName.get(name)?.policy_count ?? 0),
    0
  );
  const exposedPrivileges = privileges
    .filter(row => row.has_client_privilege)
    .map(row => `${row.role_name}:${row.table_name}`);
  const checkedClientRoles = new Set(
    privileges.map(row => `${row.role_name}:${row.table_name}`)
  );
  const missingPrivilegeChecks = ["anon", "authenticated"].flatMap(role =>
    STAGING_TABLES.filter(table => !checkedClientRoles.has(`${role}:${table}`)).map(
      table => `${role}:${table}`
    )
  );
  return [
    {
      name: "Expected application tables",
      passed: missing.length === 0,
      detail: missing.length ? `Missing: ${missing.join(", ")}` : "All 12 present.",
    },
    {
      name: "Row-level security enabled",
      passed: rlsOff.length === 0,
      detail: rlsOff.length ? `Disabled: ${rlsOff.join(", ")}` : "Enabled on all expected tables.",
    },
    {
      name: "No browser-role policies",
      passed: clientPolicies.length === 0,
      detail: clientPolicies.length
        ? `Review policies for anon/authenticated/PUBLIC on: ${clientPolicies.join(", ")}`
        : `${policyCount} policy/policies found; none target anon, authenticated, or PUBLIC. Review custom-role policies before release.`,
    },
    {
      name: "Browser-role grant audit coverage",
      passed: missingPrivilegeChecks.length === 0,
      detail: missingPrivilegeChecks.length
        ? `Could not inspect grants for: ${missingPrivilegeChecks.join(", ")}`
        : "anon and authenticated roles were checked on all expected tables.",
    },
    {
      name: "No browser-role table privileges",
      passed: missingPrivilegeChecks.length === 0 && exposedPrivileges.length === 0,
      detail: exposedPrivileges.length
        ? `Unexpected grants: ${exposedPrivileges.join(", ")}`
        : "anon and authenticated cannot read or mutate application tables.",
    },
  ];
}

export function evaluateStagingBucket(bucket: {
  public?: unknown;
  file_size_limit?: unknown;
  allowed_mime_types?: unknown;
}): StagingCheck[] {
  const allowed = Array.isArray(bucket.allowed_mime_types)
    ? bucket.allowed_mime_types.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const expected = [...STAGING_EVIDENCE_MIME_TYPES].sort();
  const actual = [...allowed].sort();
  const sameMimeTypes =
    expected.length === actual.length &&
    expected.every((type, index) => type === actual[index]);
  return [
    {
      name: "Evidence bucket is private",
      passed: bucket.public === false,
      detail: bucket.public === false ? "Private." : "Bucket is public or privacy could not be confirmed.",
    },
    {
      name: "Evidence bucket size limit",
      passed: Number(bucket.file_size_limit) === 25 * 1024 * 1024,
      detail:
        Number(bucket.file_size_limit) === 25 * 1024 * 1024
          ? "25 MiB."
          : "Expected exactly 25 MiB.",
    },
    {
      name: "Evidence bucket MIME allowlist",
      passed: sameMimeTypes,
      detail: sameMimeTypes
        ? "Matches the application allowlist."
        : "Must contain exactly the seven supported document, image, and MP4 MIME types.",
    },
  ];
}
