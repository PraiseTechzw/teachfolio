import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  FileClock,
  MapPin,
  Settings2,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const statusMeta = [
  { key: "approved", label: "Approved", color: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "under_review", label: "Under review", color: "bg-amber-400", dot: "bg-amber-400" },
  { key: "submitted", label: "Submitted", color: "bg-blue-500", dot: "bg-blue-500" },
  { key: "resubmitted", label: "Resubmitted", color: "bg-violet-500", dot: "bg-violet-500" },
  { key: "revision_required", label: "Revision required", color: "bg-rose-500", dot: "bg-rose-500" },
  { key: "draft", label: "Draft", color: "bg-slate-300", dot: "bg-slate-300" },
  { key: "rejected", label: "Rejected", color: "bg-red-700", dot: "bg-red-700" },
  { key: "archived", label: "Archived", color: "bg-slate-200", dot: "bg-slate-300" },
] as const;

const dateLabel = (value: Date | string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const statusStyle = (status: string) => {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (["submitted", "under_review", "resubmitted"].includes(status)) return "bg-blue-50 text-blue-700";
  if (status === "revision_required" || status === "rejected") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
};

function Metric({
  label,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  tone: string;
  loading: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,.035)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500 sm:text-[13px]">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-[-.04em] text-slate-900">{loading ? <span className="text-slate-300">—</span> : value.toLocaleString()}</p>
    </article>
  );
}

export default function InstitutionAdminOverview({
  name,
  onNavigate,
}: {
  name: string | null;
  onNavigate: (path: string) => void;
}) {
  const portfolio = trpc.portfolio.overview.useQuery(undefined, { retry: false });
  const summary = trpc.admin.dashboardSummary.useQuery(undefined, { retry: false });
  const audit = trpc.admin.audit.useQuery({ page: 1, pageSize: 25, search: "" }, { retry: false });
  const entries = portfolio.data?.entries ?? [];
  const firstName = name?.trim().split(/\s+/)[0] || "there";
  const counts = new Map(summary.data?.portfolioStatuses.map(row => [row.status, row.count]) ?? []);
  const reviewCount = (counts.get("submitted") ?? 0) + (counts.get("under_review") ?? 0) + (counts.get("resubmitted") ?? 0);
  const rows = statusMeta.map(status => ({ ...status, count: counts.get(status.key) ?? 0 })).filter(status => status.count > 0);
  const totalRecords = rows.reduce((total, row) => total + row.count, 0);
  const error = summary.error || portfolio.error;
  const pending = summary.isLoading || Boolean(summary.error);

  const actions = [
    { label: "Members", icon: Users, path: "/admin/users" },
    { label: "Placements", icon: MapPin, path: "/admin/placements" },
    { label: "Requirements", icon: Settings2, path: "/admin/requirements" },
    { label: "Export report", icon: ArrowDownToLine, path: "/reports" },
  ];

  return (
    <div className="space-y-4 pb-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#465fff]">Institution administration</p>
          <h1 className="mt-1.5 text-[27px] font-semibold leading-tight tracking-[-.04em] text-slate-950 sm:text-[32px]">Welcome back, {firstName}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500"><Building2 size={14} /> <span className="truncate">{portfolio.data?.tenantName ?? "Institution workspace"}</span></p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onNavigate("/admin/placements")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"><MapPin size={15} /> New placement</button>
          <button type="button" onClick={() => onNavigate("/admin/users")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#465fff] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3549db]"><UserRoundPlus size={15} /> Invite member</button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">Some dashboard information could not be loaded.</p>}

      <section aria-label="Institution figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active assignments" value={summary.data?.activeAssignments ?? 0} icon={Users} tone="bg-blue-50 text-blue-700" loading={pending} />
        <Metric label="Pending invitations" value={summary.data?.pendingInvitations ?? 0} icon={UserRoundPlus} tone="bg-violet-50 text-violet-700" loading={pending} />
        <Metric label="Active placements" value={summary.data?.activePlacements ?? 0} icon={CalendarDays} tone="bg-emerald-50 text-emerald-700" loading={pending} />
        <Metric label="Awaiting review" value={reviewCount} icon={FileClock} tone="bg-amber-50 text-amber-700" loading={pending} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,.78fr)]">
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,.035)]">
            <div className="flex items-center justify-between gap-4 px-5 pt-5">
              <div><h2 className="text-sm font-semibold text-slate-900">Portfolio overview</h2><p className="mt-1 text-xs text-slate-500">Submission status across your institution</p></div>
              <div className="text-right"><span className="block text-2xl font-semibold leading-none tracking-tight text-slate-900">{pending ? "—" : totalRecords.toLocaleString()}</span><span className="mt-1 block text-[11px] text-slate-400">records</span></div>
            </div>
            <div className="px-5 pb-5 pt-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Portfolio status for ${totalRecords} records`}>
                {rows.map(row => <span key={row.key} className={`${row.color} first:rounded-l-full last:rounded-r-full`} style={{ width: `${(row.count / Math.max(totalRecords, 1)) * 100}%` }} title={`${row.label}: ${row.count}`} />)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                {rows.map(row => <div key={row.key} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-2 text-slate-500"><i className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} /><span className="truncate">{row.label}</span></span><b className="font-semibold text-slate-800">{row.count.toLocaleString()}</b></div>)}
                {!rows.length && <p className="col-span-full py-2 text-sm text-slate-500">{pending ? "Loading portfolio…" : "No portfolio records yet."}</p>}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,.035)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Recent portfolio activity</h2><p className="mt-0.5 text-xs text-slate-500">Latest updates</p></div><button type="button" onClick={() => onNavigate("/submissions")} className="inline-flex items-center gap-1 text-xs font-semibold text-[#465fff] hover:underline">View all <ArrowRight size={13} /></button></div>
            {portfolio.isLoading ? <p role="status" className="px-5 py-5 text-sm text-slate-500">Loading activity…</p> : entries.length ? <div className="divide-y divide-slate-100">{entries.slice(0, 5).map(entry => <button type="button" key={entry.id} onClick={() => onNavigate(`/item/${entry.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500"><ClipboardList size={16} /></span><span className="min-w-0 flex-1"><b className="block truncate text-xs font-semibold text-slate-800">{entry.title}</b><span className="mt-1 block truncate text-[11px] capitalize text-slate-500">{entry.kind.replaceAll("_", " ")} · {entry.subject || "—"}</span></span><span className={`hidden rounded-full px-2 py-1 text-[10px] font-semibold capitalize sm:block ${statusStyle(entry.status)}`}>{entry.status.replaceAll("_", " ")}</span><time className="shrink-0 text-[11px] text-slate-400">{dateLabel(entry.updatedAt)}</time></button>)}</div> : <p className="px-5 py-6 text-sm text-slate-500">No portfolio records yet.</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,.035)]">
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Institution tools</h2><p className="mt-1 text-xs text-slate-500">Manage your workspace</p></div><Settings2 size={17} className="text-slate-400" /></div>
            <div className="mt-4 grid grid-cols-2 gap-2">{actions.map(action => { const Icon = action.icon; return <button type="button" key={action.path} onClick={() => onNavigate(action.path)} className="flex min-h-[82px] flex-col items-start justify-between rounded-lg border border-slate-100 bg-[#fbfcfe] p-3 text-left transition hover:border-indigo-100 hover:bg-indigo-50/50"><Icon size={17} className="text-[#465fff]" /><span className="text-xs font-semibold text-slate-700">{action.label}</span></button>; })}</div>
          </section>

          <section className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,.035)]">
            <div className="flex items-center justify-between px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Recent admin activity</h2><p className="mt-0.5 text-xs text-slate-500">Institution audit log</p></div><Bell size={16} className="text-slate-400" /></div>
            {audit.isLoading ? <p role="status" className="px-5 pb-5 text-xs text-slate-500">Loading…</p> : audit.error ? <p className="px-5 pb-5 text-xs text-slate-500">Activity unavailable.</p> : audit.data?.rows.length ? <div className="divide-y divide-slate-100">{audit.data.rows.slice(0, 4).map(event => <div key={event.id} className="flex gap-2.5 px-5 py-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><ShieldCheck size={12} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold capitalize text-slate-700">{event.action.replaceAll("_", " ")}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{event.detail || event.targetType}</p></div><time className="shrink-0 text-[10px] text-slate-400">{dateLabel(event.createdAt)}</time></div>)}</div> : <p className="px-5 pb-5 text-xs text-slate-500">No admin activity yet.</p>}
            <button type="button" onClick={() => onNavigate("/admin/audit-logs")} className="flex w-full items-center justify-between border-t border-slate-100 px-5 py-3 text-xs font-semibold text-[#465fff] hover:bg-slate-50">Open audit log <ArrowRight size={13} /></button>
          </section>

          <button type="button" onClick={() => onNavigate("/notifications")} className="flex w-full items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-[0_1px_3px_rgba(15,23,42,.035)] hover:border-indigo-100"><span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-[#465fff]"><BookOpenCheck size={17} /></span><span className="flex-1"><b className="block text-xs font-semibold text-slate-800">Portfolio reviews</b><span className="mt-1 block text-[11px] text-slate-500">{pending ? "—" : reviewCount.toLocaleString()} items awaiting review</span></span><ArrowRight size={15} className="text-slate-400" /></button>
        </aside>
      </div>
    </div>
  );
}
