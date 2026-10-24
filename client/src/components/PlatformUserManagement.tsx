import { useMemo, useState } from "react";
import { Search, ShieldCheck, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function PlatformUserManagement() {
  const rowsQuery = trpc.admin.platformUsers.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const setStatus = trpc.admin.setPlatformAssignmentStatus.useMutation({ onSuccess: async () => { await utils.admin.platformUsers.invalidate(); } });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rowsQuery.data ?? []).filter(row => `${row.name ?? ""} ${row.email ?? ""} ${row.institutionName ?? "Platform"} ${row.role ?? ""}`.toLowerCase().includes(q));
  }, [rowsQuery.data, search]);
  return <div className="space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Platform administration</p><h1 className="mt-2 text-2xl font-semibold">User management</h1><p className="mt-2 text-sm text-slate-500">Search accounts across institutions and suspend or reactivate institution access assignments.</p></header>
    <label className="flex max-w-xl items-center gap-2 rounded-xl border bg-white px-3"><Search size={17}/><input className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder="Search name, email, institution, or role" value={search} onChange={event => setSearch(event.target.value)}/></label>
    {rowsQuery.isLoading ? <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">Loading platform users…</p> : rowsQuery.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">User records could not be loaded.</p> : !rows.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No matching user assignments.</p> : <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Account</th><th className="p-3">Institution</th><th className="p-3">Role</th><th className="p-3">Last sign in</th><th className="p-3">Access</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={`${row.userId}-${row.assignmentId ?? "none"}-${index}`}><td className="p-3"><span className="flex items-center gap-2"><UserRound size={16}/><span><b className="block">{row.name || "Unnamed account"}</b><span className="text-xs text-slate-500">{row.email || "No email"}</span></span></span></td><td className="p-3">{row.institutionName ?? (row.assignmentId ? `Institution ${row.institutionId}` : "No active assignment")}</td><td className="p-3 capitalize">{row.role?.replaceAll("_", " ") ?? "—"}</td><td className="p-3">{row.lastSignedIn ? new Date(row.lastSignedIn).toLocaleDateString() : "—"}</td><td className="p-3 capitalize">{row.status ?? "unassigned"}</td><td className="p-3">{row.assignmentId && row.role !== "platform_admin" && <button disabled={setStatus.isPending} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50" onClick={() => setStatus.mutate({ assignmentId: row.assignmentId!, status: row.status === "suspended" ? "active" : "suspended" })}><ShieldCheck size={14} className="mr-1 inline"/>{row.status === "suspended" ? "Reactivate" : "Suspend"}</button>}</td></tr>)}</tbody></table></div>}
    {setStatus.error && <p role="alert" className="text-sm text-rose-700">{setStatus.error.message}</p>}
  </div>;
}
