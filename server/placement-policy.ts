import type { AccessRole } from "../drizzle/schema";

export type PlacementMemberAssignment = {
  institutionId: number | null;
  role: AccessRole;
  status: "pending" | "active" | "suspended";
};

export function hasActivePlacementRole(
  assignments: readonly PlacementMemberAssignment[],
  institutionId: number,
  role: "student_teacher" | "supervisor" | "lecturer"
) {
  return assignments.some(
    assignment =>
      assignment.institutionId === institutionId &&
      assignment.role === role &&
      assignment.status === "active"
  );
}

export function validPlacementDateRange(startDate: string, endDate: string) {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  };
  return validDate(startDate) && validDate(endDate) && startDate <= endDate;
}

export function hasPlacementConflict(
  existingPlacementIds: readonly number[],
  editingPlacementId?: number
) {
  return existingPlacementIds.some(id => id !== editingPlacementId);
}
