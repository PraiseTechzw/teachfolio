import { describe, expect, it } from "vitest";
import {
  validPortfolioLink,
  validatePortfolioSubmission,
  type SubmissionCandidate,
} from "./portfolio-validation";

const lesson: SubmissionCandidate = {
  kind: "lesson",
  title: "Equivalent fractions",
  subject: "Mathematics",
  className: "Form 2A",
  lessonDate: "2026-10-19",
  payload: {
    topic: "Equivalent fractions",
    objectives: "Represent equivalence visually.",
    priorKnowledge: "Learners know unit fractions.",
    duration: 40,
    stages: [
      { stage: "Explore", duration: 15 },
      { stage: "Practice", duration: 25 },
    ],
  },
};

const scheme: SubmissionCandidate = {
  kind: "scheme",
  title: "Fractions term scheme",
  subject: "Mathematics",
  className: "Form 2A",
  lessonDate: "",
  payload: {
    school: "Fictional Practice School",
    teacherName: "Student Teacher",
    academicYear: "2026",
    term: "Term 3",
    startDate: "2026-08-01",
    endDate: "2026-11-30",
    aims: "Compare and represent fractions.",
    weeks: [
      {
        week: 1,
        topic: "Fraction models",
        objectives: "Identify equal parts.",
      },
      {
        week: 2,
        topic: "Equivalent fractions",
        objectives: "Represent equivalence.",
      },
    ],
  },
};

describe("server-side portfolio submission validation", () => {
  it("accepts a lesson whose positive stage durations exactly match the lesson duration", () => {
    expect(validatePortfolioSubmission(lesson)).toBeNull();
  });

  it("rejects lesson stage-duration mismatch and zero-duration stages", () => {
    expect(
      validatePortfolioSubmission({
        ...lesson,
        payload: { ...lesson.payload, duration: 45 },
      })
    ).toContain("match the lesson duration");
    expect(
      validatePortfolioSubmission({
        ...lesson,
        payload: {
          ...lesson.payload,
          stages: [{ stage: "Explore", duration: 0 }],
        },
      })
    ).toContain("positive whole-minute duration");
  });

  it("requires distinct positive scheme week numbers and content", () => {
    expect(validatePortfolioSubmission(scheme)).toBeNull();
    expect(
      validatePortfolioSubmission({
        ...scheme,
        payload: {
          ...scheme.payload,
          weeks: [
            { week: 1, topic: "A", objectives: "B" },
            { week: 1, topic: "C", objectives: "D" },
          ],
        },
      })
    ).toContain("appears more than once");
  });

  it("rejects a scheme with a reversed date range", () => {
    expect(
      validatePortfolioSubmission({
        ...scheme,
        payload: {
          ...scheme.payload,
          startDate: "2026-12-01",
          endDate: "2026-11-30",
        },
      })
    ).toContain("end date");
  });

  it("keeps weekly dates inside the overall scheme period", () => {
    expect(
      validatePortfolioSubmission({
        ...scheme,
        payload: {
          ...scheme.payload,
          weeks: [
            {
              week: 1,
              topic: "Fraction models",
              objectives: "Identify equal parts.",
              startDate: "2026-07-31",
              endDate: "2026-08-07",
            },
          ],
        },
      })
    ).toContain("within the overall scheme dates");
  });

  it("accepts only positive safe integer linked record IDs", () => {
    expect(validPortfolioLink(undefined)).toBeNull();
    expect(validPortfolioLink(42)).toBe(42);
    expect(validPortfolioLink("42")).toBe(42);
    expect(validPortfolioLink(-1)).toBe("invalid");
    expect(validPortfolioLink("1e9")).toBe("invalid");
  });
});
