import { readDocxXml } from "@/lib/scheme-docx-import";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export type ImportedLessonStage = {
  stage: string;
  duration: number;
  teacherActivities: string;
  learnerActivities: string;
  resources: string;
};

export type ImportedLessonPlan = {
  title: string;
  subject: string;
  className: string;
  lessonDate: string;
  duration: number;
  stages: ImportedLessonStage[];
  payload: Record<string, unknown>;
};

type Block = { type: "paragraph"; text: string } | { type: "table"; rows: string[][] };

function textOf(element: Element) {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, "t"))
    .map(node => node.textContent ?? "")
    .join("")
    .replace(/\u00a0/g, " ")
    .trim();
}

function paragraphsOf(element: Element) {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, "p"))
    .map(textOf)
    .filter(Boolean);
}

function parseDate(value: string) {
  const match = value.match(/week\s+ending\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : "";
}

function parseMinutes(value: string) {
  const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minutes = value.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
  return Math.round(Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0));
}

function labeled(lines: string[], label: string) {
  const prefix = new RegExp(`^${label}\\s*:\\s*`, "i");
  return lines.find(line => prefix.test(line))?.replace(prefix, "").trim() ?? "";
}

function parsePlan(blocks: Block[]): ImportedLessonPlan | null {
  const lines = blocks.filter(block => block.type === "paragraph").map(block => block.text);
  const heading = lines[0] ?? "";
  if (!/^LESSON PLAN\s+\d+/i.test(heading)) return null;
  const topic = labeled(lines, "LESSON TOPIC");
  const subject = labeled(lines, "SUBJECT");
  const school = labeled(lines, "SCHOOL");
  const studentName = labeled(lines, "STUDENT'S NAME");
  const collegeName = labeled(lines, "COLLEGE NAME");
  const classValue = labeled(lines, "CLASS");
  const className = classValue.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const classDescription = classValue.match(/\(([^)]*)\)\s*$/)?.[1] ?? "";
  const classSize = labeled(lines, "CLASS SIZE");
  const sex = labeled(lines, "SEX");
  const timeAndDuration = labeled(lines, "TIME AND LESSON DURATION");
  const dateText = labeled(lines, "DATE");
  const date = parseDate(dateText);
  const week = Number(heading.match(/\bWEEK\s+(\d+)/i)?.[1] ?? dateText.match(/\bWeek\s+(\d+)/i)?.[1] ?? 0);
  const objectiveStart = lines.findIndex(line => /^LESSON OBJECTIVES/i.test(line));
  const assumedIndex = lines.findIndex(line => /^ASSUMED KNOWLEDGE\s*:/i.test(line));
  const objectives = objectiveStart < 0 || assumedIndex < 0
    ? ""
    : lines.slice(objectiveStart + 1, assumedIndex)
      .filter(line => !/^by the end of the lesson/i.test(line))
      .map(line => line.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean)
      .join("\n");
  const assumedKnowledge = labeled(lines, "ASSUMED KNOWLEDGE");
  const sourceMaterial = labeled(lines, "SOURCE OF MATERIAL");
  const media = labeled(lines, "MEDIA");
  const homework = labeled(lines, "HOMEWORK");
  const stagesTable = blocks.find((block): block is Extract<Block, { type: "table" }> =>
    block.type === "table" && /STAGE/i.test(block.rows[0]?.[0] ?? "") && /TEACHER ACTIVITIES/i.test(block.rows[0]?.[1] ?? "")
  );
  const stages = (stagesTable?.rows.slice(1) ?? []).map(row => {
    const rawStage = row[0] ?? "";
    const duration = parseMinutes(rawStage);
    const mediaMatch = rawStage.match(/\bMedia\s*:\s*(.*)$/i);
    return {
      stage: rawStage
        .replace(/\s*\([^)]*\b(?:min|mins|minutes?)\b[^)]*\)/i, "")
        .replace(/\s*\bMedia\s*:\s*.*$/i, "")
        .trim(),
      duration,
      teacherActivities: row[1] ?? "",
      learnerActivities: row[2] ?? "",
      resources: mediaMatch?.[1]?.trim() ?? "",
    };
  }).filter(stage => stage.stage || stage.teacherActivities || stage.learnerActivities);

  const evaluationIndex = lines.findIndex(line => /^LESSON EVALUATION\s*$/i.test(line));
  const evaluationLines = evaluationIndex < 0 ? [] : lines.slice(evaluationIndex + 1);
  const evaluation = (label: string) => labeled(evaluationLines, label);
  const duration = stages.reduce((sum, stage) => sum + stage.duration, 0) || parseMinutes(timeAndDuration);
  if (!topic || !subject || !className || !date || !stages.length) return null;
  return {
    title: `Lesson plan — ${topic}`.slice(0, 220),
    subject,
    className,
    lessonDate: date,
    duration,
    stages,
    payload: {
      school,
      studentName,
      collegeName,
      className,
      classDescription,
      classSize,
      sex,
      week,
      dateText,
      timeAndDuration,
      statedDurationMinutes: parseMinutes(timeAndDuration),
      topic,
      objectives,
      priorKnowledge: assumedKnowledge,
      sourceMaterial,
      resources: media,
      homework,
      generalEvaluation: evaluation("General Evaluation"),
      strengths: evaluation("Strengths"),
      weaknesses: evaluation("Weaknesses"),
      suggestions: evaluation("Suggestions"),
    },
  };
}

export async function importLessonPlansDocx(file: File): Promise<ImportedLessonPlan[]> {
  if (!file.name.toLowerCase().endsWith(".docx"))
    throw new Error("Choose a Microsoft Word .docx file.");
  const xml = await readDocxXml(file);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The Word document content is invalid.");
  const body = document.getElementsByTagNameNS(WORD_NS, "body")[0];
  if (!body) throw new Error("The Word document has no readable content.");
  const plans: ImportedLessonPlan[] = [];
  let current: Block[] = [];
  const flush = () => {
    if (!current.length) return;
    const plan = parsePlan(current);
    if (plan) plans.push(plan);
    current = [];
  };
  for (const child of Array.from(body.children)) {
    if (child.localName === "p") {
      const text = textOf(child);
      if (/^LESSON PLAN\s+\d+/i.test(text)) flush();
      if (text) current.push({ type: "paragraph", text });
    } else if (child.localName === "tbl") {
      const rows = Array.from(child.children)
        .filter(row => row.localName === "tr")
        .map(row => Array.from(row.children)
          .filter(cell => cell.localName === "tc")
          .map(cell => paragraphsOf(cell).join("\n")));
      current.push({ type: "table", rows });
    }
  }
  flush();
  if (!plans.length)
    throw new Error("No lesson plans matching the supported lesson-plan format were found.");
  return plans;
}
