import type { AccessRole } from "../drizzle/schema";
import {
  REVIEW_RUBRIC,
  REVIEW_RUBRIC_VERSION,
  REVIEW_SCALE,
  type ReviewRubricSnapshot,
  type ReviewScoreInput,
} from "../shared/review-rubric";
import { canDecideSubmission } from "./authz-policy";

export type ReviewDecision = "approved" | "revision_required" | "rejected";
export type ReviewableStatus = "submitted" | "resubmitted" | "under_review";
export function startReviewStatus(status: string): {
  status: "under_review";
  changed: boolean;
} {
  if (status === "under_review") return { status, changed: false };
  if (status === "submitted" || status === "resubmitted")
    return { status: "under_review", changed: true };
  throw new ReviewWorkflowError(
    "CONFLICT",
    "This submission is not awaiting review."
  );
}
export type ReviewWorkflowErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

export class ReviewWorkflowError extends Error {
  constructor(
    readonly code: ReviewWorkflowErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ReviewWorkflowError";
  }
}

export function buildRubricSnapshot(
  input: ReviewScoreInput[]
): ReviewRubricSnapshot {
  if (!Array.isArray(input) || input.length !== REVIEW_RUBRIC.length)
    throw new Error("Score every rubric criterion exactly once.");
  const byId = new Map<string, ReviewScoreInput>();
  for (const result of input) {
    if (!result || typeof result.criterionId !== "string")
      throw new Error("A rubric criterion is invalid.");
    if (byId.has(result.criterionId))
      throw new Error("A rubric criterion cannot be scored more than once.");
    if (!Number.isInteger(result.score) || result.score < 1 || result.score > 4)
      throw new Error("Rubric scores must be whole numbers from 1 to 4.");
    if (
      typeof result.comment !== "undefined" &&
      typeof result.comment !== "string"
    )
      throw new Error("Criterion feedback must be text.");
    const comment = result.comment?.trim() ?? "";
    if (comment.length > 1000)
      throw new Error("Criterion feedback cannot exceed 1,000 characters.");
    byId.set(result.criterionId, { ...result, comment });
  }

  const criteria = REVIEW_RUBRIC.map(criterion => {
    const result = byId.get(criterion.id);
    if (!result) throw new Error(`Score “${criterion.label}” before deciding.`);
    return {
      criterionId: criterion.id,
      label: criterion.label,
      description: criterion.description,
      score: result.score as 1 | 2 | 3 | 4,
      comment: result.comment?.trim() ?? "",
    };
  });
  const totalScore = criteria.reduce((sum, result) => sum + result.score, 0);
  return {
    rubricVersion: REVIEW_RUBRIC_VERSION,
    scale: REVIEW_SCALE,
    criteria,
    totalScore,
    maximumScore: criteria.length * 4,
    averageScore: Math.round((totalScore / criteria.length) * 100) / 100,
    interpretation: "formative_not_official_grade",
  };
}

export function nextSubmissionVersion(input: {
  status: "draft" | "revision_required";
  version: number;
}): { version: number; status: "submitted" | "resubmitted" } {
  if (!Number.isSafeInteger(input.version) || input.version < 1)
    throw new Error("Submission version is invalid.");
  if (input.status === "draft")
    return { version: input.version, status: "submitted" };
  if (input.status === "revision_required")
    return { version: input.version + 1, status: "resubmitted" };
  throw new Error("This record is not ready for submission.");
}

export function createSubmissionSnapshot(input: {
  entry: {
    title: string;
    kind: string;
    subject: string;
    className: string;
    lessonDate: string;
    payload: Record<string, unknown>;
  };
  version: number;
  evidenceFileIds?: number[];
}) {
  return {
    title: input.entry.title,
    kind: input.entry.kind,
    subject: input.entry.subject,
    className: input.entry.className,
    lessonDate: input.entry.lessonDate,
    payload: structuredClone(input.entry.payload),
    evidenceFileIds: [...new Set(input.evidenceFileIds ?? [])].filter(
      id => Number.isSafeInteger(id) && id > 0
    ),
    version: input.version,
  };
}

export function prepareReviewDecision(input: {
  actorId: number;
  ownerId: number;
  institutionId: number | null;
  recordInstitutionId: number;
  assignedReviewer: boolean;
  roles: AccessRole[];
  status: string;
  version: number;
  decision: ReviewDecision;
  comments: string;
  rubricScores: ReviewScoreInput[];
}): {
  status: ReviewDecision;
  submissionVersion: number;
  comments: string;
  rubric: ReviewRubricSnapshot;
} {
  if (
    !canDecideSubmission({
      actorId: input.actorId,
      ownerId: input.ownerId,
      institutionAllowed: input.institutionId === input.recordInstitutionId,
      assignedReviewer: input.assignedReviewer,
      roles: input.roles,
    })
  )
    throw new ReviewWorkflowError(
      "NOT_FOUND",
      "Reviewer is not authorized: this student is not assigned to you, or this decision is not permitted."
    );
  if (
    !(["submitted", "resubmitted", "under_review"] as const).includes(
      input.status as ReviewableStatus
    )
  )
    throw new ReviewWorkflowError(
      "CONFLICT",
      "This submission is not awaiting review."
    );
  if (!Number.isSafeInteger(input.version) || input.version < 1)
    throw new ReviewWorkflowError("CONFLICT", "Submission version is invalid.");
  const comments = input.comments.trim();
  if (comments.length < 3 || comments.length > 5000)
    throw new ReviewWorkflowError(
      "BAD_REQUEST",
      "Overall feedback must contain 3–5,000 characters."
    );
  let rubric: ReviewRubricSnapshot;
  try {
    rubric = buildRubricSnapshot(input.rubricScores);
  } catch (error) {
    throw new ReviewWorkflowError(
      "BAD_REQUEST",
      error instanceof Error ? error.message : "Rubric scores are invalid."
    );
  }
  return {
    status: input.decision,
    submissionVersion: input.version,
    comments,
    rubric,
  };
}

export function affectedRowCount(result: unknown): number {
  return Array.isArray(result) ? result.length : 0;
}
