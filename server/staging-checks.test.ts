import { describe, expect, it } from "vitest";
import {
  evaluateStagingBucket,
  evaluateStagingSchema,
  STAGING_EVIDENCE_MIME_TYPES,
  STAGING_TABLES,
} from "./staging-checks";

const passingTables = STAGING_TABLES.map(table_name => ({
  table_name,
  rls_enabled: true,
  policy_count: 0,
  client_policy: false,
}));

describe("staging configuration checks", () => {
  it("accepts the current RLS and server-only table access model", () => {
    const privileges = ["anon", "authenticated"].flatMap(role_name =>
      STAGING_TABLES.map(table_name => ({
        role_name,
        table_name,
        has_client_privilege: false,
      }))
    );
    expect(
      evaluateStagingSchema(passingTables, privileges).every(check => check.passed)
    ).toBe(true);
  });

  it("fails if a table is missing, RLS is disabled, a client policy exists, or a browser role has a grant", () => {
    const tables = passingTables
      .filter(row => row.table_name !== "reviews")
      .map(row =>
        row.table_name === "evidence_files"
          ? { ...row, rls_enabled: false, client_policy: true }
          : row
      );
    const checks = evaluateStagingSchema(tables, [
      {
        role_name: "anon",
        table_name: "portfolio_entries",
        has_client_privilege: true,
      },
    ]);
    expect(checks.map(check => check.passed)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("fails closed if browser-role grant coverage is incomplete", () => {
    const checks = evaluateStagingSchema(passingTables, []);
    expect(checks[3]?.passed).toBe(false);
    expect(checks[4]?.passed).toBe(false);
  });

  it("requires a private bucket, the expected 25 MiB cap, and the exact file allowlist", () => {
    const validBucket = {
      public: false,
      file_size_limit: 25 * 1024 * 1024,
      allowed_mime_types: [...STAGING_EVIDENCE_MIME_TYPES],
    };
    expect(evaluateStagingBucket(validBucket).every(check => check.passed)).toBe(true);
    expect(
      evaluateStagingBucket({
        ...validBucket,
        public: true,
        allowed_mime_types: [...STAGING_EVIDENCE_MIME_TYPES, "video/quicktime"],
      }).map(check => check.passed)
    ).toEqual([false, true, false]);
  });
});
