import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";

function Wordmark() {
  return (
    <a href="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200" aria-label="Teachfolio home">
      <img src="/teachfolio-mark.svg" alt="" className="h-11 w-11" />
      <span>
        <span className="block text-[17px] font-bold tracking-[-0.04em] text-slate-950">teachfolio</span>
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Practice portfolio</span>
      </span>
    </a>
  );
}

export function AuthAside() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-[#172449] px-10 py-10 text-white lg:flex lg:flex-col xl:px-14 xl:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -left-48 top-1/3 h-[28rem] w-[28rem] rounded-full border border-white/[0.06]" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-[38%] h-[24rem] w-[24rem] rounded-full border border-white/[0.06]" />
      <Wordmark />
      <div className="relative z-10 mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center pb-8 pt-12">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[.22em] text-emerald-200/90">A portfolio for reflective practice</p>
        <h1 className="max-w-[570px] text-[42px] font-semibold leading-[1.08] tracking-[-0.045em] text-white xl:text-[50px]">
          Every lesson is a step toward <span className="text-indigo-300">your best teaching.</span>
        </h1>
        <p className="mt-5 max-w-lg text-[15px] leading-7 text-indigo-100/75">
          Plan with purpose, reflect on what works, and build a portfolio that shows how you grow in the classroom.
        </p>
        <div className="relative mt-4 flex justify-center">
          <img src="/auth-portfolio-illustration.svg" alt="An illustrated teaching portfolio with lesson notes, reflection cards, and progress marks" className="w-full max-w-[590px] drop-shadow-[0_22px_50px_rgba(6,12,32,.22)]" />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs text-indigo-100/75">
          <span>Plan with purpose</span><span>Reflect with care</span><span>Show your growth</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-indigo-100/45">
        <span>Made for the work behind great teaching.</span>
        <span>Private by design</span>
      </div>
    </aside>
  );
}

type AuthMode = "signin" | "create" | "forgot";

export function AuthExperience({ error }: { error?: string }) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  const signup = trpc.auth.register.useMutation({
    onSuccess: async result => {
      if (result.requiresEmailConfirmation) {
        setNotice("Your account is ready. Check your inbox for a confirmation link before signing in.");
        setMode("signin");
        setPassword("");
      } else await utils.auth.me.invalidate();
    },
  });
  const reset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setNotice("If an account exists for that email, a secure password reset link is on its way."),
    onError: () => setNotice("If an account exists for that email, a secure password reset link is on its way."),
  });
  const pending = login.isPending || signup.isPending || reset.isPending;
  const isCreate = mode === "create";
  const isForgot = mode === "forgot";

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setFormError("");
    setNotice("");
    setPassword("");
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setNotice("");
    const onError = (cause: { message: string }) => setFormError(cause.message);
    if (isForgot) reset.mutate({ email });
    else if (isCreate) signup.mutate({ email, name, password }, { onError });
    else login.mutate({ email, password }, { onError });
  };

  return (
    <main className="min-h-screen bg-[#faf9f6] lg:grid lg:grid-cols-[minmax(0,1.02fr)_minmax(480px,.98fr)]">
      <AuthAside />
      <section className="relative flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden"><Wordmark /></div>
          <p className="text-sm text-slate-500">
            {isForgot ? "Remembered your password?" : isCreate ? "Already have an account?" : "New to Teachfolio?"}{" "}
            <button type="button" onClick={() => switchMode(isCreate || isForgot ? "signin" : "create")} className="font-semibold text-indigo-700 decoration-indigo-300 underline-offset-4 hover:underline">
              {isCreate || isForgot ? "Sign in" : "Create account"}
            </button>
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12 lg:py-16">
          <div className="mb-8 lg:hidden">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-700">Your teaching journey</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Plan, reflect, and keep your practice portfolio together.</p>
          </div>
          <div className="mb-7">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-700">{isForgot ? "Account recovery" : isCreate ? "Start your portfolio" : "Welcome to Teachfolio"}</p>
            <h2 className="mt-2 text-[34px] font-semibold leading-tight tracking-[-0.045em] text-slate-950 sm:text-[38px]">
              {isForgot ? "Reset your password" : isCreate ? "Create your account" : "Pick up where you left off"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {isForgot
                ? "Enter your account email and we’ll send you a secure reset link."
                : isCreate
                  ? "Set up your account to start collecting the work that shapes your teaching."
                  : "Sign in to your private space for lesson plans, reflections, and teaching evidence."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-[18px]">
            {isCreate && (
              <label className="block">
                <span className="mb-2 block text-[13px] font-semibold text-slate-700">Full name</span>
                <span className="relative block">
                  <input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Tendai Moyo" className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/70" />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-slate-700">Email address</span>
              <span className="relative block">
                <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@school.ac.zw" className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/70" />
              </span>
            </label>

            {!isForgot && (
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-[13px] font-semibold text-slate-700">
                  <span>Password</span>
                  {!isCreate && <button type="button" onClick={() => switchMode("forgot")} className="font-semibold text-indigo-700 hover:text-indigo-900">Forgot password?</button>}
                </span>
                <span className="relative block">
                  <input required minLength={isCreate ? 12 : 1} maxLength={128} type={showPassword ? "text" : "password"} autoComplete={isCreate ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={isCreate ? "At least 12 characters" : "Enter your password"} className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/70" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                {isCreate && <span className="mt-2 block text-xs text-slate-500">Use 12 or more characters to keep your account secure.</span>}
              </label>
            )}

            {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] leading-5 text-emerald-900">{notice}</p>}
            {(formError || error) && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-5 text-rose-800">{formError || error}</p>}

            <button disabled={pending} className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(67,56,202,.18)] transition hover:bg-indigo-800 hover:shadow-[0_10px_22px_rgba(67,56,202,.23)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:cursor-wait disabled:opacity-60">
              {pending ? "Please wait…" : isForgot ? "Send reset link" : isCreate ? "Create my account" : "Sign in to your portfolio"}
            </button>
          </form>

          {!isForgot && (
            <div className="mt-6 border-l-2 border-emerald-500 pl-3.5">
              <p className="text-xs leading-[1.6] text-slate-600">Your portfolio is private. Account creation does not assign a role; access begins after your institution administrator activates your invitation.</p>
            </div>
          )}

          {isForgot && <button type="button" onClick={() => switchMode("signin")} className="mt-5 self-start text-sm font-semibold text-indigo-700 hover:text-indigo-900">← Back to sign in</button>}
          <div className="mt-8 text-center text-[11px] text-slate-400">Secure sign-in · Your work stays yours</div>
        </div>
        <footer className="flex justify-center pb-1 text-[11px] text-slate-400 lg:justify-end">© {new Date().getFullYear()} Teachfolio · Built for reflective practice</footer>
      </section>
    </main>
  );
}

export function PasswordRecoveryScreen({ tokens, onComplete }: { tokens: { accessToken: string; refreshToken: string }; onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const update = trpc.auth.updatePassword.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); onComplete(); } });
  return (
    <main className="min-h-screen bg-[#faf9f6] lg:grid lg:grid-cols-[minmax(0,1.02fr)_minmax(480px,.98fr)]">
      <AuthAside />
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-12 xl:px-16">
        <div className="lg:hidden"><Wordmark /></div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          <div className="mb-7">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-700">Account recovery</p>
            <h1 className="mt-2 text-[36px] font-semibold tracking-[-0.045em] text-slate-950">Choose a new password</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Choose at least 12 characters to secure your Teachfolio account.</p>
          </div>
          <form onSubmit={event => { event.preventDefault(); setError(""); update.mutate({ ...tokens, password }, { onError: cause => setError(cause.message) }); }} className="space-y-4">
            <label className="block"><span className="mb-2 block text-[13px] font-semibold text-slate-700">New password</span><input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/70" /></label>
            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-800">{error}</p>}
            <button disabled={update.isPending} className="flex h-[52px] w-full items-center justify-center rounded-xl bg-indigo-700 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60">{update.isPending ? "Saving…" : "Save new password"}</button>
          </form>
        </div>
        <footer className="text-center text-[11px] text-slate-400 lg:text-right">© {new Date().getFullYear()} Teachfolio</footer>
      </section>
    </main>
  );
}
