import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  FileText,
  Filter,
  Image,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type Kind =
  | "scheme"
  | "lesson"
  | "reflection"
  | "evidence"
  | "observation"
  | "supporting_document"
  | "assessment"
  | "final_report";
type EntryKind = Exclude<Kind, "assessment">;
type FormKind = Exclude<Kind, "assessment">;
type Entry = {
  id: number;
  institutionId: number;
  userId: number;
  kind: EntryKind;
  title: string;
  subject: string;
  className: string;
  lessonDate: string;
  status: string;
  version: number;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
type User = {
  id: number;
  name?: string | null;
  email?: string | null;
  roles: string[];
  activated: boolean;
  institutionId: number | null;
};

const categoryInfo: Record<
  Kind,
  { title: string; path?: string; icon: typeof BookOpen }
> = {
  scheme: { title: "Schemes of work", path: "/schemes", icon: BookOpen },
  lesson: { title: "Lesson plans", path: "/lessons", icon: FileText },
  reflection: { title: "Reflective journal", path: "/journal", icon: Layers3 },
  evidence: { title: "Teaching evidence", path: "/evidence", icon: Image },
  observation: { title: "Teaching practice observations", icon: ShieldCheck },
  supporting_document: { title: "Supporting documents", icon: FileText },
  assessment: { title: "Assessments and feedback", icon: ShieldCheck },
  final_report: { title: "Final teaching-practice report", icon: FileText },
};
const kindForPath: Record<string, EntryKind> = {
  "/schemes": "scheme",
  "/lessons": "lesson",
  "/journal": "reflection",
  "/evidence": "evidence",
};
const statusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  revision_required: "Revision required",
  resubmitted: "Resubmitted",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};
const statusTone: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-50 text-amber-800",
  under_review: "bg-indigo-50 text-indigo-800",
  revision_required: "bg-rose-50 text-rose-800",
  resubmitted: "bg-sky-50 text-sky-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-rose-50 text-rose-800",
  archived: "bg-slate-100 text-slate-600",
};
const demoEntries: Entry[] = [
  {
    id: -1,
    institutionId: 0,
    userId: 0,
    kind: "scheme",
    title: "Fractions and equivalent values · term scheme",
    subject: "Mathematics",
    className: "Form 2A",
    lessonDate: "2026-09-04",
    status: "approved",
    version: 1,
    payload: { school: "Fictional Practice School", term: "Term 3" },
    createdAt: new Date("2026-09-04T09:00:00Z"),
    updatedAt: new Date("2026-10-18T10:00:00Z"),
  },
  {
    id: -2,
    institutionId: 0,
    userId: 0,
    kind: "lesson",
    title: "Equivalent fractions with paper strips",
    subject: "Mathematics",
    className: "Form 2A",
    lessonDate: "2026-10-19",
    status: "under_review",
    version: 1,
    payload: {
      topic: "Equivalent fractions",
      stages: [
        { stage: "Explore", duration: 15 },
        { stage: "Practice", duration: 25 },
      ],
    },
    createdAt: new Date("2026-10-19T08:00:00Z"),
    updatedAt: new Date("2026-10-20T12:30:00Z"),
  },
  {
    id: -3,
    institutionId: 0,
    userId: 0,
    kind: "reflection",
    title: "Reflection · learner explanations",
    subject: "Mathematics",
    className: "Form 2A",
    lessonDate: "2026-10-19",
    status: "revision_required",
    version: 1,
    payload: { whatHappened: "Fictional demonstration record." },
    createdAt: new Date("2026-10-19T15:00:00Z"),
    updatedAt: new Date("2026-10-21T09:00:00Z"),
  },
  {
    id: -4,
    institutionId: 0,
    userId: 0,
    kind: "evidence",
    title: "Teacher-prepared reading-resource note",
    subject: "English Language",
    className: "Form 2B",
    lessonDate: "2026-10-16",
    status: "draft",
    version: 1,
    payload: {
      category: "teaching_resource",
      description: "Fictional metadata only; no real file or learner is shown.",
    },
    createdAt: new Date("2026-10-16T11:00:00Z"),
    updatedAt: new Date("2026-10-16T11:00:00Z"),
  },
];
const demoRequirements = [
  {
    category: "scheme",
    required: true,
    requiredCount: 1,
    label: "Scheme of work",
  },
  {
    category: "lesson",
    required: true,
    requiredCount: 4,
    label: "Reviewed lesson plans",
  },
  {
    category: "reflection",
    required: true,
    requiredCount: 2,
    label: "Reflective journal entries",
  },
  {
    category: "evidence",
    required: true,
    requiredCount: 1,
    label: "Teaching evidence",
  },
  {
    category: "observation",
    required: false,
    requiredCount: 2,
    label: "Observation records",
  },
  {
    category: "final_report",
    required: true,
    requiredCount: 1,
    label: "Final practice report",
  },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {statusLabels[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
function dateLabel(value: string | Date | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function StudentPortfolioModule({
  path,
  searchTerm,
  user,
  onCreate,
  onEdit,
  onNavigate,
}: {
  path: string;
  searchTerm: string;
  user: User;
  onCreate: (kind?: FormKind) => void;
  onEdit: (entry: Entry) => void;
  onNavigate: (path: string) => void;
}) {
  const [localSearch, setLocalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const overview = trpc.portfolio.overview.useQuery(undefined, {
    retry: false,
  });
  const kind = kindForPath[path];
  const listInput = kind ? { kind, search: undefined } : undefined;
  const listQuery = trpc.portfolio.list.useQuery(listInput, {
    enabled: Boolean(kind) || path === "/submissions",
    retry: false,
  });
  const isStudent = user.activated && user.roles.includes("student_teacher");
  const isServiceOutage = (error: unknown) => {
    if (!error) return false;
    const failure = error as {
      data?: { httpStatus?: number };
      message?: string;
    };
    const status = failure.data?.httpStatus;
    return (
      (typeof status === "number" && status >= 500) ||
      /failed to fetch|network error|connection refused|database is unavailable|service unavailable|temporarily unavailable|private storage/i.test(
        failure.message ?? ""
      )
    );
  };
  const hasLoadError = Boolean(
    overview.error || ((kind || path === "/submissions") && listQuery.error)
  );
  const isOfflineDemo = Boolean(
    isStudent &&
      (isServiceOutage(overview.error) ||
        ((kind || path === "/submissions") && isServiceOutage(listQuery.error)))
  );
  const entries = useMemo(() => {
    if (isOfflineDemo) return isStudent ? demoEntries : [];
    if (path === "/portfolio") return (overview.data?.entries ?? []) as Entry[];
    return (listQuery.data ?? []) as Entry[];
  }, [isOfflineDemo, isStudent, listQuery.data, overview.data?.entries, path]);
  const requirements =
    isOfflineDemo && isStudent
      ? demoRequirements
      : (overview.data?.requirements ?? []);
  const queryText = (localSearch || searchTerm).trim().toLowerCase();
  const categoryEntries = entries.filter(entry => {
    if (path === "/submissions" && ["draft", "archived"].includes(entry.status))
      return false;
    if (path === "/portfolio" && entry.status === "archived") return false;
    if (statusFilter !== "all" && entry.status !== statusFilter) return false;
    if (
      path === "/evidence" &&
      evidenceFilter !== "all" &&
      String(entry.payload.category ?? "other") !== evidenceFilter
    )
      return false;
    if (
      queryText &&
      !`${entry.title} ${entry.subject} ${entry.className} ${String(entry.payload.description ?? "")}`
        .toLowerCase()
        .includes(queryText)
    )
      return false;
    return true;
  });
  const sorted = [...categoryEntries].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    const left = new Date(
      sort === "oldest" ? a.createdAt : a.updatedAt
    ).getTime();
    const right = new Date(
      sort === "oldest" ? b.createdAt : b.updatedAt
    ).getTime();
    return sort === "oldest" ? left - right : right - left;
  });
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageEntries = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  useEffect(
    () => setPage(1),
    [path, statusFilter, evidenceFilter, sort, queryText]
  );

  const sourceBanner = isOfflineDemo ? (
    <div
      role="status"
      className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <strong className="block font-bold">DEMO MODE · READ ONLY</strong>
      <span className="mt-1 block">
        The portfolio backend is unavailable. Only clearly fictional sample
        records are shown; no edits, uploads or submissions are saved in this
        mode.
      </span>
    </div>
  ) : hasLoadError ? (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
    >
      <strong className="block font-semibold">
        Authorized portfolio data could not be verified.
      </strong>
      <span className="mt-1 block">
        No sample records are substituted for access or validation errors.
        Refresh the page or contact your institution administrator.
      </span>
    </div>
  ) : overview.data?.demoLabel ? (
    <div
      role="status"
      className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"
    >
      <strong className="block font-bold">CONNECTED DEMO TENANT</strong>
      <span className="mt-1 block">
        This institution is explicitly marked as a fictional sample dataset.
        Authorized changes in this tenant are still saved through the configured
        backend.
      </span>
    </div>
  ) : null;

  if (path === "/portfolio") {
    const kinds = Object.entries(categoryInfo) as Array<
      [Kind, (typeof categoryInfo)[Kind]]
    >;
    return (
      <>
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
              STUDENT PORTFOLIO
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              My portfolio
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              A live view of saved work and configured institution requirements.
            </p>
          </div>
          {isStudent && !isOfflineDemo && !hasLoadError && (
            <button
              type="button"
              onClick={() => onCreate()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              <Plus size={16} />
              Add portfolio item
            </button>
          )}
        </header>
        {sourceBanner}
        {overview.isLoading && !overview.data ? (
          <div
            role="status"
            className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"
          >
            Loading portfolio overview…
          </div>
        ) : hasLoadError && !isOfflineDemo ? null : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kinds.map(([key, info]) => {
              const Icon = info.icon;
              const items = entries.filter(entry => entry.kind === key);
              const requirement = requirements.find(
                (row: { category: string }) => row.category === key
              );
              const required = requirement?.required
                ? Number(requirement.requiredCount)
                : 0;
              const approved = items.filter(
                entry => entry.status === "approved"
              ).length;
              const submitted = items.filter(entry =>
                ["submitted", "under_review", "resubmitted"].includes(
                  entry.status
                )
              ).length;
              const outstanding = required
                ? Math.max(0, required - approved)
                : 0;
              const latest = [...items].sort(
                (a, b) =>
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime()
              )[0];
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => info.path && onNavigate(info.path)}
                  disabled={!info.path}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-200 hover:shadow-md disabled:cursor-default"
                >
                  <div className="flex items-start justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                      <Icon size={19} />
                    </span>
                    {info.path && (
                      <ArrowRight
                        size={17}
                        className="text-slate-400 group-hover:text-indigo-600"
                      />
                    )}
                  </div>
                  <h2 className="mt-4 font-semibold text-slate-900">
                    {info.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {required
                      ? `${approved} of ${required} required approved · ${outstanding} outstanding`
                      : `${items.length} item${items.length === 1 ? "" : "s"} · optional unless required`}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                    <div>
                      <strong className="block text-sm text-slate-800">
                        {items.length}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        created
                      </span>
                    </div>
                    <div>
                      <strong className="block text-sm text-amber-700">
                        {submitted}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        in review
                      </span>
                    </div>
                    <div>
                      <strong className="block text-sm text-emerald-700">
                        {approved}
                      </strong>
                      <span className="text-[10px] text-slate-500">
                        approved
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 truncate text-[11px] text-slate-400">
                    Latest activity:{" "}
                    {latest
                      ? `${latest.title} · ${dateLabel(latest.updatedAt)}`
                      : "No saved items yet"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
        {!entries.length &&
          !isOfflineDemo &&
          !hasLoadError &&
          !overview.isLoading && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              No portfolio records yet. Use an authorized action to create a
              private draft.
            </div>
          )}
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
          Completion counts only items configured as required by your active
          institution. Optional categories are not incomplete.
        </p>
      </>
    );
  }

  const listTitle =
    path === "/submissions"
      ? "Submission history"
      : categoryInfo[kind ?? "lesson"].title;
  const listDescription =
    path === "/submissions"
      ? "Submitted and reviewed work, with version history available on each record."
      : kind === "scheme"
        ? "Editable, versioned schemes of work and weekly plans."
        : kind === "lesson"
          ? "Draft and submitted lesson plans with validated dynamic stages."
          : kind === "reflection"
            ? "Private reflective drafts and submitted journal records."
            : "Authorized teaching evidence metadata and private attached files.";
  return (
    <>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
            STUDENT PORTFOLIO
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {listTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{listDescription}</p>
        </div>
        {isStudent && kind && !isOfflineDemo && !hasLoadError && (
          <button
            type="button"
            onClick={() => onCreate(kind)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
          >
            <Plus size={16} />
            Create{" "}
            {kind === "lesson"
              ? "lesson plan"
              : kind === "scheme"
                ? "scheme"
                : kind === "reflection"
                  ? "reflection"
                  : "evidence"}
          </button>
        )}
      </header>
      {sourceBanner}
      {(overview.isLoading || listQuery.isLoading) && !isOfflineDemo && (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"
        >
          Loading authorized portfolio records…
        </div>
      )}
      {((!overview.isLoading && !listQuery.isLoading && !hasLoadError) ||
        isOfflineDemo) && (
        <>
          <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="relative">
              <span className="sr-only">Search portfolio items</span>
              <Search
                size={15}
                className="absolute left-3 top-3 text-slate-400"
              />
              <input
                value={localSearch}
                onChange={event => {
                  setLocalSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search title, subject or class…"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <Filter size={14} />
              <select
                aria-label="Filter by review status"
                className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                value={statusFilter}
                onChange={event => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels)
                  .filter(([key]) => key !== "archived")
                  .map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="sr-only">Sort portfolio records</span>
              <select
                aria-label="Sort portfolio records"
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                value={sort}
                onChange={event => {
                  setSort(event.target.value);
                  setPage(1);
                }}
              >
                <option value="newest">Recently updated</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </label>
            {path === "/evidence" && (
              <label className="text-xs text-slate-500 sm:col-span-3">
                <span className="sr-only">Filter evidence category</span>
                <select
                  aria-label="Filter evidence category"
                  className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:max-w-xs"
                  value={evidenceFilter}
                  onChange={event => {
                    setEvidenceFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All evidence categories</option>
                  <option value="lesson_document">Lesson document</option>
                  <option value="scheme">Scheme of work</option>
                  <option value="teaching_resource">Teaching resource</option>
                  <option value="classroom_activity">Classroom activity</option>
                  <option value="photograph">Teaching photograph</option>
                  <option value="video">Teaching video</option>
                  <option value="observation">Observation form</option>
                  <option value="assessment">Assessment record</option>
                  <option value="certificate">
                    Certificate / supporting document
                  </option>
                  <option value="other">Other approved evidence</option>
                </select>
              </label>
            )}
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              {sorted.length}{" "}
              {path === "/submissions" ? "submission" : "authorized record"}
              {sorted.length === 1 ? "" : "s"}
              {queryText ? ` matching “${queryText}”` : ""}
            </span>
            <span>
              Page {currentPage} of {pages}
            </span>
          </div>
          {pageEntries.length ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {pageEntries.map(entry => (
                <article
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  key={entry.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {entry.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {categoryInfo[entry.kind]?.title ?? entry.kind} ·{" "}
                      {entry.subject || "No subject"} ·{" "}
                      {entry.className || "No class"}
                      {entry.kind === "evidence" && entry.payload.category
                        ? ` · ${String(entry.payload.category).replaceAll("_", " ")}`
                        : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {entry.lessonDate || "No date"} · version {entry.version}{" "}
                      · updated {dateLabel(entry.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={entry.status} />
                    {!isOfflineDemo && !hasLoadError && (
                      <button
                        type="button"
                        onClick={() => onNavigate(`/item/${entry.id}`)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        History <ArrowRight size={13} />
                      </button>
                    )}
                    {!isOfflineDemo &&
                      !hasLoadError &&
                      isStudent &&
                      ["draft", "revision_required"].includes(entry.status) && (
                        <button
                          type="button"
                          onClick={() => onEdit(entry)}
                          className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          Edit draft
                        </button>
                      )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-semibold text-slate-800">
                {path === "/submissions"
                  ? "No submissions yet"
                  : `No ${listTitle.toLowerCase()} found`}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {queryText || statusFilter !== "all" || evidenceFilter !== "all"
                  ? "Adjust the search or filters."
                  : "Saved work appears here after it is persisted to the portfolio backend."}
              </p>
              {isStudent &&
                kind &&
                !isOfflineDemo &&
                !hasLoadError &&
                !categoryEntries.length && (
                  <button
                    type="button"
                    onClick={() => onCreate(kind)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <Plus size={15} />
                    Create first draft
                  </button>
                )}
            </div>
          )}
          {pages > 1 && (
            <nav
              aria-label="Portfolio pagination"
              className="mt-4 flex items-center justify-end gap-2"
            >
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                className="min-h-9 rounded-lg border border-slate-200 px-3 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 text-xs text-slate-500">
                {currentPage} / {pages}
              </span>
              <button
                type="button"
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
                className="min-h-9 rounded-lg border border-slate-200 px-3 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          )}
          {!isOfflineDemo && sorted.length >= 100 && (
            <p className="mt-3 text-xs text-slate-500">
              The server returns the most recent 100 matching records. Refine
              search or filters to find older work.
            </p>
          )}
        </>
      )}
    </>
  );
}
