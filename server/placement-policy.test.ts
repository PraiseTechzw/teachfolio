import { describe, expect, it } from "vitest";
import {
  hasActivePlacementRole,
  hasPlacementConflict,
  validPlacementDateRange,
} from "./placement-policy";

describe("placement assignment policy", () => {
  it("accepts only active role assignments in the selected institution", () => {
    const assignments = [
      {
        institutionId: 4,
        role: "student_teacher" as const,
        status: "active" as const,
      },
      {
        institutionId: 4,
        role: "supervisor" as const,
        status: "suspended" as const,
      },
      {
        institutionId: 5,
        role: "lecturer" as const,
        status: "active" as const,
      },
    ];
    expect(hasActivePlacementRole(assignments, 4, "student_teacher")).toBe(
      true
    );
    expect(hasActivePlacementRole(assignments, 4, "supervisor")).toBe(false);
    expect(hasActivePlacementRole(assignments, 4, "lecturer")).toBe(false);
  });

  it("accepts real ordered calendar dates and rejects impossible or reversed dates", () => {
    expect(validPlacementDateRange("2026-02-28", "2026-03-01")).toBe(true);
    expect(validPlacementDateRange("2026-02-29", "2026-03-01")).toBe(false);
    expect(validPlacementDateRange("2026-03-02", "2026-03-01")).toBe(false);
  });

  it("allows editing a placement but blocks a second placement for that student", () => {
    expect(hasPlacementConflict([7], 7)).toBe(false);
    expect(hasPlacementConflict([7])).toBe(true);
  });
});
