import type { AccessRole } from "../drizzle/schema";

export const DEMO_OPEN_ID_PREFIX = "teachfolio-demo-no-login-";
export function isReservedDemoIdentity(openId: string) { return openId.startsWith(DEMO_OPEN_ID_PREFIX); }

export function canAccessPortfolioRecord(input: { actorId: number; institutionId: number | null; roles: AccessRole[]; recordInstitutionId: number; ownerId: number; assignedReviewer?: boolean }) {
  if (input.institutionId !== null && input.institutionId !== input.recordInstitutionId) return false;
  if (input.roles.includes("platform_admin")) return input.institutionId === null;
  if (input.institutionId === null) return false;
  if (input.roles.includes("institution_admin") || input.roles.includes("coordinator")) return true;
  if (input.roles.includes("student_teacher") && input.actorId === input.ownerId) return true;
  return Boolean(input.assignedReviewer && input.roles.some(role => role === "supervisor" || role === "lecturer"));
}

export function canDecideSubmission(input: { actorId: number; ownerId: number; institutionAllowed: boolean; assignedReviewer: boolean; roles: AccessRole[] }) {
  if (input.actorId === input.ownerId || !input.institutionAllowed) return false;
  return input.assignedReviewer && input.roles.some(role => role === "supervisor" || role === "lecturer");
}

export function canChangeAssignmentStatus(input: {
  actorId: number;
  actorInstitutionId: number | null;
  actorRoles: readonly AccessRole[];
  targetUserId: number;
  targetInstitutionId: number | null;
  targetRole: AccessRole;
  currentStatus: "pending" | "active" | "suspended";
  nextStatus: "active" | "suspended";
  activeInstitutionAdminCount: number;
}) {
  if (!input.actorRoles.includes("institution_admin")) return false;
  if (input.actorInstitutionId === null || input.targetInstitutionId !== input.actorInstitutionId) return false;
  if (input.actorId === input.targetUserId || input.targetRole === "platform_admin") return false;
  if (input.nextStatus === "suspended" && input.targetRole === "institution_admin" && input.currentStatus === "active" && input.activeInstitutionAdminCount <= 1) return false;
  return true;
}

export function canManageInstitution(input: { actorInstitutionId: number | null; actorRoles: readonly AccessRole[] }) {
  return input.actorInstitutionId === null && input.actorRoles.includes("platform_admin");
}
