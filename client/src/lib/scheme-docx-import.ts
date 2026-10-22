const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MAX_DOCX_BYTES = 25 * 1024 * 1024;
const MAX_XML_BYTES = 12 * 1024 * 1024;

export type ImportedSchemeWeek = {
  week: number;
  weekEnding: string;
  weeklyAim: string;
  topic: string;
  content: string;
  objectives: string;
  methods: string;
  resources: string;
};

export type ImportedScheme = {
  title: string;
  subject: string;
  className: string;
  payload: Record<string, unknown>;
  weeks: ImportedSchemeWeek[];
};

function findDocumentXml(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const earliest = Math.max(0, bytes.length - 65_557);
  let endRecord = -1;
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endRecord = offset;
      break;
    }
  }
  if (endRecord < 0) throw new Error("This file is not a readable DOCX document.");
  const entries = view.getUint16(endRecord + 10, true);
  let cursor = view.getUint32(endRecord + 16, true);
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("The Word document archive is damaged.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const expandedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === "word/document.xml") {
      if (expandedSize > MAX_XML_BYTES)
        throw new Error("The document content is larger than the supported import size.");
      if (view.getUint32(localOffset, true) !== 0x04034b50)
        throw new Error("The Word document content could not be read.");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      if (method === 0) return new TextDecoder().decode(compressed);
      if (method !== 8)
        throw new Error("This DOCX compression format is not supported by the browser.");
      return { compressed, expandedSize };
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("This DOCX file does not contain a Word document body.");
}

async function wordXml(file: File) {
  if (file.size > MAX_DOCX_BYTES) throw new Error("Choose a DOCX file smaller than 25 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extracted = findDocumentXml(bytes);
  if (typeof extracted === "string") return extracted;
  if (typeof DecompressionStream === "undefined")
    throw new Error("DOCX import requires a modern browser. You can still enter the scheme manually.");
  try {
    const stream = new Blob([extracted.compressed])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
    const xml = await new Response(stream).text();
    if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES)
      throw new Error("The document content is larger than the supported import size.");
    return xml;
  } catch (error) {
    if (error instanceof Error && error.message.includes("supported import size")) throw error;
    throw new Error("The DOCX content could not be decompressed. Try saving it again from Word.");
  }
}

function textOf(element: Element) {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, "t"))
    .map(node => node.textContent ?? "")
    .join("")
    .replace(/\u00a0/g, " ")
    .trim();
}

function linesOf(element: Element) {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, "p"))
    .map(textOf)
    .filter(Boolean);
}

function cellsOf(row: Element) {
  return Array.from(row.children)
    .filter(child => child.localName === "tc")
    .map(cell => linesOf(cell).join("\n").trim());
}

function sectionText(lines: string[], startPattern: RegExp, stopPattern: RegExp) {
  const start = lines.findIndex(line => startPattern.test(line.trim()));
  if (start < 0) return "";
  const content: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (stopPattern.test(line.trim())) break;
    if (line.trim()) content.push(line.trim());
  }
  return content.join("\n").trim();
}

function splitTopicCell(value: string) {
  const lines = value.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const objectivesIndex = lines.findIndex(line => /^objectives\s*:?$/i.test(line));
  const contentIndex = lines.findIndex(line => /^content\s*:?$/i.test(line));
  const topicEnd = objectivesIndex >= 0 ? objectivesIndex : contentIndex >= 0 ? contentIndex : lines.length;
  const objectivesStart = objectivesIndex >= 0 ? objectivesIndex + 1 : -1;
  const objectivesEnd = contentIndex >= 0 ? contentIndex : lines.length;
  const contentStart = contentIndex >= 0 ? contentIndex + 1 : -1;
  return {
    topic: lines.slice(0, topicEnd).join(" ").replace(/\s+/g, " ").trim(),
    objectives: objectivesStart >= 0 ? lines.slice(objectivesStart, objectivesEnd).join("\n").trim() : "",
    content: contentStart >= 0 ? lines.slice(contentStart).join("\n").trim() : "",
  };
}

function plainLines(value: string) {
  return value
    .split(/\n+/)
    .map(line => line.replace(/^\s*[•·▪◦-]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function dateFromWeekEnding(value: string) {
  const parts = value.match(/\d{1,4}/g)?.map(Number) ?? [];
  if (parts.length < 3) return value.trim();
  const [day, month, rawYear] = parts;
  if (!day || !month || !rawYear || day > 31 || month > 12) return value.trim();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : value.trim();
}

export async function importSchemeDocx(file: File): Promise<ImportedScheme> {
  if (!file.name.toLowerCase().endsWith(".docx"))
    throw new Error("Choose a Microsoft Word .docx file.");
  const xml = await wordXml(file);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The Word document content is invalid.");
  const body = document.getElementsByTagNameNS(WORD_NS, "body")[0];
  if (!body) throw new Error("The Word document has no readable content.");

  const paragraphs: string[] = [];
  const tables: Array<Array<string[]>> = [];
  let currentWeek = 0;
  let currentWeeklyAim = "";
  const weeklyTables: Array<{ week: number; aim: string; rows: Array<string[]> }> = [];
  for (const child of Array.from(body.children)) {
    if (child.localName === "p") {
      const line = textOf(child);
      if (!line) continue;
      paragraphs.push(line);
      const weekMatch = line.match(/^week\s+(\d+)\s*$/i);
      if (weekMatch) {
        currentWeek = Number(weekMatch[1]);
        currentWeeklyAim = "";
      }
      const aimMatch = line.match(/^weekly\s+aim\s*:\s*(.*)$/i);
      if (aimMatch) currentWeeklyAim = aimMatch[1]?.trim() ?? "";
    } else if (child.localName === "tbl") {
      const rows = Array.from(child.children)
        .filter(row => row.localName === "tr")
        .map(cellsOf);
      const header = rows[0]?.join(" ").toLowerCase() ?? "";
      if (header.includes("week ending") && header.includes("topic"))
        weeklyTables.push({ week: currentWeek, aim: currentWeeklyAim, rows: rows.slice(1) });
      else tables.push(rows);
    }
  }

  const metadata = new Map<string, string>();
  for (const line of paragraphs) {
    const match = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (match) metadata.set((match[1] ?? "").toLowerCase().replace(/[^a-z]/g, ""), match[2] ?? "");
  }
  const lines = paragraphs.map(line => line.trim());
  const section = (heading: string, following: string[]) =>
    sectionText(lines, new RegExp(`^${heading}\\s*:?$`, "i"), new RegExp(`^(?:${following.join("|")})\\s*:?$`, "i"));
  const aims = section("GENERAL SCHEME AIMS", ["GENERAL OBJECTIVES"]);
  const generalObjectives = section("GENERAL OBJECTIVES", ["TOPICS"]);
  const topics = section("TOPICS", ["TEACHING METHODS / STRATEGIES"]);
  const methods = section("TEACHING METHODS / STRATEGIES", ["SOURCES OF MATERIAL"]);
  const resources = section("SOURCES OF MATERIAL", ["WEEK \\d+"]);

  const classTable = tables.find(rows => (rows[0]?.join(" ").toLowerCase() ?? "").includes("ability"));
  const classInformation = (classTable ?? [])
    .slice(1)
    .map(row => row.map(cell => cell.trim()).filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");
  const weeks = weeklyTables.flatMap(({ week, aim, rows }) => rows.map(row => {
    const [weekEnding = "", topicCell = "", methodCell = "", resourceCell = ""] = row;
    const split = splitTopicCell(topicCell);
    return {
      week,
      weekEnding: dateFromWeekEnding(weekEnding),
      weeklyAim: aim,
      topic: split.topic,
      content: plainLines(split.content),
      objectives: plainLines(split.objectives),
      methods: plainLines(methodCell),
      resources: plainLines(resourceCell),
    };
  })).filter(row => row.topic || row.objectives || row.content || row.methods || row.resources);

  const subject = metadata.get("subject") ?? "";
  const classes = metadata.get("classesschemedfor") ?? "";
  const periodText = metadata.get("numberofperiodsperweek") ?? "";
  const covered = metadata.get("periodcoveredbyscheme") ?? "";
  const payload: Record<string, unknown> = {
    school: metadata.get("schoolname") ?? "",
    teacherName: metadata.get("studentsname") ?? "",
    candidateNumber: metadata.get("candidatenumber") ?? "",
    yearGroup: metadata.get("yeargroup") ?? "",
    classInformation,
    term: covered,
    periodsPerWeek: periodText,
    aims: plainLines(aims),
    generalObjectives: plainLines(generalObjectives),
    topics: plainLines(topics),
    methods: plainLines(methods),
    resources: plainLines(resources),
  };
  const title = `Scheme of Work${subject ? ` — ${subject}` : ""}`;
  return {
    title,
    subject,
    className: classes.replace(/\s*(?:,|&| and )\s*/gi, ", "),
    payload,
    weeks,
  };
}
