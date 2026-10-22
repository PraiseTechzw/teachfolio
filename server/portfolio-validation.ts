export type SubmissionCandidate = {
  kind: string;
  title: string;
  subject: string;
  className: string;
  lessonDate: string;
  payload: Record<string, unknown>;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const validDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

export function validatePortfolioSubmission(
  entry: SubmissionCandidate
): string | null {
  if (entry.title.trim().length < 3)
    return "Add a title with at least three characters.";
  const payload = entry.payload ?? {};

  if (entry.kind === "lesson") {
    if (
      !entry.subject.trim() ||
      !entry.className.trim() ||
      !validDate(entry.lessonDate)
    ) {
      return "A lesson requires a subject, class and valid lesson date.";
    }
    if (
      !text(payload.school) ||
      !text(payload.studentName) ||
      !text(payload.collegeName) ||
      !text(payload.topic) ||
      !text(payload.objectives) ||
      !text(payload.priorKnowledge)
    ) {
      return "Complete the student teacher, college, school, lesson topic, learning objectives and assumed knowledge.";
    }
    const duration = Number(payload.duration);
    const stages = payload.stages;
    if (
      !Number.isInteger(duration) ||
      duration <= 0 ||
      !Array.isArray(stages) ||
      stages.length === 0
    ) {
      return "Set a positive lesson duration and add at least one lesson stage.";
    }
    let stageTotal = 0;
    for (const value of stages) {
      if (!value || typeof value !== "object")
        return "Each lesson stage must be complete.";
      const stage = value as Record<string, unknown>;
      const minutes = Number(stage.duration);
      if (!text(stage.stage) || !Number.isInteger(minutes) || minutes <= 0)
        return "Every lesson stage needs a name and a positive whole-minute duration.";
      if (!text(stage.teacherActivities) || !text(stage.learnerActivities))
        return "Every lesson stage needs teacher and pupil activities.";
      stageTotal += minutes;
    }
    if (stageTotal !== duration)
      return `Lesson stages total ${stageTotal} minutes; match the lesson duration of ${duration} minutes before submitting.`;
  }

  if (entry.kind === "scheme") {
    const start = payload.startDate;
    const end = payload.endDate;
    if (
      !text(payload.school) ||
      !text(payload.teacherName) ||
      !(text(payload.yearGroup) || text(payload.academicYear)) ||
      !text(payload.term)
    ) {
      return "A scheme requires its school, student teacher, year group and period covered.";
    }
    if ((start || end) && (!validDate(start) || !validDate(end)))
      return "Check the legacy scheme date range.";
    if (start && end && String(start) > String(end))
      return "The scheme end date must be on or after its start date.";
    if (!text(entry.subject) || !text(entry.className) || !text(payload.aims))
      return "A scheme requires a subject, class and general aims.";
    const weeks = payload.weeks;
    if (!Array.isArray(weeks) || weeks.length === 0)
      return "Add at least one weekly plan row.";
    const numbers = new Set<number>();
    for (const value of weeks) {
      if (!value || typeof value !== "object")
        return "Each weekly plan row must be complete.";
      const week = value as Record<string, unknown>;
      const number = Number(week.week);
      if (!Number.isInteger(number) || number < 1)
        return "Each weekly row needs a positive whole-number week.";
      if (numbers.has(number))
        return `Week ${number} appears more than once. Use unique week numbers.`;
      numbers.add(number);
      if (!text(week.topic) || !text(week.objectives))
        return `Week ${number} requires a topic and specific learning objectives.`;
      const weekStart = week.startDate;
      const weekEnd = week.endDate;
      if (
        (weekStart || weekEnd) &&
        (!validDate(weekStart) ||
          !validDate(weekEnd) ||
          String(weekStart) > String(weekEnd))
      ) {
        return `Check the date range for week ${number}.`;
      }
      if (start && end && weekStart && weekEnd &&
        (String(weekStart) < String(start) || String(weekEnd) > String(end))) {
        return `The date range for week ${number} must fall within the overall scheme dates.`;
      }
    }
  }

  if (entry.kind === "reflection") {
    if (
      !validDate(entry.lessonDate) ||
      !entry.subject.trim() ||
      !entry.className.trim()
    )
      return "A reflection requires a valid date, subject and class.";
    if (
      !text(payload.lessonObjectives) ||
      !text(payload.whatHappened) ||
      !text(payload.objectivesAchieved) ||
      !text(payload.nextTime)
    ) {
      return "Complete the objectives, what happened, objective achievement and next-time reflection.";
    }
  }

  if (entry.kind === "evidence") {
    if (!text(payload.description) || !text(payload.category))
      return "Evidence requires a category and description before submission.";
  }

  return null;
}

export function validPortfolioLink(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
  ) {
    return "invalid";
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : "invalid";
}
