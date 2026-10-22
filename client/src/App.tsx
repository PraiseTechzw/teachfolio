import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { trpc } from "@/lib/trpc";
const PortfolioFormDialog = lazy(
  () => import("@/components/PortfolioFormDialog")
);
const Workspace = lazy(() => import("@/pages/Workspace"));
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AuthAside,
  AuthExperience,
  PasswordRecoveryScreen,
} from "@/components/auth/AuthExperience";
import {
  Bell,
  BookOpen,
  Building2,
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  CircleHelp,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MoreHorizontal,
  MessageSquareText,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Users,
  UserRoundCheck,
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
    ],
  },
  {
    label: "My placement",
    path: "/placement",
    icon: MapPin,
    roles: ["student_teacher"],
  },
  {
    label: "My portfolio",
    path: "/portfolio",
    icon: FolderOpen,
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
    icon: NotebookPen,
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
    icon: ClipboardCheck,
    roles: ["student_teacher"],
  },
  {
    label: "Submissions",
    path: "/submissions",
    icon: Send,
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
    icon: ChartColumn,
    roles: ["coordinator", "institution_admin"],
  },
  {
    label: "Placements",
    path: "/admin/placements",
    icon: MapPin,
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
    icon: UserRoundCheck,
    roles: ["institution_admin"],
  },
  {
    label: "Audit log",
    path: "/admin/audit-logs",
    icon: ShieldCheck,
    roles: ["institution_admin", "platform_admin"],
  },
  {
    label: "Institutions",
    path: "/admin/institutions",
    icon: Building2,
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

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/teachfolio-mark.svg" alt="" className="h-9 w-9" />
      <span className={compact ? "lg:hidden" : undefined}>
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
function navigationSection(label: string) {
  if (label === "Overview" || label === "Institutions") return "MENU";
  if (label === "Notifications") return "SUPPORT";
  if (
    [
      "My placement",
      "My portfolio",
      "Schemes of work",
      "Lesson plans",
      "Reflective journal",
      "Teaching evidence",
    ].includes(label)
  )
    return "TEACHING PRACTICE";
  if (
    [
      "Submissions",
      "Review queue",
      "Feedback & assessments",
      "Reports",
    ].includes(label)
  )
    return "REVIEW & PROGRESS";
  return "OTHERS";
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
  const prefersReducedMotion = useReducedMotion();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      return localStorage.getItem("teachfolio-sidebar-expanded") !== "false";
    } catch {
      return true;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAccessOpen, setQuickAccessOpen] = useState(false);
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
      navBase
        .filter(item => access?.roles.some(role => item.roles.includes(role)))
        .sort((a, b) => {
          const order = [
            "MENU",
            "TEACHING PRACTICE",
            "REVIEW & PROGRESS",
            "SUPPORT",
            "OTHERS",
          ];
          return (
            order.indexOf(navigationSection(a.label)) -
            order.indexOf(navigationSection(b.label))
          );
        }),
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
    setQuickAccessOpen(false);
    setSearch("");
  }, [path]);
  useEffect(() => {
    if (
      access?.activated &&
      access.roles.includes("platform_admin") &&
      path === "/"
    )
      navigate("/admin/institutions");
  }, [access?.activated, access?.roles, navigate, path]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "teachfolio-sidebar-expanded",
        String(sidebarExpanded)
      );
    } catch {
      // Sidebar preference is optional when browser storage is unavailable.
    }
  }, [sidebarExpanded]);

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
  const roleLabel = access.roles
    .map(role => role.replaceAll("_", " "))
    .join(" · ");
  const isPlatform = access.roles.includes("platform_admin");
  return (
    <div className="dashboard-shell min-h-screen bg-[#f6f7fb] text-slate-900">
      {menuOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-[2px] transition-opacity lg:hidden"
        />
      )}
      <aside
        className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[290px] flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${sidebarExpanded ? "lg:w-[290px]" : "lg:w-[88px]"} lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div
          className={`flex shrink-0 border-b border-slate-100 ${sidebarExpanded ? "h-[76px] items-center justify-between px-5" : "h-[76px] items-center justify-between px-5 lg:h-[104px] lg:flex-col lg:justify-center lg:gap-3 lg:px-2"}`}
        >
          <Brand compact={!sidebarExpanded} />
          <button
            type="button"
            onClick={() => setSidebarExpanded(value => !value)}
            aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarExpanded}
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className="hidden rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:inline-flex"
          >
            {sidebarExpanded ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className={`px-4 pt-5 ${sidebarExpanded ? "" : "lg:hidden"}`}>
          <div className="border-b border-slate-100 px-2 pb-4">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[.13em] text-slate-400">
              {roleLabel || "No active role"}
            </p>
            <p className="mt-1.5 truncate text-xs font-medium text-slate-600">
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
          className={`mt-5 flex-1 space-y-1 overflow-y-auto pb-4 ${sidebarExpanded ? "px-3" : "px-3 lg:mt-4 lg:px-2"}`}
        >
          {allowedNav.map((item, index) => {
            const active =
              displayPath === item.path ||
              (item.path === "/admin/institutions" &&
                isPlatform &&
                path === "/") ||
              (item.path === "/portfolio" && path.startsWith("/item/"));
            const Icon = item.icon;
            const section = navigationSection(item.label);
            const previousSection =
              index > 0 ? navigationSection(allowedNav[index - 1].label) : null;
            return (
              <div key={item.path}>
                {section !== previousSection && (
                  <p
                    className={`px-3 pb-2 text-[11px] font-medium uppercase tracking-[.08em] text-slate-400 ${index ? "pt-7" : "pt-1"} lg:transition-opacity lg:duration-150 ${sidebarExpanded ? "" : "lg:hidden"}`}
                  >
                    {section}
                  </p>
                )}
                {section !== previousSection &&
                  !sidebarExpanded &&
                  index > 0 && (
                    <span
                      className="hidden h-8 items-center justify-center text-slate-300 lg:flex"
                      aria-hidden="true"
                    >
                      <MoreHorizontal size={16} />
                    </span>
                  )}
                <button
                  type="button"
                  onClick={() => navigate(item.path)}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={sidebarExpanded ? undefined : item.label}
                  className={`group relative flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors duration-200 ${sidebarExpanded ? "" : "lg:justify-center lg:px-0"} ${active ? "bg-[#eff4ff] text-[#465fff]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                >
                  <Icon
                    size={20}
                    strokeWidth={1.75}
                    className={
                      active
                        ? "text-[#465fff]"
                        : "text-slate-400 transition-colors group-hover:text-slate-600"
                    }
                  />
                  <span
                    className={`flex-1 ${sidebarExpanded ? "" : "lg:hidden"}`}
                  >
                    {item.label}
                  </span>
                  {item.path === "/notifications" && unread > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>
        <div
          className={`border-t border-slate-100 p-3 ${sidebarExpanded ? "" : "lg:px-2"}`}
        >
          <div
            className={`flex items-center gap-2 rounded-xl p-2 ${sidebarExpanded ? "" : "lg:justify-center lg:p-1"}`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800 ring-2 ring-white ${sidebarExpanded ? "" : "lg:h-8 lg:w-8"}`}
            >
              {(access.name || access.email || "U").slice(0, 1).toUpperCase()}
            </span>
            <div
              className={`min-w-0 flex-1 ${sidebarExpanded ? "" : "lg:hidden"}`}
            >
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
              className={`rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 ${sidebarExpanded ? "" : "lg:p-1"}`}
            >
              <LogOut size={16} />
            </button>
          </div>
          <p
            className={`px-2 pb-1 text-[10px] text-slate-400 ${sidebarExpanded ? "" : "lg:hidden"}`}
          >
            Student Teacher E-Portfolio · institution-scoped access
          </p>
        </div>
      </aside>
      <div
        className={`min-h-screen transition-[padding] duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${sidebarExpanded ? "lg:pl-[290px]" : "lg:pl-[88px]"}`}
      >
        <header className="dashboard-header sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
          <div className="hidden h-[72px] items-center justify-between gap-6 px-5 sm:px-7 lg:flex lg:px-8">
            <div className="relative w-full max-w-[360px]">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                aria-label="Search authorized portfolio records"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search your records..."
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-[13px] text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/60"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/notifications")}
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                className="relative grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <Bell size={19} strokeWidth={1.8} />
                {unread > 0 && (
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-rose-500 ring-2 ring-white" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
                aria-label="Help and privacy"
                title="Help and privacy"
              >
                <CircleHelp size={19} strokeWidth={1.8} />
              </button>
              <div className="mx-1 h-8 border-l border-slate-200" />
              <DropdownMenu>
                <DropdownMenuTrigger className="group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-indigo-100">
                  <span className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
                    {(access.name || access.email || "U")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="max-w-36 text-left">
                    <span className="block truncate text-[13px] font-medium text-slate-800">
                      {access.name || "Your account"}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {access.email}
                    </span>
                  </span>
                  <ChevronDown
                    size={15}
                    className="text-slate-400 transition-transform group-data-[state=open]:rotate-180"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-72 rounded-xl border-slate-200 p-1.5 shadow-xl"
                >
                  <DropdownMenuLabel className="px-3 py-2.5 font-normal">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {access.name || "Authenticated user"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {access.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => navigate("/settings")}
                    className="cursor-pointer rounded-lg px-3 py-2.5"
                  >
                    <Settings size={16} />
                    Account settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => logout.mutate()}
                    className="cursor-pointer rounded-lg px-3 py-2.5 text-rose-700 focus:text-rose-700"
                  >
                    <LogOut size={16} />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid h-[68px] grid-cols-[1fr_auto_1fr] items-center px-3 lg:hidden">
            <button
              onClick={() => {
                setQuickAccessOpen(false);
                setMenuOpen(true);
              }}
              className="-ml-1 grid size-10 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
            >
              <Menu size={21} strokeWidth={1.8} />
            </button>
            <div className="justify-self-center">
              <Brand />
            </div>
            <button
              type="button"
              onClick={() => setQuickAccessOpen(open => !open)}
              className={`-mr-1 grid size-10 place-items-center justify-self-end rounded-lg transition-colors ${quickAccessOpen ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
              aria-label={
                quickAccessOpen ? "Close quick access" : "Open quick access"
              }
              aria-expanded={quickAccessOpen}
            >
              <MoreHorizontal size={22} />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {quickAccessOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                className="overflow-hidden border-t border-slate-100 lg:hidden"
              >
                <div className="space-y-4 px-4 py-4 sm:px-6">
                  <div className="relative">
                    <Search
                      size={17}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      aria-label="Search authorized portfolio records"
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder="Search your records..."
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/60"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => navigate("/notifications")}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <span className="relative">
                        <Bell size={17} />
                        {unread > 0 && (
                          <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-rose-500" />
                        )}
                      </span>
                      Notifications
                    </button>
                    <button
                      onClick={() => {
                        setQuickAccessOpen(false);
                        setHelpOpen(true);
                      }}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <CircleHelp size={17} />
                      Help
                    </button>
                    <button
                      onClick={() => navigate("/settings")}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Settings size={17} />
                      Settings
                    </button>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                        {(access.name || access.email || "U")
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {access.name || "Your account"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {access.email}
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => logout.mutate()}
                      className="ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
                    >
                      <LogOut size={15} />
                      Sign out
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>
        <main
          id="main-content"
          className="dashboard-content mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={path}
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.2,
                ease: "easeOut",
              }}
            >
              <Suspense
                fallback={
                  <div
                    className="min-h-64 animate-pulse rounded-2xl bg-white"
                    role="status"
                    aria-label="Loading workspace"
                  />
                }
              >
                <Workspace
                  path={path}
                  searchTerm={search}
                  user={access}
                  onCreate={openCreate}
                  onEdit={openEdit}
                  onNavigate={navigate}
                />
              </Suspense>
            </motion.div>
          </AnimatePresence>
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
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
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
                Invitations must be shared through an approved secure channel.
                Email delivery is available when configured for Teachfolio.
                SMS delivery is not available.
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
      {formOpen && (
        <Suspense
          fallback={
            <div role="status" className="sr-only">
              Loading portfolio editor…
            </div>
          }
        >
          <PortfolioFormDialog
            open={formOpen}
            kind={formKind}
            entry={editing}
            onClose={() => setFormOpen(false)}
            onSaved={id => navigate(`/item/${id}`)}
          />
        </Suspense>
      )}
    </div>
  );
}
