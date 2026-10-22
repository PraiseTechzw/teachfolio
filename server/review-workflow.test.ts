import { describe, expect, it } from "vitest";
import { REVIEW_RUBRIC, type ReviewScoreInput } from "../shared/review-rubric";
import {
  buildRubricSnapshot,
  createSubmissionSnapshot,
  nextSubmissionVersion,
  prepareReviewDecision,
  startReviewStatus,
} from "./review-workflow";

const allScores = (score = 3): ReviewScoreInput[] =>
  REVIEW_RUBRIC.map(criterion => ({
    criterionId: criterion.id,
    score,
    comment: `Criterion feedback ${score}`,
  }));

const baseEntry: {
  title: string;
  kind: string;
  subject: string;
  className: string;
  lessonDate: string;
  payload: Record<string, unknown>;
} = {
  title: "Fractions — equivalent values",
  kind: "lesson",
  subject: "Mathematics",
  className: "Grade 5",
  lessonDate: "2026-10-22",
  payload: {
    stages: [{ stage: "Explore", duration: 20 }],
    objective: "Model fractions",
  },
};

const decide = (
  input: Partial<Parameters<typeof prepareReviewDecision>[0]> = {}
) =>
  prepareReviewDecision({
    actorId: 41,
    ownerId: 20,
    institutionId: 7,
    recordInstitutionId: 7,
    assignedReviewer: true,
    roles: ["supervisor"],
    status: "submitted",
    version: 1,
    decision: "revision_required",
    comments: "Clarify the learner assessment evidence before resubmitting.",
    rubricScores: allScores(),
    ...input,
  });

describe("supervisor/lecturer review workflow", () => {
  it("moves submitted work to under review and leaves an already-started review unchanged", () => {
    expect(startReviewStatus("submitted")).toEqual({
      status: "under_review",
      changed: true,
    });
    expect(startReviewStatus("resubmitted")).toEqual({
      status: "under_review",
      changed: true,
    });
    expect(startReviewStatus("under_review")).toEqual({
      status: "under_review",
      changed: false,
    });
    expect(() => startReviewStatus("draft")).toThrow(/not awaiting review/i);
  });

  it("scores every versioned rubric criterion and computes a formative total", () => {
    const result = buildRubricSnapshot(allScores(4));
    expect(result.rubricVersion).toBe(1);
    expect(result.criteria).toHaveLength(REVIEW_RUBRIC.length);
    expect(result.totalScore).toBe(REVIEW_RUBRIC.length * 4);
    expect(result.maximumScore).toBe(REVIEW_RUBRIC.length * 4);
    expect(result.averageScore).toBe(4);
    expect(result.interpretation).toBe("formative_not_official_grade");
  });

  it("rejects missing, duplicated, invalid and oversized criterion scores", () => {
    expect(() => buildRubricSnapshot(allScores().slice(1))).toThrow(
      /every rubric criterion/i
    );
    const duplicate = allScores();
    duplicate[1] = { ...duplicate[0] };
    expect(() => buildRubricSnapshot(duplicate)).toThrow(/more than once/i);
    expect(() => buildRubricSnapshot(allScores(5))).toThrow(
      /whole numbers from 1 to 4/i
    );
    const oversizedComment = allScores();
    oversizedComment[0].comment = "x".repeat(1001);
    expect(() => buildRubricSnapshot(oversizedComment)).toThrow(
      /1,000 characters/i
    );
  });

  it("denies an unassigned reviewer, cross-tenant reviewer and self-review", () => {
    expect(() => decide({ assignedReviewer: false })).toThrow(
      /not authorized/i
    );
    expect(() => decide({ institutionId: 8 })).toThrow(/not authorized/i);
    expect(() => decide({ actorId: 20, ownerId: 20 })).toThrow(
      /not authorized/i
    );
    expect(() => decide({ roles: ["student_teacher"] })).toThrow(
      /not authorized/i
    );
  });

  it("allows only pending submissions and requires complete overall feedback", () => {
    expect(() => decide({ status: "approved" })).toThrow(
      /not awaiting review/i
    );
    expect(() => decide({ comments: "ok" })).toThrow(/3–5,000 characters/i);
  });

  it("runs the full student → assigned supervisor → revision → resubmission → lecturer approval lifecycle", () => {
    const record = {
      institutionId: 7,
      ownerId: 20,
      status: "draft" as
        | "draft"
        | "submitted"
        | "under_review"
        | "revision_required"
        | "resubmitted"
        | "approved",
      version: 1,
      content: structuredClone(baseEntry),
    };
    const immutableVersions: Array<{
      version: number;
      status: string;
      snapshot: ReturnType<typeof createSubmissionSnapshot>;
    }> = [];
    const reviewHistory: Array<
      ReturnType<typeof prepareReviewDecision> & { reviewerId: number }
    > = [];

    const firstVersion = nextSubmissionVersion({
      status: "draft",
      version: record.version,
    });
    immutableVersions.push({
      version: firstVersion.version,
      status: firstVersion.status,
      snapshot: createSubmissionSnapshot({
        entry: record.content,
        version: firstVersion.version,
      }),
    });
    record.status = firstVersion.status;
    const started = startReviewStatus(record.status);
    immutableVersions[0].status = started.status;
    record.status = started.status;

    const revision = decide({
      actorId: 41,
      ownerId: record.ownerId,
      institutionId: record.institutionId,
      assignedReviewer: true,
      roles: ["supervisor"],
      status: record.status,
      version: record.version,
      decision: "revision_required",
      comments:
        "Add an observable check that every learner can model one equivalent fraction.",
      rubricScores: allScores(2),
    });
    reviewHistory.push({ ...revision, reviewerId: 41 });
    immutableVersions[0].status = revision.status;
    record.status = "revision_required";

    const originalSnapshot = structuredClone(immutableVersions[0].snapshot);
    record.content = {
      ...record.content,
      payload: {
        stages: [{ stage: "Explore", duration: 20 }],
        objective: "Model and explain equivalent fractions",
        assessment: "Each learner models and explains one pair.",
      },
    };
    expect(immutableVersions[0].snapshot).toEqual(originalSnapshot);

    const secondVersion = nextSubmissionVersion({
      status: "revision_required",
      version: record.version,
    });
    expect(secondVersion).toEqual({ version: 2, status: "resubmitted" });
    immutableVersions.push({
      version: secondVersion.version,
      status: secondVersion.status,
      snapshot: createSubmissionSnapshot({
        entry: record.content,
        version: secondVersion.version,
      }),
    });
    record.version = secondVersion.version;
    record.status = secondVersion.status;

    const approval = decide({
      actorId: 42,
      ownerId: record.ownerId,
      institutionId: record.institutionId,
      assignedReviewer: true,
      roles: ["lecturer"],
      status: record.status,
      version: record.version,
      decision: "approved",
      comments:
        "The revision aligns evidence with the objective and is ready to approve.",
      rubricScores: allScores(4),
    });
    reviewHistory.push({ ...approval, reviewerId: 42 });
    immutableVersions[1].status = approval.status;
    record.status = "approved";

    expect(record.status).toBe("approved");
    expect(
      reviewHistory.map(review => [
        review.reviewerId,
        review.submissionVersion,
        review.status,
      ])
    ).toEqual([
      [41, 1, "revision_required"],
      [42, 2, "approved"],
    ]);
    expect(immutableVersions.map(item => item.status)).toEqual([
      "revision_required",
      "approved",
    ]);
    expect(immutableVersions[0].snapshot.payload).toEqual(baseEntry.payload);
    expect(immutableVersions[1].snapshot.payload).toEqual(
      record.content.payload
    );
    expect(reviewHistory[0].rubric.averageScore).toBe(2);
    expect(reviewHistory[1].rubric.averageScore).toBe(4);
  });
});
