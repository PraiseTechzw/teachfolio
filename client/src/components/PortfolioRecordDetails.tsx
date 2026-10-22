import { ArrowRight, Clock3, Link2 } from "lucide-react";

export type LinkedEntrySummary = {
  id: number;
  title: string;
  kind: string;
} | null;
export type SubmissionVersion = {
  id: number;
  version: number;
  snapshot: Record<string, unknown>;
  status: string;
  submittedAt: Date | string;
};
export type HistoricalEvidenceFile = {
  id: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
};

const label = (key: string) =>
  key
    .replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)
    .replaceAll("_", " ");
const display = (value: unknown) =>
  typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";
const outcomeTone: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-800",
  resubmitted: "bg-sky-50 text-sky-800",
  under_review: "bg-indigo-50 text-indigo-800",
  revision_required: "bg-rose-50 text-rose-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-rose-50 text-rose-800",
};

function formatSchemeDate(value: unknown) {
  const raw = display(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function SchemeSection({ title, value }: { title: string; value: unknown }) {
  const content = display(value).trim();
  if (!content) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{content}</p>
    </section>
  );
}

export function PortfolioStructuredDetails({
  payload,
  linkedEntry,
  onNavigate,
}: {
  payload: Record<string, unknown>;
  linkedEntry?: LinkedEntrySummary;
  onNavigate?: (path: string) => void;
}) {
  const stages = Array.isArray(payload.stages)
    ? (payload.stages as Array<Record<string, unknown>>)
    : [];
  const weeks = Array.isArray(payload.weeks)
    ? (payload.weeks as Array<Record<string, unknown>>)
    : [];
  const isScheme = Boolean(
    weeks.length && (display(payload.school) || display(payload.aims) || display(payload.generalObjectives))
  );
  const isLessonPlan = Boolean(
    stages.length && (display(payload.school) || display(payload.collegeName) || display(payload.studentName))
  );
  const schemeMetaKeys = new Set([
    "school", "teacherName", "candidateNumber", "yearGroup", "academicYear", "term",
    "classesSchemedFor", "startDate", "endDate", "teachingWeeks", "periodsPerWeek", "periodDuration",
    "classInformation", "aims", "generalObjectives", "topics", "methods", "resources",
    "priorKnowledge", "curriculumReference", "assessment", "assessmentApproaches",
  ]);
  const hidden = new Set([
    "stages",
    "weeks",
    "consentConfirmed",
    "linkedEntryId",
  ]);
  if (weeks.length > 0) hidden.add("weeklyPlan");
  if (isScheme) for (const key of schemeMetaKeys) hidden.add(key);
  if (isLessonPlan) {
    for (const key of [
      "school", "studentName", "collegeName", "classDescription", "classSize", "sex",
      "week", "dateText", "timeAndDuration", "statedDurationMinutes", "topic", "objectives", "className",
      "priorKnowledge", "sourceMaterial", "resources", "homework", "generalEvaluation",
      "strengths", "weaknesses", "suggestions", "duration", "content", "introduction", "safety",
    ]) hidden.add(key);
  }
  const fields = Object.entries(payload).filter(
    ([key, value]) =>
      !hidden.has(key) && typeof value !== "object" && display(value).trim()
  );
  return (
    <div className="mt-5 space-y-5">
      {linkedEntry && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Linked portfolio record
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.(`/item/${linkedEntry.id}`)}
            className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-indigo-900 hover:underline"
          >
            {linkedEntry.kind.replaceAll("_", " ")} · {linkedEntry.title}
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      {isScheme && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6">
          <header className="border-b border-slate-200 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-700">Teaching practice</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Scheme of Work</h2>
          </header>
          <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["School", payload.school], ["Student teacher", payload.teacherName],
              ["Candidate number", payload.candidateNumber], ["Year group", payload.yearGroup || payload.academicYear],
              ["Period covered by scheme", payload.term], ["Number of periods per week", payload.periodsPerWeek],
            ] as const).filter(([, value]) => display(value).trim()).map(([title, value]) => (
              <div key={title} className="bg-white px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{display(value)}</p>
              </div>
            ))}
          </div>
          {display(payload.classInformation).trim() && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h3 className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Class information</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-t border-slate-100 text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5 font-semibold">Class</th><th className="px-4 py-2.5 font-semibold">Girls</th><th className="px-4 py-2.5 font-semibold">Ability</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{display(payload.classInformation).split(/\n+/).filter(Boolean).map((line, index) => { const cells = line.split(/\s*\|\s*/); return <tr key={`${line}-${index}`}><td className="px-4 py-2.5 font-medium text-slate-800">{cells[0] ?? "—"}</td><td className="px-4 py-2.5 text-slate-600">{cells[1] ?? "—"}</td><td className="px-4 py-2.5 text-slate-600">{cells[2] ?? "—"}</td></tr>; })}</tbody>
                </table>
              </div>
            </section>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <SchemeSection title="General scheme aims" value={payload.aims} />
            <SchemeSection title="General objectives" value={payload.generalObjectives} />
            <SchemeSection title="Topics" value={payload.topics} />
            <SchemeSection title="Teaching methods / strategies" value={payload.methods} />
            <div className="md:col-span-2"><SchemeSection title="Sources / instructional materials" value={payload.resources} /></div>
          </div>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5"><div><h3 className="text-sm font-semibold text-slate-900">Weekly plan</h3><p className="mt-0.5 text-xs text-slate-500">{weeks.length} teaching week{weeks.length === 1 ? "" : "s"}</p></div></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-t border-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="w-32 px-4 py-3 font-semibold">Week ending</th><th className="px-4 py-3 font-semibold">Topic and content</th><th className="w-[25%] px-4 py-3 font-semibold">Methods and teaching strategies</th><th className="w-[23%] px-4 py-3 font-semibold">Sources / instructional materials</th></tr></thead>
                <tbody className="divide-y divide-slate-100 align-top">{weeks.map((week, index) => <tr key={String(week.id ?? index)}>
                  <td className="px-4 py-4"><p className="font-semibold text-slate-800">Week {display(week.week) || index + 1}</p><p className="mt-1 text-xs text-slate-500">{formatSchemeDate(week.weekEnding) || "—"}</p></td>
                  <td className="px-4 py-4"><div className="space-y-2">{display(week.weeklyAim).trim() && <p className="text-xs leading-5 text-slate-600"><strong className="text-slate-700">Weekly aim: </strong>{display(week.weeklyAim)}</p>}<p className="font-semibold text-slate-800">{display(week.topic) || "—"}</p>{display(week.objectives).trim() && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700"><strong>Objectives</strong><br />{display(week.objectives)}</p>}{display(week.content).trim() && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600"><strong className="text-slate-700">Content</strong><br />{display(week.content)}</p>}</div></td>
                  <td className="whitespace-pre-wrap px-4 py-4 text-xs leading-5 text-slate-700">{display(week.methods) || "—"}</td>
                  <td className="whitespace-pre-wrap px-4 py-4 text-xs leading-5 text-slate-700">{display(week.resources) || "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        </section>
      )}
      {isLessonPlan && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6">
          <header className="border-b border-slate-200 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-700">Teaching practice</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Lesson plan</h2>
          </header>
          <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["Student teacher", payload.studentName], ["College", payload.collegeName],
              ["School", payload.school], ["Class", payload.classDescription ? `${display(payload.className) || ""} (${display(payload.classDescription)})` : payload.className],
              ["Class size", payload.classSize], ["Sex", payload.sex],
              ["Week", payload.week ? `Week ${display(payload.week)}` : ""],
              ["Date", payload.dateText || formatSchemeDate(payload.lessonDate)],
              ["Time and lesson duration", payload.timeAndDuration],
            ] as const).filter(([, value]) => display(value).trim()).map(([title, value]) => (
              <div key={title} className="bg-white px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{display(value)}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SchemeSection title="Lesson objectives (SMART)" value={payload.objectives} />
            <SchemeSection title="Assumed knowledge" value={payload.priorKnowledge} />
            <SchemeSection title="Source of material" value={payload.sourceMaterial} />
            <SchemeSection title="Media" value={payload.resources} />
          </div>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-3.5"><h3 className="text-sm font-semibold text-slate-900">Lesson presentation structure</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-t border-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="w-48 px-4 py-3 font-semibold">Stage</th><th className="px-4 py-3 font-semibold">Teacher activities</th><th className="px-4 py-3 font-semibold">Pupil activities</th></tr></thead>
                <tbody className="divide-y divide-slate-100 align-top">{stages.map((stage, index) => <tr key={String(stage.id ?? index)}>
                  <td className="px-4 py-4"><p className="font-semibold text-slate-800">{display(stage.stage) || `Stage ${index + 1}`}</p><p className="mt-1 text-xs text-slate-500">{display(stage.duration)} min</p>{display(stage.resources).trim() && <p className="mt-2 text-xs text-slate-600"><strong>Media:</strong> {display(stage.resources)}</p>}</td>
                  <td className="whitespace-pre-wrap px-4 py-4 text-xs leading-5 text-slate-700">{display(stage.teacherActivities) || "—"}</td>
                  <td className="whitespace-pre-wrap px-4 py-4 text-xs leading-5 text-slate-700">{display(stage.learnerActivities) || "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
          <SchemeSection title="Homework" value={payload.homework} />
          {Boolean(payload.generalEvaluation || payload.strengths || payload.weaknesses || payload.suggestions) && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Lesson evaluation</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <SchemeSection title="General evaluation" value={payload.generalEvaluation} />
                <SchemeSection title="Strengths" value={payload.strengths} />
                <SchemeSection title="Weaknesses" value={payload.weaknesses} />
                <SchemeSection title="Suggestions" value={payload.suggestions} />
              </div>
            </section>
          )}
        </section>
      )}
      {fields.map(([key, value]) => (
        <div key={key}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {label(key)}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {display(value)}
          </p>
        </div>
      ))}
      {weeks.length > 0 && !isScheme && (
        <section className="space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Structured weekly plan
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {weeks.length} teaching week{weeks.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-3">
            {weeks.map((week, index) => (
              <article
                key={String(week.id ?? index)}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      Week {display(week.week) || index + 1}
                    </p>
                    <h4 className="mt-1 font-semibold text-slate-900">
                      {display(week.topic) || "Untitled week"}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500">
                    {display(week.startDate)}
                    {week.endDate ? ` — ${display(week.endDate)}` : ""}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  <strong>Objectives:</strong> {display(week.objectives) || "—"}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      "teacherActivities",
                      "learnerActivities",
                      "methods",
                      "resources",
                      "assessment",
                      "remarks",
                    ] as const
                  ).map(
                    key =>
                      display(week[key]).trim() && (
                        <div key={key}>
                          <p className="text-[11px] font-semibold uppercase text-slate-500">
                            {label(key)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                            {display(week[key])}
                          </p>
                        </div>
                      )
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {stages.length > 0 && !isLessonPlan && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Lesson procedure
          </h3>
          <div className="space-y-2">
            {stages.map((stage, index) => (
              <article
                key={String(stage.id ?? index)}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-slate-900">
                    {index + 1}. {display(stage.stage) || `Stage ${index + 1}`}
                  </strong>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    <Clock3 size={12} />
                    {display(stage.duration) || 0} min
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      "teacherActivities",
                      "learnerActivities",
                      "methods",
                      "resources",
                      "assessment",
                    ] as const
                  ).map(key => (
                    <div key={key}>
                      <p className="text-[11px] font-semibold uppercase text-slate-500">
                        {label(key)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                        {display(stage[key]) || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500">
            Stage total:{" "}
            {stages.reduce(
              (sum, stage) => sum + (Number(stage.duration) || 0),
              0
            )}{" "}
            minutes
          </p>
        </section>
      )}
      {Boolean(payload.linkedEntryId) && !linkedEntry && (
        <p className="inline-flex items-center gap-2 text-xs text-slate-500">
          <Link2 size={13} />A linked record is not available in this authorized
          portfolio scope.
        </p>
      )}
    </div>
  );
}

export function SubmissionHistoryList({
  versions,
  files = [],
  onOpenFile,
}: {
  versions: SubmissionVersion[];
  files?: HistoricalEvidenceFile[];
  onOpenFile?: (fileId: number) => void;
}) {
  if (!versions.length)
    return (
      <p className="mt-2 text-sm text-slate-500">
        This item has no submitted snapshot.
      </p>
    );
  return (
    <div className="mt-3 space-y-3">
      {versions.map(version => {
        const snapshot = version.snapshot ?? {};
        const snapshotPayload =
          snapshot.payload &&
          typeof snapshot.payload === "object" &&
          !Array.isArray(snapshot.payload)
            ? (snapshot.payload as Record<string, unknown>)
            : snapshot;
        const snapshotTitle =
          display(snapshot.title) ||
          "Earlier version (legacy payload snapshot)";
        const evidenceIds = Array.isArray(snapshot.evidenceFileIds)
          ? snapshot.evidenceFileIds.filter(
              (id): id is number =>
                typeof id === "number" && Number.isSafeInteger(id)
            )
          : [];
        const snapshotFiles = files.filter(file =>
          evidenceIds.includes(file.id)
        );
        const submittedAt = new Date(version.submittedAt);
        return (
          <details
            key={version.id}
            className="rounded-xl border border-slate-200 bg-white p-3"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
              <span>
                <strong className="text-sm text-slate-900">
                  Version {version.version}
                </strong>
                <span className="ml-2 text-xs text-slate-500">
                  {Number.isNaN(submittedAt.getTime())
                    ? "Date unavailable"
                    : submittedAt.toLocaleString()}
                </span>
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${outcomeTone[version.status] ?? "bg-slate-100 text-slate-700"}`}
              >
                {version.status.replaceAll("_", " ")}
              </span>
            </summary>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="font-medium text-slate-800">{snapshotTitle}</p>
              <p className="mt-1 text-xs text-slate-500">
                {[
                  display(snapshot.subject),
                  display(snapshot.className),
                  display(snapshot.lessonDate),
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  "Earlier record details were not included in this legacy snapshot."}
              </p>
              <PortfolioStructuredDetails payload={snapshotPayload} />
              {snapshotFiles.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Evidence attached to version {version.version}
                  </p>
                  {snapshotFiles.map(file => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => onOpenFile?.(file.id)}
                      className="mt-2 flex w-full items-center justify-between gap-2 text-left text-xs text-indigo-700 hover:underline"
                    >
                      <span className="truncate">{file.fileName}</span>
                      <span className="shrink-0 text-slate-500">
                        {(file.byteSize / 1024 / 1024).toFixed(1)} MiB · private
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
