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
  const hidden = new Set([
    "stages",
    "weeks",
    "consentConfirmed",
    "linkedEntryId",
  ]);
  if (weeks.length > 0) hidden.add("weeklyPlan");
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
      {weeks.length > 0 && (
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
      {stages.length > 0 && (
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
