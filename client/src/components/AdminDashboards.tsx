import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  Clock3,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type InvitationStatus = "pending_activation" | "redeemed" | "expired";
type InvitationRow = {
  id: number;
  institutionId: number;
  email: string;
  role: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  status: InvitationStatus;
};
type Role =
  | "student_teacher"
  | "supervisor"
  | "lecturer"
  | "coordinator"
  | "institution_admin";

const roleLabel = (role: string) => role.replaceAll("_", " ");
const dateLabel = (date: Date | string | null | undefined) =>
  date ? new Date(date).toLocaleDateString() : "—";
const invitationLabel: Record<InvitationStatus, string> = {
  pending_activation: "Pending activation",
  redeemed: "Redeemed",
  expired: "Expired",
};

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-bold tracking-[.17em] text-indigo-600">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "indigo",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "indigo" | "emerald" | "amber" | "slate";
}) {
  const color = {
    indigo: "text-indigo-700 bg-indigo-50",
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-800 bg-amber-50",
    slate: "text-slate-700 bg-slate-100",
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p
        className={`mt-2 inline-flex min-w-10 justify-center rounded-lg px-2.5 py-1 text-2xl font-semibold ${color}`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function StateBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "amber" | "rose" | "slate" | "blue";
}) {
  const style = {
    emerald: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-800",
  }[tone];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}
    >
      {children}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function InvitationList({
  rows,
  loading,
  error,
}: {
  rows: InvitationRow[];
  loading: boolean;
  error: boolean;
}) {
  if (loading)
    return (
      <div
        role="status"
        className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500"
      >
        Loading invitation status…
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800"
      >
        Invitation status could not be loaded for this authorized scope.
      </div>
    );
  if (!rows.length)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        No invitations have been issued in this scope yet.
      </div>
    );
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <article
          key={row.id}
          className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_150px_140px] sm:items-center"
        >
          <div className="min-w-0">
            <p className="break-all text-sm font-semibold text-slate-800">
              {row.email}
            </p>
            <p className="mt-1 text-xs capitalize text-slate-500">
              {roleLabel(row.role)} · issued {dateLabel(row.createdAt)}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            {row.status === "pending_activation"
              ? `Expires ${dateLabel(row.expiresAt)}`
              : row.acceptedAt
                ? `Redeemed ${dateLabel(row.acceptedAt)}`
                : `Expired ${dateLabel(row.expiresAt)}`}
          </div>
          <div className="sm:text-right">
            <StateBadge
              tone={
                row.status === "pending_activation"
                  ? "amber"
                  : row.status === "redeemed"
                    ? "emerald"
                    : "slate"
              }
            >
              {invitationLabel[row.status]}
            </StateBadge>
          </div>
        </article>
      ))}
      <p className="text-xs leading-relaxed text-slate-500">
        Invitation tokens are stored as hashes and never shown again after
        creation. For an expired or lost token, issue a new invitation and share
        it through an approved channel; this dashboard does not send email.
      </p>
    </div>
  );
}

export function UserActivationDashboard({
  allowed,
  currentUserId,
}: {
  allowed: boolean;
  currentUserId: number;
}) {
  const users = trpc.admin.users.useQuery(undefined, {
    enabled: allowed,
    retry: false,
  });
  const invitations = trpc.admin.invitations.useQuery(undefined, {
    enabled: allowed,
    retry: false,
  });
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("student_teacher");
  const [token, setToken] = useState("");
  const [formError, setFormError] = useState("");
  const invite = trpc.admin.invite.useMutation({
    onSuccess: async result => {
      setToken(result.token);
      setEmail("");
      setFormError("");
      await utils.admin.invitations.invalidate();
    },
  });
  const setAssignmentStatus = trpc.admin.setAccountStatus.useMutation({
    onSuccess: async () => {
      await utils.admin.users.invalidate();
    },
  });
  const rows = users.data ?? [];
  const invitationRows = (invitations.data ?? []) as InvitationRow[];
  const filtered = useMemo(
    () =>
      rows.filter(row => {
        const matchesSearch =
          `${row.user.name ?? ""} ${row.user.email ?? ""} ${row.assignment.role} ${row.assignment.status}`
            .toLowerCase()
            .includes(search.trim().toLowerCase());
        return (
          matchesSearch &&
          (statusFilter === "all" || row.assignment.status === statusFilter)
        );
      }),
    [rows, search, statusFilter]
  );
  const activeCount = rows.filter(
    row => row.assignment.status === "active"
  ).length;
  const suspendedCount = rows.filter(
    row => row.assignment.status === "suspended"
  ).length;
  const pendingCount = invitationRows.filter(
    row => row.status === "pending_activation"
  ).length;

  if (!allowed)
    return (
      <>
        <SectionHeading
          eyebrow="INSTITUTION ADMINISTRATION"
          title="User activation"
          description="Access management is restricted to an active institution administrator assignment."
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          The server enforces this restriction even if someone opens the route
          directly.
        </div>
      </>
    );

  const submitInvite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToken("");
    setFormError("");
    invite.mutate({ email: email.trim().toLowerCase(), role });
  };
  const changeStatus = (
    assignmentId: number,
    displayName: string,
    assignedRole: string,
    next: "active" | "suspended"
  ) => {
    const verb = next === "suspended" ? "suspend" : "reactivate";
    if (
      !window.confirm(
        `Confirm: ${verb} the ${roleLabel(assignedRole)} assignment for ${displayName}? This change is recorded in the audit log.`
      )
    )
      return;
    setAssignmentStatus.mutate({ assignmentId, status: next });
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="INSTITUTION ADMINISTRATION"
        title="User activation"
        description="Review access assignments and institution-issued invitations. Role changes are administrator-controlled; invited accounts receive access only after the matching Supabase account redeems its single-use token."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Active assignments"
          value={activeCount}
          detail="Access is limited to this institution"
          tone="emerald"
        />
        <Metric
          label="Pending activation"
          value={pendingCount}
          detail="Invitations awaiting the intended Supabase account"
          tone="amber"
        />
        <Metric
          label="Suspended assignments"
          value={suspendedCount}
          detail="No access from a suspended assignment"
          tone="slate"
        />
        <Metric
          label="Invitation history"
          value={invitationRows.length}
          detail="Pending, redeemed, and expired records"
          tone="indigo"
        />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Institution assignments
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Search by account, assigned role, or access state. Only records in
              your institution are returned.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <span className="sr-only">Search accounts</span>
              <Search
                size={15}
                className="absolute left-3 top-2.5 text-slate-400"
              />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search accounts…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm sm:w-56"
              />
            </label>
            <label>
              <span className="sr-only">Filter assignment status</span>
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:w-auto"
              >
                <option value="all">All states</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          </div>
        </div>
        {users.isLoading ? (
          <div role="status" className="p-6 text-sm text-slate-500">
            Loading institution assignments…
          </div>
        ) : users.error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800"
          >
            Assignments could not be loaded. The server denied access or is
            temporarily unavailable.
          </div>
        ) : !filtered.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center">
            <Users className="mx-auto text-slate-400" size={22} />
            <p className="mt-2 text-sm font-semibold text-slate-700">
              No matching assignments
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Issued invitations appear in the invitation panel below until
              redeemed.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(row => {
              const self = row.user.id === currentUserId;
              const active = row.assignment.status === "active";
              const next = active ? "suspended" : "active";
              return (
                <article
                  key={row.assignment.id}
                  className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_150px_140px] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-semibold text-slate-800">
                      {row.user.name || "Supabase account"}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      {row.user.email || "No email on file"}
                    </p>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {roleLabel(row.assignment.role)} · last sign-in{" "}
                      {dateLabel(row.user.lastSignedIn)}
                    </p>
                  </div>
                  <div>
                    <StateBadge
                      tone={
                        active
                          ? "emerald"
                          : row.assignment.status === "suspended"
                            ? "rose"
                            : "amber"
                      }
                    >
                      {row.assignment.status}
                    </StateBadge>
                  </div>
                  <div className="sm:text-right">
                    <ActionButton
                      disabled={self || setAssignmentStatus.isPending}
                      danger={active}
                      onClick={() =>
                        changeStatus(
                          row.assignment.id,
                          row.user.name || row.user.email || "this account",
                          row.assignment.role,
                          next
                        )
                      }
                    >
                      {active ? (
                        <>
                          <Pause size={14} />
                          Suspend assignment
                        </>
                      ) : (
                        <>
                          <Play size={14} />
                          Activate assignment
                        </>
                      )}
                      {self && (
                        <span className="sr-only">
                          Unavailable for your own assignment
                        </span>
                      )}
                    </ActionButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {setAssignmentStatus.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
          >
            {setAssignmentStatus.error.message}
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Actions are checked again on the server. You cannot change your own
          assignment or suspend the last active institution administrator. If an
          account has multiple active roles, suspend each eligible assignment to
          remove institution access.
        </p>
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(280px,.78fr)_minmax(0,1.22fr)]">
        <form
          onSubmit={submitInvite}
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-indigo-600" />
            <h2 className="font-semibold">Issue an invitation</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Select the intended role. The account stays inactive until its
            signed-in Supabase email matches and the one-time token is claimed.
            Delivery is manual.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Institution email
            <input
              type="email"
              required
              maxLength={320}
              value={email}
              onChange={event => {
                setEmail(event.target.value);
                setToken("");
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Administrator-assigned role
            <select
              value={role}
              onChange={event => {
                setRole(event.target.value as Role);
                setToken("");
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value="student_teacher">Student teacher</option>
              <option value="supervisor">Teaching-practice supervisor</option>
              <option value="lecturer">Lecturer / academic assessor</option>
              <option value="coordinator">Teaching-practice coordinator</option>
              <option value="institution_admin">
                Institution administrator
              </option>
            </select>
          </label>
          <button
            disabled={invite.isPending}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {invite.isPending ? (
              "Issuing…"
            ) : (
              <>
                <Plus size={15} />
                Issue invitation
              </>
            )}
          </button>
          {invite.error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {invite.error.message}
            </p>
          )}
          {formError && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {formError}
            </p>
          )}
          {token && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                One-time token · expires in 7 days
              </p>
              <code className="mt-2 block break-all text-xs text-slate-800">
                {token}
              </code>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-700 underline"
                  onClick={() => void navigator.clipboard?.writeText(token)}
                >
                  Copy token
                </button>
                <span className="text-xs text-amber-900">
                  Share privately with the intended recipient. No email was
                  sent.
                </span>
              </div>
            </div>
          )}
        </form>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 size={17} className="text-amber-600" />
            <h2 className="font-semibold">Invitation and activation history</h2>
          </div>
          <InvitationList
            rows={invitationRows}
            loading={invitations.isLoading}
            error={Boolean(invitations.error)}
          />
        </div>
      </section>
    </div>
  );
}

export function PlatformInstitutionDashboard({
  allowed,
}: {
  allowed: boolean;
}) {
  const institutions = trpc.admin.institutions.useQuery(undefined, {
    enabled: allowed,
    retry: false,
  });
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number>();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [institutionError, setInstitutionError] = useState("");
  useEffect(() => {
    if (selectedId === undefined && institutions.data?.[0])
      setSelectedId(institutions.data[0].id);
  }, [selectedId, institutions.data]);
  const invitations = trpc.admin.invitations.useQuery(
    { institutionId: selectedId },
    { enabled: allowed && selectedId !== undefined, retry: false }
  );
  const invite = trpc.admin.invite.useMutation({
    onSuccess: async result => {
      setToken(result.token);
      setEmail("");
      setInstitutionError("");
      await utils.admin.invitations.invalidate();
    },
  });
  const create = trpc.admin.createInstitution.useMutation({
    onSuccess: async result => {
      setSelectedId(result.institutionId);
      setName("");
      setCode("");
      setInstitutionError("");
      await utils.admin.institutions.invalidate();
    },
  });
  const setInstitutionStatus = trpc.admin.setInstitutionStatus.useMutation({
    onSuccess: async () => {
      await utils.admin.institutions.invalidate();
    },
  });
  const rows = institutions.data ?? [];
  const filtered = useMemo(
    () =>
      rows.filter(row =>
        `${row.name} ${row.code} ${row.active ? "active" : "inactive"}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      ),
    [rows, search]
  );
  const selected = rows.find(row => row.id === selectedId);
  const invitationsData = (invitations.data ?? []) as InvitationRow[];
  const activeCount = rows.filter(row => row.active).length;

  if (!allowed)
    return (
      <>
        <SectionHeading
          eyebrow="PLATFORM ADMINISTRATION"
          title="Institution administration"
          description="Institution-wide onboarding and activation controls are restricted to explicitly provisioned platform administrators."
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          The server enforces this restriction even if someone opens the route
          directly.
        </div>
      </>
    );

  const createTenant = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInstitutionError("");
    create.mutate({ name: name.trim(), code: code.trim().toUpperCase() });
  };
  const issueInstitutionAdminInvite = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!selected || !selected.active) {
      setInstitutionError(
        "Choose an active institution before issuing its first administrator invitation."
      );
      return;
    }
    setToken("");
    setInstitutionError("");
    invite.mutate({
      institutionId: selected.id,
      email: email.trim().toLowerCase(),
      role: "institution_admin",
    });
  };
  const toggleInstitution = (row: NonNullable<typeof selected>) => {
    const nextActive = !row.active;
    const explanation = nextActive
      ? "Restore application access"
      : "Block application access for all accounts in";
    if (
      !window.confirm(
        `${explanation} ${row.name}? The change will be recorded in the platform audit log.`
      )
    )
      return;
    setInstitutionStatus.mutate({ institutionId: row.id, active: nextActive });
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="PLATFORM ADMINISTRATION"
        title="Institution administration"
        description="Create and maintain institution tenants. Deactivating a tenant blocks application access for its users until the tenant is reactivated; every change is recorded."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Institutions"
          value={rows.length}
          detail="Tenants returned by the platform administration API"
        />
        <Metric
          label="Active"
          value={activeCount}
          detail="Accounts in inactive tenants remain denied"
          tone="emerald"
        />
        <Metric
          label="Inactive"
          value={rows.length - activeCount}
          detail="Can be restored by a platform administrator"
          tone="slate"
        />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold">Institution directory</h2>
            <p className="mt-1 text-xs text-slate-500">
              Platform-wide tenant records. Institution administrators cannot
              access this directory.
            </p>
          </div>
          <label className="relative">
            <span className="sr-only">Search institutions</span>
            <Search
              size={15}
              className="absolute left-3 top-2.5 text-slate-400"
            />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search name or code…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm sm:w-64"
            />
          </label>
        </div>
        {institutions.isLoading ? (
          <div role="status" className="p-6 text-sm text-slate-500">
            Loading institutions…
          </div>
        ) : institutions.error ? (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800"
          >
            Institution records could not be loaded. The server denied access or
            is temporarily unavailable.
          </div>
        ) : !filtered.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center">
            <Building2 className="mx-auto text-slate-400" size={22} />
            <p className="mt-2 text-sm font-semibold text-slate-700">
              No matching institution
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Create a tenant below or adjust the search.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(row => (
              <article
                key={row.id}
                className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_130px_180px] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.code} · ID {row.id} · created{" "}
                    {dateLabel(row.createdAt)}
                    {row.isDemo ? " · reserved demo tenant" : ""}
                  </p>
                </div>
                <div>
                  <StateBadge tone={row.active ? "emerald" : "slate"}>
                    {row.active ? "Active" : "Inactive"}
                  </StateBadge>
                </div>
                <div className="sm:text-right">
                  <ActionButton
                    disabled={setInstitutionStatus.isPending}
                    danger={row.active}
                    onClick={() => toggleInstitution(row)}
                  >
                    {row.active ? (
                      <>
                        <Pause size={14} />
                        Deactivate institution
                      </>
                    ) : (
                      <>
                        <Play size={14} />
                        Reactivate institution
                      </>
                    )}
                  </ActionButton>
                </div>
              </article>
            ))}
          </div>
        )}
        {setInstitutionStatus.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
          >
            {setInstitutionStatus.error.message}
          </p>
        )}
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <form
          onSubmit={createTenant}
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Plus size={17} className="text-indigo-600" />
            <h2 className="font-semibold">Create institution</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The server creates institution-scoped default requirements and
            writes a platform audit event.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Institution name
            <input
              required
              minLength={3}
              maxLength={220}
              value={name}
              onChange={event => setName(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Institution code
            <input
              required
              pattern="[A-Za-z0-9-]{2,40}"
              maxLength={40}
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              placeholder="e.g. ZTC-01"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal uppercase"
            />
          </label>
          <button
            disabled={create.isPending}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {create.isPending ? (
              "Creating…"
            ) : (
              <>
                <Plus size={15} />
                Create institution
              </>
            )}
          </button>
          {create.error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {create.error.message}
            </p>
          )}
        </form>
        <form
          onSubmit={issueInstitutionAdminInvite}
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-indigo-600" />
            <h2 className="font-semibold">
              Bootstrap institution administrator
            </h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The platform role is fixed to institution administrator. The invited
            Supabase email must redeem a one-time token; no email is sent.
          </p>
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Institution
            <select
              value={selectedId ?? ""}
              onChange={event => {
                setSelectedId(Number(event.target.value) || undefined);
                setToken("");
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value="">Select an institution</option>
              {rows.map(row => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.active ? "Active" : "Inactive"}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            Institution email
            <input
              type="email"
              required
              maxLength={320}
              value={email}
              onChange={event => {
                setEmail(event.target.value);
                setToken("");
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={!selected?.active || invite.isPending}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            {invite.isPending ? (
              "Issuing…"
            ) : (
              <>
                <Plus size={15} />
                Issue invitation
              </>
            )}
          </button>
          {invite.error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {invite.error.message}
            </p>
          )}
          {institutionError && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {institutionError}
            </p>
          )}
          {token && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                One-time token · expires in 7 days
              </p>
              <code className="mt-2 block break-all text-xs text-slate-800">
                {token}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(token)}
                className="mt-2 text-xs font-semibold text-indigo-700 underline"
              >
                Copy token
              </button>
              <p className="mt-2 text-xs text-amber-900">
                Share privately with the intended recipient. No email was sent.
              </p>
            </div>
          )}
        </form>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock3 size={17} className="text-amber-600" />
          <h2 className="font-semibold">Selected institution invitations</h2>
          {selected && (
            <span className="text-xs text-slate-500">· {selected.name}</span>
          )}
        </div>
        {selectedId === undefined ? (
          <p className="text-sm text-slate-500">
            Select an institution to view its invitation history.
          </p>
        ) : (
          <InvitationList
            rows={invitationsData}
            loading={invitations.isLoading}
            error={Boolean(invitations.error)}
          />
        )}
      </section>
    </div>
  );
}
