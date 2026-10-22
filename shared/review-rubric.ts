export const REVIEW_RUBRIC_VERSION = 1 as const;

export const REVIEW_SCALE = [
  { value: 1, label: "Needs substantial support" },
  { value: 2, label: "Developing" },
  { value: 3, label: "Proficient" },
  { value: 4, label: "Strong practice" },
] as const;

export const REVIEW_RUBRIC = [
  {
    id: "planning",
    label: "Lesson preparation",
    description:
      "Lesson readiness, curriculum preparation, sequencing and a clear teaching purpose.",
  },
  {
    id: "alignment",
    label: "Objective and activity alignment",
    description:
      "Clarity and attainability of objectives and alignment to teaching and learner activities.",
  },
  {
    id: "subject_knowledge",
    label: "Subject knowledge and accuracy",
    description:
      "Accuracy, depth and accessible explanation of the subject matter.",
  },
  {
    id: "methods",
    label: "Teaching methods",
    description:
      "Purposeful, varied and inclusive methods that fit the subject and learners.",
  },
  {
    id: "engagement",
    label: "Learner engagement and participation",
    description:
      "Active learner participation, engagement and responsiveness to learner needs.",
  },
  {
    id: "classroom_management",
    label: "Classroom management",
    description:
      "Safe, respectful learning environment, organization, routines and behavior support.",
  },
  {
    id: "resources",
    label: "Learning resources",
    description:
      "Appropriate, accessible and purposeful use of available learning resources.",
  },
  {
    id: "assessment",
    label: "Assessment and evidence of learning",
    description:
      "Checks for understanding and useful evidence linked to outcomes.",
  },
  {
    id: "reflection",
    label: "Reflection and improvement",
    description:
      "Reasoned reflection, responsiveness, professional learning and actionable next steps.",
  },
  {
    id: "professionalism",
    label: "Professionalism",
    description:
      "Professional conduct, responsibility, preparation and respectful practice.",
  },
] as const;

export type ReviewCriterionId = (typeof REVIEW_RUBRIC)[number]["id"];
export type ReviewScoreInput = {
  criterionId: string;
  score: number;
  comment?: string;
};

/** Historical reviews store this whole snapshot so later rubric edits cannot rewrite prior assessments. */
export type ReviewRubricSnapshot = {
  rubricVersion: typeof REVIEW_RUBRIC_VERSION;
  scale: typeof REVIEW_SCALE;
  criteria: Array<{
    criterionId: ReviewCriterionId;
    label: string;
    description: string;
    score: 1 | 2 | 3 | 4;
    comment: string;
  }>;
  totalScore: number;
  maximumScore: number;
  averageScore: number;
  interpretation: "formative_not_official_grade";
};
