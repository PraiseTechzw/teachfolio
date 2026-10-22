import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import PortfolioFormDialog from "@/components/PortfolioFormDialog";
import Workspace from "@/pages/Workspace";
import { Bell, BookOpen, ChevronDown, CircleHelp, ClipboardList, FileText, FolderHeart, GraduationCap, LayoutDashboard, LogOut, Menu, MessageSquareText, ScrollText, Search, Settings, ShieldCheck, Users, X } from "lucide-react";
import { useLocation } from "wouter";

type Kind = "scheme" | "lesson" | "reflection" | "evidence" | "observation" | "supporting_document" | "final_report";
type Entry = { id: number; kind: Kind; title: string; subject: string; className: string; lessonDate: string; status: string; payload: Record<string, unknown> };
type Access = { id: number; name: string | null; email: string | null; openId: string; activated: boolean; institutionId: number | null; roles: string[] };
const navBase = [
  { label: "Overview", path: "/", icon: LayoutDashboard, roles: ["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin", "platform_admin"] },
  { label: "My placement", path: "/placement", icon: GraduationCap, roles: ["student_teacher"] },
  { label: "My portfolio", path: "/portfolio", icon: FolderHeart, roles: ["student_teacher"] },
  { label: "Schemes of work", path: "/schemes", icon: BookOpen, roles: ["student_teacher"] },
  { label: "Lesson plans", path: "/lessons", icon: FileText, roles: ["student_teacher"] },
  { label: "Reflective journal", path: "/journal", icon: ScrollText, roles: ["student_teacher"] },
  { label: "Teaching evidence", path: "/evidence", icon: ClipboardList, roles: ["student_teacher"] },
  { label: "Submissions", path: "/submissions", icon: FileText, roles: ["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin"] },
  { label: "Review queue", path: "/reviews", icon: MessageSquareText, roles: ["supervisor", "lecturer"] },
  { label: "Feedback & assessments", path: "/feedback", icon: ShieldCheck, roles: ["student_teacher", "supervisor", "lecturer"] },
  { label: "Reports", path: "/reports", icon: ClipboardList, roles: ["coordinator", "institution_admin"] },
  { label: "Portfolio requirements", path: "/admin/requirements", icon: Settings, roles: ["coordinator", "institution_admin"] },
  { label: "Notifications", path: "/notifications", icon: Bell, roles: ["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin", "platform_admin"] },
  { label: "User activation", path: "/admin/users", icon: Users, roles: ["institution_admin"] },
  { label: "Audit log", path: "/admin/audit-logs", icon: ShieldCheck, roles: ["institution_admin", "platform_admin"] },
  { label: "Institution administration", path: "/admin/institutions", icon: ShieldCheck, roles: ["platform_admin"] },
  { label: "Settings", path: "/settings", icon: Settings, roles: ["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin", "platform_admin"] },
];

function Brand() { return <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-700 text-white shadow-sm"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true"><path d="M5 4.5h10.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M8.5 8h6M8.5 11.5h6M9 16l1.6 1.6 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M17.5 7H20v13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span><span><strong className="block text-[15px] font-semibold tracking-tight text-slate-900">Teachfolio</strong><span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Practice portfolio</span></span></div>; }
function LoadingScreen() { return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />Verifying your account…</div></div>; }
function SignInScreen({ error }: { error?: string }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  const signup = trpc.auth.register.useMutation({ onSuccess: async result => {
    if (result.requiresEmailConfirmation) setNotice("Check your email for a confirmation link, then return here to sign in.");
    else await utils.auth.me.invalidate();
  } });
  const pending = login.isPending || signup.isPending;
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setFormError(""); setNotice("");
    const onError = (cause: { message: string }) => setFormError(cause.message);
    if (register) signup.mutate({ email, name, password }, { onError });
    else login.mutate({ email, password }, { onError });
  };
  return <div className="min-h-screen bg-[#f7f8fb] px-4 py-12"><div className="mx-auto flex max-w-md flex-col items-center"><Brand /><section className="mt-10 w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><p className="text-xs font-bold tracking-[.18em] text-indigo-600">STUDENT TEACHER E-PORTFOLIO</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{register ? "Create your account." : "Welcome back."}</h1><p className="mt-2 text-sm leading-relaxed text-slate-500">Use your email and password. Portfolio access is granted only after an authorized administrator activates your account.</p><form className="mt-6 space-y-4" onSubmit={submit}>
    {register && <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Full name</span><input required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>}
    <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Email</span><input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Password</span><input required minLength={register ? 12 : 1} maxLength={128} type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />{register && <span className="block text-xs text-slate-500">Use at least 12 characters.</span>}</label>
    <button disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"><ShieldCheck size={16} />{pending ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
    </form>{notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}{(formError || error) && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{formError || error}</p>}<button type="button" onClick={() => { setRegister(!register); setFormError(""); setNotice(""); }} className="mt-5 w-full text-sm font-medium text-indigo-700">{register ? "Already have an account? Sign in" : "New here? Create an account"}</button><div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Creating an account does not grant a role. An institution administrator must issue an invitation to your email before you can access portfolio data.</div></section><p className="mt-5 text-center text-xs text-slate-400">Fictional training workspace · institution policies apply</p></div></div>;
}

function ActivationScreen({ user, onComplete }: { user: Access; onComplete: () => void }) {
  const [token, setToken] = useState(new URLSearchParams(window.location.search).get("invite") ?? "");
  const [error, setError] = useState("");
  const redeem = trpc.auth.claimInvitation.useMutation({ onSuccess: onComplete });
  return <div className="min-h-screen bg-[#f7f8fb] px-4 py-12"><div className="mx-auto flex max-w-lg flex-col items-center"><Brand /><section className="mt-10 w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><ShieldCheck size={23} /></div><p className="mt-5 text-xs font-bold uppercase tracking-[.17em] text-amber-700">Application access locked</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Your account is not active yet.</h1><p className="mt-2 text-sm leading-relaxed text-slate-600">You’re signed in as <strong>{user.name || user.email || "your account"}</strong>, but no administrator-assigned role is active. Portfolio data remains inaccessible until an institution administrator issues and activates an invitation.</p>{user.email ? <p className="mt-3 text-xs text-slate-500">Invitations must be issued to this account email: <strong>{user.email}</strong></p> : <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Your account does not have an email address available to match an invitation. Ask your administrator about the institution's account policy.</p>}<form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); setError(""); redeem.mutate({ token: token.trim() }, { onError: cause => setError(cause.message) }); }}><label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Administrator-issued invitation token</span><input className="w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste the one-time invitation token" autoComplete="off" /></label><button disabled={!user.email || token.trim().length < 20 || redeem.isPending} className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-45">{redeem.isPending ? "Verifying invitation…" : "Redeem invitation"}</button></form>{error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500"><p>The invitation fixes your institution and role; you cannot choose or change either. It is single-use, expires after seven days, and only works for the email address it was issued to. No portfolio records are shown on this page.</p></div><button onClick={() => { try { } catch {} window.location.reload(); }} className="mt-5 text-sm font-medium text-slate-600 hover:text-slate-900">Sign in as a different account</button></section></div></div>;
}

export default function App() {
  const [path, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<Kind>("lesson");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [search, setSearch] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [csrfReady, setCsrfReady] = useState(false);
  const [csrfError, setCsrfError] = useState("");
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({ onSuccess: async () => { try { sessionStorage.removeItem("teachfolio-csrf"); } catch {} await utils.auth.me.invalidate(); } });
  const access = me.data as Access | null | undefined;
  const alerts = trpc.notifications.mine.useQuery(undefined, { enabled: Boolean(access?.activated), retry: false });
  const unread = alerts.data?.filter(note => !note.readAt).length ?? 0;
  const allowedNav = useMemo(() => navBase.filter(item => access?.roles.some(role => item.roles.includes(role))), [access?.roles]);
  useEffect(() => {
    let cancelled = false;
    if (!access?.id) { setCsrfReady(false); setCsrfError(""); return; }
    setCsrfReady(false); setCsrfError("");
    const headers: Record<string, string> = {};
    void fetch("/api/csrf", { credentials: "include", headers }).then(async response => {
      if (!response.ok) throw new Error("The authenticated session could not be verified for secure actions.");
      const result = await response.json() as { token?: string };
      if (!result.token) throw new Error("The server did not issue a secure request token.");
      if (cancelled) return;
      sessionStorage.setItem("teachfolio-csrf", result.token);
      setCsrfReady(true);
    }).catch(reason => { if (!cancelled) setCsrfError(reason instanceof Error ? reason.message : "Secure request setup failed."); });
    return () => { cancelled = true; };
  }, [access?.id]);
  useEffect(() => { setMenuOpen(false); setSearch(""); }, [path]);

  if (me.isLoading) return <LoadingScreen />;
  if (me.error || access === null || access === undefined) return <SignInScreen error={me.error?.message === "Failed to fetch" ? "The application service could not be reached. Try again in a moment." : undefined} />;
  if (!csrfReady) return <div><LoadingScreen />{csrfError && <div className="fixed inset-x-4 bottom-5 mx-auto max-w-md rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-lg">{csrfError}<button onClick={() => window.location.reload()} className="ml-2 font-semibold underline">Retry</button></div>}</div>;
  if (!access.activated) return <ActivationScreen user={access} onComplete={async () => { await utils.auth.me.invalidate(); }} />;

  const openCreate = (kind: Kind = "lesson") => { setEditing(null); setFormKind(kind); setFormOpen(true); };
  const openEdit = (entry: Entry) => { setEditing(entry); setFormKind(entry.kind); setFormOpen(true); };
  const displayPath = path.match(/^\/item\/\d+$/) ? "/portfolio" : path;
  const breadcrumb = allowedNav.find(item => item.path === displayPath)?.label ?? (path.startsWith("/item/") ? "Record detail" : "Workspace");
  const roleLabel = access.roles.map(role => role.replaceAll("_", " ")).join(" · ");
  const isPlatform = access.roles.includes("platform_admin");
  return <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
    {menuOpen && <button aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex h-16 items-center justify-between border-b border-slate-100 px-5"><Brand /><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div><div className="px-4 pt-5"><div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="truncate text-xs font-semibold capitalize text-slate-800">{roleLabel || "No active role"}</p><p className="mt-1 text-[11px] text-slate-500">{isPlatform ? "Platform access" : access.institutionId ? `Institution ${access.institutionId}` : "Authorized workspace"}</p></div></div><nav aria-label="Primary navigation" className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4">{allowedNav.map(item => { const active = displayPath === item.path || (item.path === "/portfolio" && path.startsWith("/item/")); const Icon = item.icon; return <button key={item.path} type="button" onClick={() => navigate(item.path)} aria-current={active ? "page" : undefined} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition ${active ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon size={17} className={active ? "text-indigo-700" : "text-slate-400"} /><span className="flex-1">{item.label}</span>{item.path === "/notifications" && unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}</button>; })}</nav><div className="border-t border-slate-100 p-3"><div className="flex items-center gap-2 rounded-xl p-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800">{(access.name || access.email || "U").slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{access.name || "Authenticated user"}</p><p className="truncate text-[11px] text-slate-500">{access.email}</p></div><button type="button" aria-label="Sign out" title="Sign out" onClick={() => logout.mutate()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><LogOut size={16} /></button></div><p className="px-2 pb-1 text-[10px] text-slate-400">Secure portfolio · demo content not institutional results</p></div></aside>
    <div className="min-h-screen lg:pl-[270px]"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8"><button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu size={19} /></button><div className="hidden text-xs text-slate-400 sm:block">Teachfolio <span className="mx-1.5">/</span> <span className="font-medium text-slate-700">{breadcrumb}</span></div><div className="relative ml-auto flex w-full max-w-md items-center sm:ml-6"><Search size={16} className="absolute left-3 text-slate-400" /><input aria-label="Search authorized portfolio records" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your authorized records…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100" /></div><button onClick={() => navigate("/notifications")} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"><Bell size={18} />{unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white" />}</button><button onClick={() => setHelpOpen(true)} className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 sm:inline-flex"><CircleHelp size={16} />Help</button><div className="hidden h-7 border-l border-slate-200 md:block" /><button onClick={() => navigate("/settings")} className="hidden items-center gap-2 rounded-lg p-1.5 hover:bg-slate-50 sm:flex"><span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-800">{(access.name || "U").slice(0, 1).toUpperCase()}</span><ChevronDown size={14} className="text-slate-400" /></button></div></header><main id="main-content" className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8"><Workspace path={path} searchTerm={search} user={access} onCreate={openCreate} onEdit={openEdit} onNavigate={navigate} /></main></div>
    {helpOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHelpOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="help-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Help & privacy</p><h2 id="help-title" className="mt-1 text-xl font-semibold">Using your portfolio</h2></div><button onClick={() => setHelpOpen(false)} aria-label="Close help" className="rounded p-1 text-slate-500"><X size={18} /></button></div><div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600"><p>Save a draft before submitting. A submitted version is read-only while under review; if revisions are requested, edit a new revision and resubmit.</p><p>Only upload identifiable learner media when your school and, where applicable, guardians have authorized it. Keep learner media private and follow your institution’s retention policy.</p><p>Contact your institution administrator for access changes, portfolio requirements, placement questions, or an invitation. This prototype does not send email or SMS.</p></div><button onClick={() => setHelpOpen(false)} className="mt-5 w-full rounded-lg bg-indigo-700 py-2.5 text-sm font-semibold text-white">Got it</button></section></div>}
    <PortfolioFormDialog open={formOpen} kind={formKind} entry={editing} onClose={() => setFormOpen(false)} onSaved={id => navigate(`/item/${id}`)} />
  </div>;
}
