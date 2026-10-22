import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  PlatformInstitutionDashboard,
  UserActivationDashboard,
} from "@/components/AdminDashboards";
import StudentPortfolioModule from "@/components/StudentPortfolioModule";
import ReviewQueueDashboard from "@/components/ReviewQueueDashboard";
import ReviewHistoryTimeline from "@/components/ReviewHistoryTimeline";
import {
  PortfolioStructuredDetails,
  SubmissionHistoryList,
  type LinkedEntrySummary,
  type SubmissionVersion,
} from "@/components/PortfolioRecordDetails";

type Entry = {
  id: number;
  institutionId: number;
  userId: number;
  kind:
    | "scheme"
    | "lesson"
    | "reflection"
    | "evidence"
    | "observation"
    | "supporting_document"
    | "final_report";
  title: string;
  subject: string;
  className: string;
  lessonDate: string;
  status: string;
  version: number;
  payload: Record<string, unknown>;
  updatedAt: Date;
};
type Access = {
  id: number;
  name: string | null;
  email: string | null;
  openId: string;
  activated: boolean;
  institutionId: number | null;
  roles: string[];
};
const categoryInfo: Record<
  string,
  { label: string; icon: typeof BookOpen; description: string }
> = {
  scheme: {
    label: "Schemes of work",
    icon: BookOpen,
    description: "Plan units, curriculum objectives and learning sequences.",
  },
  lesson: {
    label: "Lesson plans",
    icon: FileText,
    description: "Prepare purposeful lessons and preserve reviewed versions.",
  },
  reflection: {
    label: "Reflective journal",
    icon: Sparkles,
    description:
      "Capture what happened, what learners showed, and what comes next.",
  },
  evidence: {
    label: "Teaching evidence",
    icon: ArrowDownToLine,
    description:
      "Keep supporting evidence private and linked to your practice.",
  },
  observation: {
    label: "Observations",
    icon: Search,
    description: "Track teaching-practice observation records.",
  },
  supporting_document: {
    label: "Supporting documents",
    icon: FileText,
    description: "Organize institution-approved supporting documents.",
  },
  final_report: {
    label: "Final practice report",
    icon: GraduationCap,
    description: "Prepare the culminating teaching-practice report.",
  },
};
const statusText: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  revision_required: "Revision required",
  resubmitted: "Resubmitted",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};
const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-700",
  under_review: "bg-amber-50 text-amber-800",
  revision_required: "bg-rose-50 text-rose-700",
  resubmitted: "bg-violet-50 text-violet-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-100 text-rose-800",
  archived: "bg-slate-100 text-slate-500",
};
const titleFor = (path: string) =>
  (
    ({
      "/": "Overview",
      "/placement": "My placement",
      "/portfolio": "My portfolio",
      "/schemes": "Schemes of work",
      "/lessons": "Lesson plans",
      "/journal": "Reflective journal",
      "/evidence": "Teaching evidence",
      "/submissions": "Submissions",
      "/reviews": "Review queue",
      "/feedback": "Feedback & assessments",
      "/reports": "Reports",
      "/notifications": "Notifications",
      "/settings": "Settings",
      "/admin/users": "User administration",
      "/admin/requirements": "Portfolio requirements",
      "/admin/audit-logs": "Audit log",
      "/admin/institutions": "Institution onboarding",
      "/access-denied": "Access denied",
    }) as Record<string, string>
  )[path] ?? "Portfolio record";
async function openEvidenceFile(fileId: number) {
  const tab = window.open("about:blank", "_blank");
  try {
    const response = await fetch(`/api/evidence/${fileId}/download`, {
      credentials: "include",
    });
    if (!response.ok)
      throw new Error("The server could not authorize this file.");
    const blobUrl = URL.createObjectURL(await response.blob());
    if (tab) tab.location.href = blobUrl;
    else window.location.assign(blobUrl);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
  } catch (error) {
    tab?.close();
    window.alert(
      error instanceof Error
        ? error.message
        : "File access could not be authorized."
    );
  }
}
function Status({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {statusText[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
function Button({
  children,
  onClick,
  kind = "secondary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  kind?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
}) {
  const cls =
    kind === "primary"
      ? "bg-indigo-700 text-white shadow-sm hover:bg-indigo-800"
      : kind === "danger"
        ? "bg-rose-700 text-white hover:bg-rose-800"
        : kind === "quiet"
          ? "text-slate-600 hover:bg-slate-100"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
function Loading() {
  return (
    <div
      role="status"
      className="flex min-h-48 items-center justify-center text-sm text-slate-500"
    >
      <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
      Loading authorized records…
    </div>
  );
}
function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
        <BookOpen size={21} />
      </span>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-500">
        {body}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
function PageTitle({
  eyebrow = "TEACHING PRACTICE",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-bold tracking-[.17em] text-indigo-600">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default function Workspace({
  path,
  searchTerm,
  user,
  onCreate,
  onEdit,
  onNavigate,
}: {
  path: string;
  searchTerm: string;
  user: Access;
  onCreate: (kind?: Entry["kind"]) => void;
  onEdit: (entry: Entry) => void;
  onNavigate: (path: string) => void;
}) {
  const overview = trpc.portfolio.overview.useQuery(undefined, {
    enabled: user.activated && path !== "/admin/institutions",
  });
  const recordMatch = path.match(/^\/item\/(\d+)$/);
  const detail = trpc.portfolio.get.useQuery(
    { id: Number(recordMatch?.[1]) },
    { enabled: Boolean(recordMatch && user.activated) }
  );
  const kindForPath: Record<string, Entry["kind"]> = {
    "/schemes": "scheme",
    "/lessons": "lesson",
    "/journal": "reflection",
    "/evidence": "evidence",
  };
  const listQuery = trpc.portfolio.list.useQuery(
    { kind: kindForPath[path], search: searchTerm || undefined },
    { enabled: Boolean(kindForPath[path]) && user.activated }
  );
  const globalSearch = trpc.portfolio.list.useQuery(
    { search: searchTerm.trim() || undefined },
    { enabled: searchTerm.trim().length >= 2 && user.activated, retry: false }
  );
  const placement = trpc.placement.mine.useQuery(undefined, {
    enabled: path === "/placement" && user.activated,
    retry: false,
  });
  const notices = trpc.notifications.mine.useQuery(undefined, {
    enabled: path === "/notifications" && user.activated,
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [formError, setFormError] = useState("");
  const utils = trpc.useUtils();
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: async () => {
      await utils.notifications.mine.invalidate();
    },
  });
  const auditEvents = trpc.admin.audit.useQuery(undefined, {
    enabled: path === "/admin/audit-logs" && user.activated,
    retry: false,
  });
  const csvQuery = trpc.reports.csv.useQuery(undefined, {
    enabled: false,
    retry: false,
  });
  const visibleEntries = useMemo(() => {
    const data = (listQuery.data ?? []) as Entry[];
    return statusFilter === "all"
      ? data
      : data.filter(entry => entry.status === statusFilter);
  }, [listQuery.data, statusFilter]);
  const assignedRoles = user.roles;
  const isStudent = assignedRoles.includes("student_teacher");
  const isReviewer = assignedRoles.some(role =>
    ["supervisor", "lecturer"].includes(role)
  );
  const isCoordinator = assignedRoles.includes("coordinator");
  const isInstitutionAdmin = assignedRoles.includes("institution_admin");
  const isPlatformAdmin = assignedRoles.includes("platform_admin");
  const institutionIdSafe = user.institutionId;
  const entries = overview.data?.entries ?? [];
  const isLoading = overview.isLoading;
  const exportCsv = async () => {
    try {
      const csv = await utils.reports.csv.fetch();
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "authorized-portfolio-report.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFormError(
        "Report export is unavailable for this role or institution."
      );
    }
  };

  if (path === "/access-denied")
    return (
      <>
        <PageTitle
          title="Access denied"
          description="This address is outside your active account permissions."
        />
        <Empty
          title="Protected record not available"
          body="The server did not return the record. Verify your institution assignment or contact an authorized administrator."
          action={
            <Button onClick={() => onNavigate("/")}>Return to overview</Button>
          }
        />
      </>
    );

  if (searchTerm.trim().length >= 2)
    return (
      <>
        <PageTitle
          title="Search authorized records"
          description={`Results are limited to records your active institution and role permit.`}
        />
        <p className="mb-3 text-sm text-slate-500">
          Search: <strong>{searchTerm.trim()}</strong>
        </p>
        {globalSearch.isLoading ? (
          <Loading />
        ) : globalSearch.error ? (
          <Empty
            title="Search is unavailable"
            body="The server could not search your authorized records."
          />
        ) : globalSearch.data?.length ? (
          <EntryTable
            entries={globalSearch.data as Entry[]}
            onOpen={id => onNavigate(`/item/${id}`)}
            onEdit={entry => onEdit(entry)}
            canEdit={isStudent}
          />
        ) : (
          <Empty
            title="No matching records"
            body="Try another title, subject or class name."
          />
        )}
      </>
    );

  if (
    [
      "/portfolio",
      "/schemes",
      "/lessons",
      "/journal",
      "/evidence",
      "/submissions",
    ].includes(path)
  )
    return (
      <StudentPortfolioModule
        path={path}
        searchTerm={searchTerm}
        user={user}
        onCreate={kind => onCreate(kind)}
        onEdit={entry => onEdit(entry)}
        onNavigate={onNavigate}
      />
    );

  if (path === "/item/:id" || recordMatch) {
    if (detail.isLoading) return <Loading />;
    if (detail.error || !detail.data)
      return (
        <>
          <PageTitle
            title="Portfolio record"
            description="Authorized record detail and review history."
          />
          <Empty
            title="Record not available"
            body="This record may not exist or you may not be assigned to it."
            action={
              <Button onClick={() => onNavigate("/portfolio")}>
                Back to portfolio
              </Button>
            }
          />
        </>
      );
    const { entry, currentSnapshot, versions, history, files, linkedEntry } =
      detail.data as {
        entry: Entry;
        currentSnapshot: SubmissionVersion | null;
        versions: SubmissionVersion[];
        history: Array<{
          id: number;
          reviewerUserId: number;
          reviewerName: string | null;
          decision: string;
          comments: string;
          createdAt: Date;
          submissionVersion: number;
          rubric: {
            rubricVersion: number;
            scale: Array<{ value: number; label: string }>;
            criteria: Array<{
              criterionId: string;
              label: string;
              description: string;
              score: number;
              comment: string;
            }>;
            totalScore: number;
            maximumScore: number;
            averageScore: number;
            interpretation: string;
          } | null;
        }>;
        files: Array<{
          id: number;
          fileName: string;
          mimeType: string;
          byteSize: number;
          createdAt: Date;
        }>;
        linkedEntry: LinkedEntrySummary;
      };
    const reviewerReadingSubmitted = isReviewer && currentSnapshot !== null;
    const snapshotRecord = currentSnapshot?.snapshot ?? {};
    const snapshotPayload =
      snapshotRecord.payload &&
      typeof snapshotRecord.payload === "object" &&
      !Array.isArray(snapshotRecord.payload)
        ? (snapshotRecord.payload as Record<string, unknown>)
        : entry.payload;
    const visibleEntry = reviewerReadingSubmitted
      ? {
          ...entry,
          title:
            typeof snapshotRecord.title === "string"
              ? snapshotRecord.title
              : entry.title,
          kind:
            typeof snapshotRecord.kind === "string"
              ? (snapshotRecord.kind as Entry["kind"])
              : entry.kind,
          subject:
            typeof snapshotRecord.subject === "string"
              ? snapshotRecord.subject
              : entry.subject,
          className:
            typeof snapshotRecord.className === "string"
              ? snapshotRecord.className
              : entry.className,
          lessonDate:
            typeof snapshotRecord.lessonDate === "string"
              ? snapshotRecord.lessonDate
              : entry.lessonDate,
          version:
            typeof snapshotRecord.version === "number"
              ? snapshotRecord.version
              : entry.version,
          payload: snapshotPayload,
        }
      : entry;
    const currentEvidenceIds = Array.isArray(snapshotRecord.evidenceFileIds)
      ? snapshotRecord.evidenceFileIds.filter(
          (id): id is number =>
            typeof id === "number" && Number.isSafeInteger(id)
        )
      : [];
    const visibleFiles = reviewerReadingSubmitted
      ? files.filter(file => currentEvidenceIds.includes(file.id))
      : files;
    return (
      <>
        <PageTitle
          title={visibleEntry.title}
          description={`${categoryInfo[visibleEntry.kind]?.label ?? "Portfolio item"} · ${visibleEntry.subject || "No subject"} · ${visibleEntry.className || "No class"}`}
          action={
            <div className="flex gap-2">
              <Button onClick={() => window.print()}>
                <ArrowDownToLine size={15} />
                Print
              </Button>
              {isStudent &&
                ["draft", "revision_required"].includes(entry.status) && (
                  <Button kind="primary" onClick={() => onEdit(entry)}>
                    Edit draft
                  </Button>
                )}
            </div>
          }
        />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,.8fr)]">
          <section className="space-y-4">
            {reviewerReadingSubmitted && (
              <p className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
                Reviewing immutable version {visibleEntry.version}, submitted{" "}
                {currentSnapshot?.submittedAt
                  ? new Date(currentSnapshot.submittedAt).toLocaleString()
                  : "at the recorded submission time"}
                . The student’s later draft edits are not shown here.
              </p>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Status status={entry.status} />
                <span className="text-xs text-slate-500">
                  {reviewerReadingSubmitted ? (
                    <>
                      Submitted version {visibleEntry.version} ·{" "}
                      {currentSnapshot?.submittedAt
                        ? new Date(
                            currentSnapshot.submittedAt
                          ).toLocaleDateString()
                        : "submission date unavailable"}
                    </>
                  ) : (
                    <>
                      Updated version {visibleEntry.version} ·{" "}
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </>
                  )}
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Subject</p>
                  <p className="mt-1 text-sm font-semibold">
                    {visibleEntry.subject || "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Class</p>
                  <p className="mt-1 text-sm font-semibold">
                    {visibleEntry.className || "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Date</p>
                  <p className="mt-1 text-sm font-semibold">
                    {visibleEntry.lessonDate || "—"}
                  </p>
                </div>
              </div>
              <PortfolioStructuredDetails
                payload={visibleEntry.payload ?? {}}
                linkedEntry={linkedEntry}
                onNavigate={onNavigate}
              />
            </div>
            {visibleFiles.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-semibold">Private evidence files</h2>
                <p className="mt-1 text-xs text-slate-500">
                  The server authorizes access and streams the file; storage
                  bearer URLs are never exposed.
                </p>
                <div className="mt-3 divide-y divide-slate-100">
                  {visibleFiles.map(file => (
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-indigo-700"
                      key={file.id}
                      onClick={() => void openEvidenceFile(file.id)}
                    >
                      <span>
                        {file.fileName}
                        <span className="ml-2 text-xs text-slate-500">
                          {(file.byteSize / 1024 / 1024).toFixed(1)} MiB
                        </span>
                      </span>
                      <ArrowDownToLine size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <MessageSquareText size={17} className="text-indigo-600" />
                Submission history
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Every version keeps its submitted content snapshot and most
                recent outcome.
              </p>
              <SubmissionHistoryList
                versions={versions}
                files={files}
                onOpenFile={fileId => void openEvidenceFile(fileId)}
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <MessageSquareText size={17} className="text-indigo-600" />
                Review history
              </h2>
              <ReviewHistoryTimeline reviews={history} />
            </div>
          </aside>
        </div>
      </>
    );
  }

  if (path === "/placement")
    return (
      <>
        <PageTitle
          title="My placement"
          description="Your assigned school, programme and teaching-practice contacts."
        />
        {placement.isLoading ? (
          <Loading />
        ) : placement.error ? (
          <Empty
            title="Placement details are not available"
            body="This role does not have a student placement record in the current institution."
          />
        ) : placement.data ? (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                    {placement.data.programme} · {placement.data.cohort}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">
                    {placement.data.schoolName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {placement.data.schoolLocation}
                  </p>
                </div>
                <Status status={placement.data.status} />
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ["Student number", placement.data.studentNumber],
                  ["Subject", placement.data.subject],
                  [
                    "Teaching period",
                    `${placement.data.startDate} — ${placement.data.endDate}`,
                  ],
                  ["Assigned classes", placement.data.classes.join(", ")],
                ].map(([label, value]) => (
                  <div className="rounded-xl bg-slate-50 p-3" key={label}>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <Button onClick={() => onNavigate("/portfolio")}>
                  Open linked portfolio <ArrowRight size={15} />
                </Button>
              </div>
            </section>
            <aside className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold">Placement timeline</h3>
              <div className="mt-5 space-y-4">
                <div className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-sm font-medium">Placement active</p>
                    <p className="text-xs text-slate-500">
                      {placement.data.startDate}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  <div>
                    <p className="text-sm font-medium">Teaching-practice end</p>
                    <p className="text-xs text-slate-500">
                      {placement.data.endDate}
                    </p>
                  </div>
                </div>
                <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                  Supervisor and lecturer contact details are available through
                  your institution administrator.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <Empty
            title="Placement not assigned"
            body="Your authenticated account has no placement linked yet. Contact your institution administrator."
          />
        )}
      </>
    );

  if (path === "/portfolio") {
    const requirements = overview.data?.requirements ?? [];
    const cards = Object.entries(categoryInfo).map(([kind, info]) => {
      const requirement = requirements.find(item => item.category === kind);
      const items = entries.filter(entry => entry.kind === kind);
      const approved = items.filter(
        entry => entry.status === "approved"
      ).length;
      return { kind, info, requirement, items, approved };
    });
    return (
      <>
        <PageTitle
          title="My portfolio"
          description="A requirement-led view of your teaching-practice record."
          action={
            isStudent ? (
              <Button kind="primary" onClick={() => onCreate()}>
                <Plus size={16} />
                Add portfolio item
              </Button>
            ) : undefined
          }
        />
        {overview.isLoading ? (
          <Loading />
        ) : (
          <>
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
              <ShieldCheck size={18} />
              <span>
                Completion counts only institution-required items. Optional
                categories stay optional.
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ kind, info, requirement, items, approved }) => {
                const Icon = info.icon;
                const required = requirement?.required
                  ? requirement.requiredCount
                  : 0;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() =>
                      onNavigate(
                        (
                          {
                            scheme: "/schemes",
                            lesson: "/lessons",
                            reflection: "/journal",
                            evidence: "/evidence",
                          } as Record<string, string>
                        )[kind] ?? "/portfolio"
                      )
                    }
                    className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                        <Icon size={19} />
                      </span>
                      <ChevronRight
                        size={17}
                        className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                      />
                    </div>
                    <h3 className="mt-4 font-semibold text-slate-900">
                      {info.label}
                    </h3>
                    <p className="mt-1 min-h-10 text-xs leading-relaxed text-slate-500">
                      {info.description}
                    </p>
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">
                          {required > 0
                            ? `${approved} of ${required} required approved`
                            : `${items.length} item${items.length === 1 ? "" : "s"}`}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {
                            items.filter(entry => entry.status === "draft")
                              .length
                          }{" "}
                          drafts
                        </span>
                      </div>
                      {required > 0 && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-600"
                            style={{
                              width: `${Math.min(100, (approved / required) * 100)}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  if (path === "/reviews")
    return isReviewer ? (
      <ReviewQueueDashboard onOpenEntry={id => onNavigate(`/item/${id}`)} />
    ) : (
      <Empty
        title="Reviewer access required"
        body="Only an assigned supervisor or lecturer can access this review queue."
      />
    );

  if (path === "/notifications")
    return (
      <>
        <PageTitle
          title="Notifications"
          description="In-app submission, review and deadline updates."
          action={
            <Button
              onClick={() => markRead.mutate({ all: true })}
              disabled={markRead.isPending}
            >
              <CheckCheck size={15} />
              Mark all read
            </Button>
          }
        />
        {notices.isLoading ? (
          <Loading />
        ) : notices.error ? (
          <Empty
            title="Notifications unavailable"
            body="The server could not load notifications for this account."
          />
        ) : !notices.data?.length ? (
          <Empty
            title="No notifications yet"
            body="Submission and review activity for your assigned portfolio will appear here."
          />
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {notices.data.map(note => (
              <div
                key={note.id}
                className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${note.readAt ? "" : "bg-indigo-50/40"}`}
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${note.readAt ? "bg-slate-200" : "bg-indigo-600"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{note.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(note.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!note.readAt && (
                    <Button
                      kind="quiet"
                      onClick={() => markRead.mutate({ id: note.id })}
                    >
                      Mark read
                    </Button>
                  )}
                  <Button onClick={() => onNavigate(note.href)}>
                    Open <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );

  if (path === "/admin/audit-logs")
    return (
      <>
        <PageTitle
          eyebrow="ACCESS-CONTROLLED ADMINISTRATION"
          title="Audit log"
          description={
            isPlatformAdmin
              ? "Recent administrative events across institutions; access is reserved for platform administrators."
              : "Recent administrative events in your own institution."
          }
        />
        {auditEvents.isLoading ? (
          <Loading />
        ) : auditEvents.error ? (
          <Empty
            title="Audit log unavailable"
            body="The server denied access or could not load audit records."
          />
        ) : !auditEvents.data?.length ? (
          <Empty
            title="No administrative events yet"
            body="Invitation, activation, account, requirement and review decisions appear here as they occur."
          />
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {auditEvents.data.map(event => (
              <article
                key={event.id}
                className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_190px]"
              >
                <div>
                  <p className="text-sm font-semibold capitalize text-slate-800">
                    {event.action.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {event.targetType} · record {event.targetId}
                    {event.institutionId !== null
                      ? ` · institution ${event.institutionId}`
                      : " · platform"}
                  </p>
                  {event.detail && (
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {event.detail}
                    </p>
                  )}
                </div>
                <time className="text-xs text-slate-500">
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </article>
            ))}
          </div>
        )}
      </>
    );

  if (path === "/reports")
    return (
      <>
        <PageTitle
          title="Reports"
          description="Authorized institution-scoped CSV exports."
        />
        {!isCoordinator && !isInstitutionAdmin ? (
          <Empty
            title="Reports require an assigned coordinator or institution administrator role"
            body="Report access is enforced by the server; having a URL does not grant permission."
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="font-semibold">Portfolio status export</h2>
            <p className="mt-1 text-sm text-slate-500">
              Exports entry title, category, subject, class, status, version and
              last-update date for records in your institution. It contains no
              records from other institutions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button kind="primary" onClick={() => void exportCsv()}>
                <ArrowDownToLine size={16} />
                Download CSV
              </Button>
              <Button onClick={() => window.print()}>
                <FileText size={16} />
                Print this page
              </Button>
            </div>
            {formError && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {formError}
              </p>
            )}
          </div>
        )}
      </>
    );

  if (path === "/admin/institutions")
    return <PlatformInstitutionDashboard allowed={isPlatformAdmin} />;

  if (path === "/admin/users")
    return (
      <UserActivationDashboard
        allowed={isInstitutionAdmin}
        currentUserId={user.id}
      />
    );

  if (path === "/settings")
    return (
      <>
        <PageTitle
          title="Settings"
          description="Your authenticated profile and assigned institution context."
        />
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Account</p>
              <p className="mt-1 text-sm font-semibold">
                {user.name || "Teachfolio account"}
              </p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                Assigned role{assignedRoles.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {assignedRoles
                  .map(role => role.replaceAll("_", " "))
                  .join(", ")}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Institution scope</p>
              <p className="mt-1 text-sm font-semibold">
                {institutionIdSafe
                  ? `Institution ${institutionIdSafe}`
                  : "Platform scope"}
              </p>
            </div>
          </div>
          <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Application roles are administered by an authorized administrator;
            this page does not provide a role-switch control.
          </p>
        </div>
      </>
    );

  if (path === "/admin/requirements")
    return (
      <RequirementsManager allowed={isInstitutionAdmin || isCoordinator} />
    );

  if (path === "/reports") return null;

  if (path === "/feedback") {
    const rows = entries.filter(entry =>
      ["revision_required", "approved", "rejected"].includes(entry.status)
    );
    return (
      <>
        <PageTitle
          title="Feedback and assessments"
          description="Submission outcomes for records in your authorized portfolio scope."
        />
        {isLoading ? (
          <Loading />
        ) : !rows.length ? (
          <Empty
            title="No assessment outcomes yet"
            body="Reviewer decisions and comments appear after a submitted version is assessed."
          />
        ) : (
          <EntryTable entries={rows} onOpen={id => onNavigate(`/item/${id}`)} />
        )}
      </>
    );
  }

  if (path === "/submissions") {
    const rows = entries.filter(
      entry => entry.status !== "draft" && entry.status !== "archived"
    );
    return (
      <>
        <PageTitle
          title="Submissions"
          description="Versioned records sent for supervisor or lecturer review."
        />
        {isLoading ? (
          <Loading />
        ) : !rows.length ? (
          <Empty
            title="Nothing submitted yet"
            body="Save a lesson plan or reflection and submit it when required."
            action={
              isStudent ? (
                <Button kind="primary" onClick={() => onCreate("lesson")}>
                  <Plus size={15} />
                  Create lesson plan
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EntryTable entries={rows} onOpen={id => onNavigate(`/item/${id}`)} />
        )}
      </>
    );
  }

  if (path === "/reports") return null;
  if (path === "/access-denied") return null;

  if (["/schemes", "/lessons", "/journal", "/evidence"].includes(path)) {
    const kind = kindForPath[path]!;
    const label = categoryInfo[kind].label;
    return (
      <>
        <PageTitle
          title={titleFor(path)}
          description={categoryInfo[kind].description}
          action={
            isStudent ? (
              <Button kind="primary" onClick={() => onCreate(kind)}>
                <Plus size={15} />
                Create{" "}
                {kind === "lesson"
                  ? "lesson plan"
                  : kind === "scheme"
                    ? "scheme"
                    : kind === "reflection"
                      ? "reflection"
                      : "evidence entry"}
              </Button>
            ) : undefined
          }
        />
        {listQuery.isLoading ? (
          <Loading />
        ) : listQuery.error ? (
          <Empty
            title={`${label} unavailable`}
            body="Your role cannot access this category, or the server could not load its records."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {visibleEntries.length} authorized record
                {visibleEntries.length === 1 ? "" : "s"}
                {searchTerm ? ` matching “${searchTerm}”` : ""}
              </p>
              <select
                aria-label="Filter by status"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {Object.entries(statusText)
                  .filter(([key]) => key !== "archived")
                  .map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </div>
            {visibleEntries.length ? (
              <EntryTable
                entries={visibleEntries}
                onOpen={id => onNavigate(`/item/${id}`)}
                onEdit={entry => onEdit(entry)}
                canEdit={isStudent}
              />
            ) : (
              <Empty
                title={`No ${label.toLowerCase()} yet`}
                body={
                  searchTerm
                    ? "Try a different search term or clear the search field."
                    : "Saved work appears here. Start with a draft; it is private until submitted."
                }
                action={
                  isStudent ? (
                    <Button kind="primary" onClick={() => onCreate(kind)}>
                      <Plus size={15} />
                      Create first draft
                    </Button>
                  ) : undefined
                }
              />
            )}
          </>
        )}
      </>
    );
  }

  if (path === "/notifications") return null;
  if (path === "/portfolio") return null;
  if (path === "/placement") return null;
  if (path === "/reviews") return null;

  const required =
    overview.data?.requirements.filter(item => item.required) ?? [];
  const approvedRequired = required.reduce(
    (sum, req) =>
      sum +
      Math.min(
        req.requiredCount,
        entries.filter(
          entry => entry.kind === req.category && entry.status === "approved"
        ).length
      ),
    0
  );
  const requiredTotal = required.reduce(
    (sum, req) => sum + req.requiredCount,
    0
  );
  const completion = requiredTotal
    ? Math.round((approvedRequired / requiredTotal) * 100)
    : 0;
  const counts = {
    drafts: entries.filter(
      entry => entry.userId === user.id && entry.status === "draft"
    ).length,
    review: entries.filter(entry =>
      ["submitted", "resubmitted", "under_review"].includes(entry.status)
    ).length,
    revisions: entries.filter(
      entry => entry.userId === user.id && entry.status === "revision_required"
    ).length,
    approved: entries.filter(
      entry => entry.userId === user.id && entry.status === "approved"
    ).length,
  };
  const recent = entries
    .filter(entry => (isStudent ? entry.userId === user.id : true))
    .slice(0, 6);
  return (
    <>
      <PageTitle
        eyebrow="TEACHING PRACTICE · 2026"
        title={`Good to see you${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Your placement work, reviewer feedback and next actions in one place."
        action={
          isStudent ? (
            <Button kind="primary" onClick={() => onCreate("lesson")}>
              <Plus size={16} />
              New lesson plan
            </Button>
          ) : undefined
        }
      />
      {overview.isLoading ? (
        <Loading />
      ) : overview.error ? (
        <Empty
          title="Workspace data unavailable"
          body={overview.error.message}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-sky-700">
              <GraduationCap size={17} />
            </span>
            <span className="font-semibold">
              Institution teaching-practice workspace
            </span>
            <span className="text-xs text-sky-800">
              Records are scoped by your active assignment.
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Required portfolio",
                `${completion}%`,
                `${approvedRequired} of ${requiredTotal} required items approved`,
                "text-indigo-700",
                "bg-indigo-50",
              ],
              [
                "Drafts",
                counts.drafts,
                "Your saved private work",
                "text-slate-700",
                "bg-slate-100",
              ],
              [
                "Awaiting review",
                counts.review,
                "Submitted versions",
                "text-amber-800",
                "bg-amber-50",
              ],
              [
                "Revision required",
                counts.revisions,
                `${counts.approved} approved · ${counts.revisions} need attention`,
                "text-rose-700",
                "bg-rose-50",
              ],
            ].map(([label, value, detail, color, background]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <div className="mt-2 flex items-end justify-between">
                  <span
                    className={`text-3xl font-semibold tracking-tight ${color}`}
                  >
                    {value}
                  </span>
                  <span className={`rounded-lg p-2 ${background}`}>
                    <FileText size={17} className={color as string} />
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Recent portfolio activity
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Most recently updated authorized work
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("/portfolio")}
                  className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                >
                  Open portfolio{" "}
                  <ArrowRight size={14} className="ml-1 inline" />
                </button>
              </div>
              {recent.length ? (
                <EntryTable
                  entries={recent}
                  onOpen={id => onNavigate(`/item/${id}`)}
                  compact
                />
              ) : (
                <div className="p-5">
                  <Empty
                    title="Start your teaching-practice portfolio"
                    body="Create your first lesson plan, scheme, reflection or evidence record. Your saved drafts remain private until you submit them."
                    action={
                      isStudent ? (
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button
                            kind="primary"
                            onClick={() => onCreate("lesson")}
                          >
                            <Plus size={15} />
                            Lesson plan
                          </Button>
                          <Button onClick={() => onCreate("reflection")}>
                            Reflection
                          </Button>
                        </div>
                      ) : undefined
                    }
                  />
                </div>
              )}
            </section>
            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold tracking-wider text-indigo-600">
                      NEXT UP
                    </p>
                    <h2 className="mt-1 font-semibold">Your priorities</h2>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700">
                    <Clock3 size={17} />
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {counts.revisions > 0 ? (
                    <button
                      onClick={() => onNavigate("/feedback")}
                      className="flex w-full gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-left"
                    >
                      <span className="mt-1 h-2 w-2 rounded-full bg-rose-600" />
                      <span>
                        <b className="block text-sm text-rose-900">
                          Open reviewer feedback
                        </b>
                        <span className="mt-1 block text-xs text-rose-800">
                          {counts.revisions} item
                          {counts.revisions === 1 ? "" : "s"} returned for
                          revision
                        </span>
                      </span>
                    </button>
                  ) : (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      No revision requests waiting on you.
                    </p>
                  )}
                  {counts.drafts > 0 && (
                    <button
                      onClick={() => onNavigate("/lessons")}
                      className="flex w-full gap-3 rounded-xl border border-slate-200 p-3 text-left"
                    >
                      <span className="mt-1 h-2 w-2 rounded-full bg-slate-400" />
                      <span>
                        <b className="block text-sm text-slate-800">
                          Finish a saved draft
                        </b>
                        <span className="mt-1 block text-xs text-slate-500">
                          {counts.drafts} private draft
                          {counts.drafts === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                  )}
                  {counts.drafts === 0 && counts.revisions === 0 && (
                    <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                      You are up to date. Keep your portfolio current with your
                      next reflection.
                    </p>
                  )}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-semibold">Quick actions</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ["Lesson plan", "lesson"],
                    ["Scheme", "scheme"],
                    ["Reflection", "reflection"],
                    ["Evidence", "evidence"],
                  ].map(([label, kind]) => (
                    <button
                      key={kind}
                      onClick={() => onCreate(kind as Entry["kind"])}
                      className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200 px-3 text-left text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                    >
                      <Plus size={14} className="text-indigo-600" />
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck
              size={14}
              className="mt-0.5 shrink-0 text-emerald-600"
            />
            Portfolio progress reflects approved work against active institution
            requirements. This account view is limited to its authorized
            institution and assigned records.
          </p>
        </>
      )}
    </>
  );
}

function EntryTable({
  entries,
  onOpen,
  onEdit,
  canEdit = false,
  compact = false,
}: {
  entries: Entry[];
  onOpen: (id: number) => void;
  onEdit?: (entry: Entry) => void;
  canEdit?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {entries.map(entry => (
        <div
          className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
          key={entry.id}
        >
          <button
            type="button"
            onClick={() => onOpen(entry.id)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-sm font-semibold text-slate-800 hover:text-indigo-700">
              {entry.title}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {categoryInfo[entry.kind]?.label ?? entry.kind} ·{" "}
              {entry.subject || "—"} · {entry.className || "—"}
            </span>
          </button>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <Status status={entry.status} />
            {!compact && (
              <span className="hidden text-xs text-slate-400 sm:inline">
                {entry.lessonDate ||
                  new Date(entry.updatedAt).toLocaleDateString()}
              </span>
            )}
            {canEdit &&
              ["draft", "revision_required"].includes(entry.status) &&
              onEdit && (
                <button
                  type="button"
                  aria-label={`Edit ${entry.title}`}
                  onClick={() => onEdit(entry)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  Edit
                </button>
              )}
          </div>
        </div>
      ))}
    </div>
  );
}

type RequirementRow = {
  id: number;
  category: string;
  label: string;
  requiredCount: number;
  required: boolean;
  deadline: string | null;
};
function RequirementsManager({ allowed }: { allowed: boolean }) {
  const requirements = trpc.admin.requirements.useQuery(undefined, {
    enabled: allowed,
    retry: false,
  });
  const utils = trpc.useUtils();
  const update = trpc.admin.updateRequirement.useMutation({
    onSuccess: async () => {
      await utils.admin.requirements.invalidate();
      await utils.portfolio.overview.invalidate();
    },
  });
  if (!allowed)
    return (
      <>
        <PageTitle
          title="Portfolio requirements"
          description="Configure institution-wide completion expectations and deadlines."
        />
        <Empty
          title="Coordinator or institution administrator role required"
          body="Requirement changes are limited to the current institution and are recorded in the audit history."
        />
      </>
    );
  if (requirements.isLoading) return <Loading />;
  if (requirements.error)
    return (
      <>
        <PageTitle
          title="Portfolio requirements"
          description="Configure institution-wide completion expectations and deadlines."
        />
        <Empty
          title="Requirements unavailable"
          body={requirements.error.message}
        />
      </>
    );
  return (
    <>
      <PageTitle
        title="Portfolio requirements"
        description="Set the approval target and deadline for each category. Optional items never contribute to the required completion total."
      />
      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
        Changes apply only to the institution in your active assignment and are
        added to the administrative audit log.
      </div>
      <div className="space-y-3">
        {requirements.data?.map(item => (
          <RequirementEditor
            key={item.id}
            item={item}
            saving={update.isPending}
            onSave={value => update.mutate(value)}
          />
        ))}
      </div>
      {!requirements.data?.length && (
        <Empty
          title="No portfolio requirements configured"
          body="A platform administrator may initialize the institution requirement set."
        />
      )}
      {update.error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {update.error.message}
        </p>
      )}
    </>
  );
}
function RequirementEditor({
  item,
  saving,
  onSave,
}: {
  item: RequirementRow;
  saving: boolean;
  onSave: (value: {
    id: number;
    requiredCount: number;
    required: boolean;
    deadline: string | null;
  }) => void;
}) {
  const [count, setCount] = useState(item.requiredCount);
  const [required, setRequired] = useState(item.required);
  const [deadline, setDeadline] = useState(item.deadline ?? "");
  return (
    <form
      className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_110px_150px_170px] sm:items-end"
      onSubmit={event => {
        event.preventDefault();
        if (!window.confirm(`Save requirement settings for ${item.label}?`))
          return;
        onSave({
          id: item.id,
          requiredCount: Number(count),
          required,
          deadline: deadline || null,
        });
      }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          {item.category.replaceAll("_", " ")}
        </p>
        <p className="mt-1 font-semibold">{item.label}</p>
      </div>
      <label className="text-xs font-medium text-slate-600">
        Target count
        <input
          type="number"
          min={0}
          max={100}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
          value={count}
          onChange={event => setCount(Number(event.target.value))}
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Deadline
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
          value={deadline}
          onChange={event => setDeadline(event.target.value)}
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={required}
            onChange={event => setRequired(event.target.checked)}
          />
          Required
        </label>
        <button
          disabled={saving}
          className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}
