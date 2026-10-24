import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  CirclePause,
  Clock3,
  Plus,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function PanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 font-semibold text-rose-800 hover:bg-rose-100"
      >
        <RotateCw size={14} /> Retry
      </button>
    </div>
  );
}

export default function PlatformAdminOverview({
  name,
  onNavigate,
}: {
  name: string | null;
  onNavigate: (path: string) => void;
}) {
  const institutions = trpc.admin.institutions.useQuery(undefined, {
    retry: false,
  });
  const audit = trpc.admin.audit.useQuery(undefined, { retry: false });
  const summary = trpc.admin.platformSummary.useQuery(undefined, { retry: false });
  const allRows = institutions.data ?? [];
  const rows = allRows.filter(row => !row.isDemo);
  const hasPracticeWorkspaces = allRows.some(row => row.isDemo);
  const activeCount = rows.filter(row => row.active).length;
  const pausedCount = rows.length - activeCount;
  const latestInstitutions = rows.slice(0, 5);
  const latestEvents = audit.data?.slice(0, 5) ?? [];
  const firstName = name?.trim().split(/\s+/)[0] || "there";

  const metrics = [
    {
      label: "Institution workspaces",
      value:
        institutions.isLoading || institutions.error ? "—" : rows.length,
      detail: "Newest records in the directory",
      icon: Building2,
      tone: "indigo",
    },
    {
      label: "Active workspaces",
      value:
        institutions.isLoading || institutions.error ? "—" : activeCount,
      detail: "Within the directory results",
      icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "Paused workspaces",
      value:
        institutions.isLoading || institutions.error ? "—" : pausedCount,
      detail: "Access currently suspended",
      icon: CirclePause,
      tone: "amber",
    },
    {
      label: "Latest audit activity",
      value: audit.isLoading
        ? "—"
        : audit.error
          ? "Unavailable"
        : audit.data?.[0]
          ? formatDate(audit.data[0].createdAt)
          : "None yet",
      detail: audit.error ? "Audit feed unavailable" : "Platform-wide record",
      icon: Activity,
      tone: "blue",
    },
  ] as const;

  const tones = {
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-sky-50 text-sky-700",
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-indigo-600">
            Platform administration
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Good to see you, {firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Manage institution access and review recent platform administration
            activity from one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("/admin/institutions")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
        >
          <Plus size={17} /> Create institution
        </button>
      </header>

      <section
        aria-label="Institution workspace summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map(metric => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-slate-900">
                    {metric.value}
                  </p>
                </div>
                <span className={`rounded-xl p-2.5 ${tones[metric.tone]}`}>
                  <Icon size={19} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <section aria-label="Platform usage" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["User accounts", summary.data?.users],
          ["Pending invitations", summary.data?.pendingInvitations],
          ["Submissions awaiting review", summary.data?.pendingSubmissions],
          ["Evidence storage", summary.data ? `${summary.data.evidenceFiles} files · ${(summary.data.evidenceBytes / 1024 / 1024).toFixed(1)} MB` : undefined],
        ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{summary.isLoading || summary.error ? "—" : value}</p></article>)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-900">
                Institution workspaces
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                The newest institutions registered on the platform
              </p>
              {hasPracticeWorkspaces && (
                <p className="mt-1 text-xs text-slate-500">
                  Reserved practice workspaces are excluded from institution totals.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigate("/admin/institutions")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              View directory <ArrowRight size={14} />
            </button>
          </div>
          {institutions.isLoading ? (
            <div role="status" className="p-6 text-sm text-slate-500">
              Loading institution records…
            </div>
          ) : institutions.error ? (
            <div className="p-4 sm:p-5">
              <PanelError
                message="Institution records could not be loaded."
                onRetry={() => void institutions.refetch()}
              />
            </div>
          ) : latestInstitutions.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <Building2 size={20} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                No institution workspaces yet
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Create an institution, then invite its first administrator to
                begin onboarding.
              </p>
              <button
                type="button"
                onClick={() => onNavigate("/admin/institutions")}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Create first institution <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {latestInstitutions.map(institution => (
                <li
                  key={institution.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                      <Building2 size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {institution.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {institution.code} · Created {formatDate(institution.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${institution.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {institution.active ? "Active" : "Paused"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!institutions.error && rows.length > latestInstitutions.length && (
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
              Showing 5 of the newest {rows.length} directory records.
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-900">Recent activity</h2>
              <p className="mt-1 text-xs text-slate-500">
                Latest platform audit events
              </p>
            </div>
            <span className="grid size-9 place-items-center rounded-lg bg-violet-50 text-violet-700">
              <ShieldCheck size={18} />
            </span>
          </div>
          {audit.isLoading ? (
            <div role="status" className="p-6 text-sm text-slate-500">
              Loading audit activity…
            </div>
          ) : audit.error ? (
            <div className="p-4 sm:p-5">
              <PanelError
                message="Platform audit activity could not be loaded."
                onRetry={() => void audit.refetch()}
              />
            </div>
          ) : latestEvents.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <Clock3 size={19} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                No platform activity recorded yet
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Administrative actions will appear here as they occur.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-slate-100">
              {latestEvents.map(event => (
                <li key={event.id} className="flex gap-3 px-5 py-4 sm:px-6">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                    <Activity size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold capitalize text-slate-800">
                      {event.action.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {event.targetType} · record {event.targetId}
                      {event.institutionId === null
                        ? " · platform"
                        : ` · institution ${event.institutionId}`}
                    </p>
                    <time className="mt-1.5 block text-[11px] text-slate-400">
                      {new Date(event.createdAt).toLocaleString()}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <button
            type="button"
            onClick={() => onNavigate("/admin/audit-logs")}
            className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-slate-100 px-5 text-sm font-semibold text-indigo-700 hover:bg-slate-50"
          >
            Open audit log <ArrowRight size={15} />
          </button>
        </section>
      </div>

      <aside className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm">
            <ShieldCheck size={19} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Institution data stays within its authorized workspace
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Platform overview shows institution administration and audit
              metadata. Student portfolios are opened only within an assigned
              institution workspace.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("/admin/institutions")}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          Manage institutions <ArrowRight size={15} />
        </button>
      </aside>
    </div>
  );
}
