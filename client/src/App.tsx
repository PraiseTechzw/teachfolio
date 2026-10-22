import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import PortfolioFormDialog from "@/components/PortfolioFormDialog";
import Workspace from "@/pages/Workspace";
import {
  AuthAside,
  AuthExperience,
  PasswordRecoveryScreen,
} from "@/components/auth/AuthExperience";
import {
  Bell,
  BookOpen,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileText,
  FolderHeart,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useLocation } from "wouter";

type Kind =
  | "scheme"
  | "lesson"
  | "reflection"
  | "evidence"
  | "observation"
  | "supporting_document"
  | "final_report";
type Entry = {
  id: number;
  kind: Kind;
  title: string;
  subject: string;
  className: string;
  lessonDate: string;
  status: string;
  payload: Record<string, unknown>;
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
const navBase = [
  {
    label: "Overview",
    path: "/",
    icon: LayoutDashboard,
    roles: [
      "student_teacher",
      "supervisor",
      "lecturer",
      "coordinator",
      "institution_admin",
      "platform_admin",
    ],
  },
  {
    label: "My placement",
    path: "/placement",
    icon: GraduationCap,
    roles: ["student_teacher"],
  },
  {
    label: "My portfolio",
    path: "/portfolio",
    icon: FolderHeart,
    roles: ["student_teacher"],
  },
  {
    label: "Schemes of work",
    path: "/schemes",
    icon: BookOpen,
    roles: ["student_teacher"],
  },
  {
    label: "Lesson plans",
    path: "/lessons",
    icon: FileText,
    roles: ["student_teacher"],
  },
  {
    label: "Reflective journal",
    path: "/journal",
    icon: ScrollText,
    roles: ["student_teacher"],
  },
  {
    label: "Teaching evidence",
    path: "/evidence",
    icon: ClipboardList,
    roles: ["student_teacher"],
  },
  {
    label: "Submissions",
    path: "/submissions",
    icon: FileText,
    roles: [
      "student_teacher",
      "supervisor",
      "lecturer",
      "coordinator",
      "institution_admin",
    ],
  },
  {
    label: "Review queue",
    path: "/reviews",
    icon: MessageSquareText,
    roles: ["supervisor", "lecturer"],
  },
  {
    label: "Feedback & assessments",
    path: "/feedback",
    icon: ShieldCheck,
    roles: ["student_teacher", "supervisor", "lecturer"],
  },
  {
    label: "Reports",
    path: "/reports",
    icon: ClipboardList,
    roles: ["coordinator", "institution_admin"],
  },
  {
    label: "Portfolio requirements",
    path: "/admin/requirements",
    icon: Settings,
    roles: ["coordinator", "institution_admin"],
  },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    roles: [
      "student_teacher",
      "supervisor",
      "lecturer",
      "coordinator",
      "institution_admin",
      "platform_admin",
    ],
  },
  {
    label: "User activation",
    path: "/admin/users",
    icon: Users,
    roles: ["institution_admin"],
  },
  {
    label: "Audit log",
    path: "/admin/audit-logs",
    icon: ShieldCheck,
    roles: ["institution_admin", "platform_admin"],
  },
  {
    label: "Institution administration",
    path: "/admin/institutions",
    icon: ShieldCheck,
    roles: ["platform_admin"],
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings,
    roles: [
      "student_teacher",
      "supervisor",
      "lecturer",
      "coordinator",
      "institution_admin",
      "platform_admin",
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/teachfolio-mark.svg" alt="" className="h-9 w-9" />
      <span>
        <strong className="block text-[15px] font-semibold tracking-tight text-slate-900">
          Teachfolio
        </strong>
        <span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
          Practice portfolio
        </span>
      </span>
    </div>
  );
}
function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
        Verifying your account…
      </div>
    </div>
  );
}

function ActivationScreen({
  user,
  onComplete,
  onSignOut,
  signingOut,
}: {
  user: Access;
  onComplete: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [token, setToken] = useState(
    new URLSearchParams(window.location.search).get("invite") ?? ""
  );
  const [error, setError] = useState("");
  const redeem = trpc.auth.claimInvitation.useMutation({
    onSuccess: onComplete,
  });
  return (
    <main className="min-h-screen bg-[#edf1f7] p-0 sm:p-5 lg:p-8">
      <div className="mx-auto min-h-screen max-w-[1380px] overflow-hidden bg-white shadow-[0_28px_90px_rgba(31,51,88,.14)] sm:min-h-[calc(100vh-40px)] sm:rounded-[28px] lg:grid lg:min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1.02fr)_minmax(480px,.98fr)]">
        <AuthAside scene="activation" />
        <section className="flex min-h-[650px] flex-col px-6 py-6 sm:px-10 lg:min-h-full lg:px-12 lg:py-8 xl:px-16">
          <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-10">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#285bc0]">
              Application access locked
            </p>
            <h1 className="mt-2 text-[34px] font-semibold leading-tight tracking-[-0.045em] text-slate-950 sm:text-[38px]">
              One last step before you begin.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your account is signed in, but your institution has not activated
              portfolio access yet. Redeem the invitation from your
              administrator to continue.
            </p>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white/75 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">
                Signed in as
              </p>
              <p className="mt-1.5 break-all text-sm font-semibold text-slate-900">
                {user.email || user.name || "Account email unavailable"}
              </p>
              {!user.email && (
                <p className="mt-2 text-xs leading-5 text-rose-700">
                  An email address is required to match an invitation. Contact
                  your institution administrator for help.
                </p>
              )}
            </div>

            <form
              className="mt-6 space-y-4"
              onSubmit={event => {
                event.preventDefault();
                setError("");
                redeem.mutate(
                  { token: token.trim() },
                  { onError: cause => setError(cause.message) }
                );
              }}
            >
              <label className="block">
                <span className="mb-2 block text-[13px] font-semibold text-slate-700">
                  Invitation code
                </span>
                <input
                  required
                  minLength={20}
                  maxLength={256}
                  disabled={!user.email || redeem.isPending}
                  className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 font-mono text-sm tracking-wide text-slate-900 outline-none transition placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70 disabled:bg-slate-100"
                  value={token}
                  onChange={event => setToken(event.target.value)}
                  placeholder="Paste the code from your administrator"
                  autoComplete="off"
                />
                <span className="mt-2 block text-xs leading-5 text-slate-500">
                  Your invitation is tied to your email and sets your
                  institution and role. It can only be used once.
                </span>
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-5 text-rose-800"
                >
                  {error}
                </p>
              )}
              <button
                disabled={
                  !user.email || token.trim().length < 20 || redeem.isPending
                }
                className="flex h-[52px] w-full items-center justify-center rounded-xl bg-[#285bc0] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(40,91,192,.2)] transition hover:bg-[#214fa9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {redeem.isPending
                  ? "Checking invitation…"
                  : "Activate my account"}
              </button>
            </form>

            <p className="mt-5 border-l-2 border-amber-500 pl-3.5 text-xs leading-[1.6] text-slate-600">
              Don’t have an invitation? Ask your institution administrator to
              issue one for this email address.
            </p>
            <button
              type="button"
              disabled={signingOut}
              onClick={onSignOut}
              className="mt-7 self-start text-sm font-semibold text-[#285bc0] hover:text-blue-900 disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out and use another account"}
            </button>
          </div>
          <footer className="text-center text-[11px] text-slate-400 lg:text-right">
            © {new Date().getFullYear()} Teachfolio · Private by design
          </footer>
        </section>
      </div>
    </main>
  );
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
  const [recoveryTokens, setRecoveryTokens] = useState<{
    accessToken: string;
    refreshToken: string;
  } | null>(null);
  const [authCallbackError, setAuthCallbackError] = useState("");
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const utils = trpc.useUtils();
  const confirmSupabaseSession = trpc.auth.confirmSession.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
    onError: error => setAuthCallbackError(error.message),
  });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      try {
        sessionStorage.removeItem("teachfolio-csrf");
      } catch {}
      await utils.auth.me.invalidate();
    },
  });
  const access = me.data as Access | null | undefined;
  const alerts = trpc.notifications.mine.useQuery(undefined, {
    enabled: Boolean(access?.activated),
    retry: false,
  });
  const unread = alerts.data?.filter(note => !note.readAt).length ?? 0;
  const allowedNav = useMemo(
    () =>
      navBase.filter(item =>
        access?.roles.some(role => item.roles.includes(role))
      ),
    [access?.roles]
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    if (!accessToken || !refreshToken || !type) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
    if (type === "recovery") setRecoveryTokens({ accessToken, refreshToken });
    else confirmSupabaseSession.mutate({ accessToken, refreshToken });
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!access?.id) {
      setCsrfReady(false);
      setCsrfError("");
      return;
    }
    setCsrfReady(false);
    setCsrfError("");
    const headers: Record<string, string> = {};
    void fetch("/api/csrf", { credentials: "include", headers })
      .then(async response => {
        if (!response.ok)
          throw new Error(
            "The authenticated session could not be verified for secure actions."
          );
        const result = (await response.json()) as { token?: string };
        if (!result.token)
          throw new Error("The server did not issue a secure request token.");
        if (cancelled) return;
        sessionStorage.setItem("teachfolio-csrf", result.token);
        setCsrfReady(true);
      })
      .catch(reason => {
        if (!cancelled)
          setCsrfError(
            reason instanceof Error
              ? reason.message
              : "Secure request setup failed."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [access?.id]);
  useEffect(() => {
    setMenuOpen(false);
    setSearch("");
  }, [path]);

  if (recoveryTokens)
    return (
      <PasswordRecoveryScreen
        tokens={recoveryTokens}
        onComplete={() => setRecoveryTokens(null)}
      />
    );
  if (confirmSupabaseSession.isPending || me.isLoading)
    return <LoadingScreen />;
  if (me.error || access === null || access === undefined)
    return (
      <AuthExperience
        error={
          authCallbackError ||
          (me.error?.message === "Failed to fetch"
            ? "The application service could not be reached. Try again in a moment."
            : undefined)
        }
      />
    );
  if (!csrfReady)
    return (
      <div>
        <LoadingScreen />
        {csrfError && (
          <div className="fixed inset-x-4 bottom-5 mx-auto max-w-md rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-lg">
            {csrfError}
            <button
              onClick={() => window.location.reload()}
              className="ml-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  if (!access.activated)
    return (
      <ActivationScreen
        user={access}
        onComplete={async () => {
          await utils.auth.me.invalidate();
        }}
        onSignOut={() => logout.mutate()}
        signingOut={logout.isPending}
      />
    );

  const openCreate = (kind: Kind = "lesson") => {
    setEditing(null);
    setFormKind(kind);
    setFormOpen(true);
  };
  const openEdit = (entry: Entry) => {
    setEditing(entry);
    setFormKind(entry.kind);
    setFormOpen(true);
  };
  const displayPath = path.match(/^\/item\/\d+$/) ? "/portfolio" : path;
  const breadcrumb =
    allowedNav.find(item => item.path === displayPath)?.label ??
    (path.startsWith("/item/") ? "Record detail" : "Workspace");
  const roleLabel = access.roles
    .map(role => role.replaceAll("_", " "))
    .join(" · ");
  const isPlatform = access.roles.includes("platform_admin");
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
      {menuOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <Brand />
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pt-5">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="truncate text-xs font-semibold capitalize text-slate-800">
              {roleLabel || "No active role"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {isPlatform
                ? "Platform access"
                : access.institutionId
                  ? `Institution ${access.institutionId}`
                  : "Authorized workspace"}
            </p>
          </div>
        </div>
        <nav
          aria-label="Primary navigation"
          className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4"
        >
          {allowedNav.map(item => {
            const active =
              displayPath === item.path ||
              (item.path === "/portfolio" && path.startsWith("/item/"));
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition ${active ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <Icon
                  size={17}
                  className={active ? "text-indigo-700" : "text-slate-400"}
                />
                <span className="flex-1">{item.label}</span>
                {item.path === "/notifications" && unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2 rounded-xl p-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800">
              {(access.name || access.email || "U").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {access.name || "Authenticated user"}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {access.email}
              </p>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => logout.mutate()}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <LogOut size={16} />
            </button>
          </div>
          <p className="px-2 pb-1 text-[10px] text-slate-400">
            Secure portfolio · demo content not institutional results
          </p>
        </div>
      </aside>
      <div className="min-h-screen lg:pl-[270px]">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div className="hidden text-xs text-slate-400 sm:block">
              Teachfolio <span className="mx-1.5">/</span>{" "}
              <span className="font-medium text-slate-700">{breadcrumb}</span>
            </div>
            <div className="relative ml-auto flex w-full max-w-md items-center sm:ml-6">
              <Search size={16} className="absolute left-3 text-slate-400" />
              <input
                aria-label="Search authorized portfolio records"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search your authorized records…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              onClick={() => navigate("/notifications")}
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              className="relative rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white" />
              )}
            </button>
            <button
              onClick={() => setHelpOpen(true)}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 sm:inline-flex"
            >
              <CircleHelp size={16} />
              Help
            </button>
            <div className="hidden h-7 border-l border-slate-200 md:block" />
            <button
              onClick={() => navigate("/settings")}
              className="hidden items-center gap-2 rounded-lg p-1.5 hover:bg-slate-50 sm:flex"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-800">
                {(access.name || "U").slice(0, 1).toUpperCase()}
              </span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8"
        >
          <Workspace
            path={path}
            searchTerm={search}
            user={access}
            onCreate={openCreate}
            onEdit={openEdit}
            onNavigate={navigate}
          />
        </main>
      </div>
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Help & privacy
                </p>
                <h2 id="help-title" className="mt-1 text-xl font-semibold">
                  Using your portfolio
                </h2>
              </div>
              <button
                onClick={() => setHelpOpen(false)}
                aria-label="Close help"
                className="rounded p-1 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
              <p>
                Save a draft before submitting. A submitted version is read-only
                while under review; if revisions are requested, edit a new
                revision and resubmit.
              </p>
              <p>
                Only upload identifiable learner media when your school and,
                where applicable, guardians have authorized it. Keep learner
                media private and follow your institution’s retention policy.
              </p>
              <p>
                Contact your institution administrator for access changes,
                portfolio requirements, placement questions, or an invitation.
                This prototype does not send email or SMS.
              </p>
            </div>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-5 w-full rounded-lg bg-indigo-700 py-2.5 text-sm font-semibold text-white"
            >
              Got it
            </button>
          </section>
        </div>
      )}
      <PortfolioFormDialog
        open={formOpen}
        kind={formKind}
        entry={editing}
        onClose={() => setFormOpen(false)}
        onSaved={id => navigate(`/item/${id}`)}
      />
    </div>
  );
}
