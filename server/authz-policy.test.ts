import { describe, expect, it } from "vitest";
import { canAccessPortfolioRecord, canChangeAssignmentStatus, canDecideSubmission, canManageInstitution } from "./authz-policy";
import { issueCsrfToken, verifyCsrfToken } from "./_core/csrf";

describe("portfolio authorization policy", () => {
  it("denies an inactive/unassigned identity even when the submitted ID is valid", () => {
    expect(canAccessPortfolioRecord({ actorId: 1, institutionId: 8, roles: [], recordInstitutionId: 8, ownerId: 1 })).toBe(false);
  });
  it("denies changed IDs that target another institution", () => {
    expect(canAccessPortfolioRecord({ actorId: 1, institutionId: 8, roles: ["institution_admin"], recordInstitutionId: 9, ownerId: 2 })).toBe(false);
  });
  it("limits students to their own records", () => {
    expect(canAccessPortfolioRecord({ actorId: 1, institutionId: 8, roles: ["student_teacher"], recordInstitutionId: 8, ownerId: 2 })).toBe(false);
    expect(canAccessPortfolioRecord({ actorId: 1, institutionId: 8, roles: ["student_teacher"], recordInstitutionId: 8, ownerId: 1 })).toBe(true);
  });
  it("denies supervisors an unassigned student's portfolio", () => {
    expect(canAccessPortfolioRecord({ actorId: 10, institutionId: 8, roles: ["supervisor"], recordInstitutionId: 8, ownerId: 2, assignedReviewer: false })).toBe(false);
    expect(canAccessPortfolioRecord({ actorId: 10, institutionId: 8, roles: ["supervisor"], recordInstitutionId: 8, ownerId: 2, assignedReviewer: true })).toBe(true);
  });
  it("prevents self-approval even for otherwise privileged assignments", () => {
    expect(canDecideSubmission({ actorId: 4, ownerId: 4, institutionAllowed: true, assignedReviewer: true, roles: ["institution_admin"] })).toBe(false);
    expect(canDecideSubmission({ actorId: 8, ownerId: 4, institutionAllowed: true, assignedReviewer: true, roles: ["supervisor"] })).toBe(true);
    expect(canDecideSubmission({ actorId: 8, ownerId: 4, institutionAllowed: true, assignedReviewer: false, roles: ["supervisor"] })).toBe(false);
    expect(canDecideSubmission({ actorId: 8, ownerId: 4, institutionAllowed: true, assignedReviewer: true, roles: ["coordinator"] })).toBe(false);
    expect(canDecideSubmission({ actorId: 8, ownerId: 4, institutionAllowed: true, assignedReviewer: true, roles: ["institution_admin"] })).toBe(false);
  });
  it("binds CSRF tokens to one authenticated OAuth identity and expiration", () => {
    const token = issueCsrfToken("oauth-a", 1_000);
    expect(verifyCsrfToken(token, "oauth-a", 1_100)).toBe(true);
    expect(verifyCsrfToken(token, "oauth-b", 1_100)).toBe(false);
    expect(verifyCsrfToken(token, "oauth-a", 4_700)).toBe(false);
    expect(verifyCsrfToken(undefined, "oauth-a", 1_100)).toBe(false);
  });
});

describe("reserved demo identity policy", () => {
  it("marks all seeded non-login OAuth identifiers as reserved", async () => {
    const { DEMO_OPEN_ID_PREFIX, isReservedDemoIdentity } = await import("./authz-policy");
    expect(isReservedDemoIdentity(`${DEMO_OPEN_ID_PREFIX}student1`)).toBe(true);
    expect(isReservedDemoIdentity("real-manus-oauth-identity")).toBe(false);
  });
});

describe("institution administration policy", () => {
  const baseAssignment = {
    actorId: 10,
    actorInstitutionId: 8,
    actorRoles: ["institution_admin"] as const,
    targetUserId: 11,
    targetInstitutionId: 8,
    targetRole: "student_teacher" as const,
    currentStatus: "active" as const,
    nextStatus: "suspended" as const,
    activeInstitutionAdminCount: 2,
  };

  it("allows an institution administrator to change an eligible assignment in their own tenant", () => {
    expect(canChangeAssignmentStatus(baseAssignment)).toBe(true);
  });

  it("denies assignment ID tampering across institution boundaries", () => {
    expect(canChangeAssignmentStatus({ ...baseAssignment, targetInstitutionId: 9 })).toBe(false);
  });

  it("prevents self changes and protects platform administrator assignments", () => {
    expect(canChangeAssignmentStatus({ ...baseAssignment, targetUserId: 10 })).toBe(false);
    expect(canChangeAssignmentStatus({ ...baseAssignment, targetRole: "platform_admin" })).toBe(false);
  });

  it("does not allow suspension of the last active institution administrator", () => {
    expect(canChangeAssignmentStatus({ ...baseAssignment, targetRole: "institution_admin", activeInstitutionAdminCount: 1 })).toBe(false);
    expect(canChangeAssignmentStatus({ ...baseAssignment, targetRole: "institution_admin", activeInstitutionAdminCount: 2 })).toBe(true);
  });

  it("allows only an explicitly assigned platform administrator to manage institution status", () => {
    expect(canManageInstitution({ actorInstitutionId: null, actorRoles: ["platform_admin"] })).toBe(true);
    expect(canManageInstitution({ actorInstitutionId: 8, actorRoles: ["platform_admin"] })).toBe(false);
    expect(canManageInstitution({ actorInstitutionId: 8, actorRoles: ["institution_admin"] })).toBe(false);
  });
});
