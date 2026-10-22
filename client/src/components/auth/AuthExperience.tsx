import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <a href="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40" aria-label="Teachfolio home">
      <img src="/teachfolio-mark.svg" alt="" className="h-10 w-10" />
      <span>
        <span className={`block text-[17px] font-bold tracking-[-0.04em] ${light ? "text-white" : "text-slate-950"}`}>teachfolio</span>
        <span className={`mt-0.5 block text-[9px] font-bold uppercase tracking-[0.2em] ${light ? "text-blue-100/75" : "text-slate-500"}`}>Practice portfolio</span>
      </span>
    </a>
  );
}

type AuthScene = "signin" | "create" | "recovery" | "activation";

const sceneCopy: Record<AuthScene, { eyebrow: string; title: string; body: string }> = {
  signin: { eyebrow: "YOUR PRACTICE, YOUR STORY", title: "Make every lesson part of your story.", body: "A thoughtful place to plan, reflect, and keep the work behind your teaching together." },
  create: { eyebrow: "A SPACE TO GROW", title: "Start building the teacher you want to become.", body: "Gather your lesson plans, reflections, and evidence as your classroom practice takes shape." },
  recovery: { eyebrow: "BACK TO YOUR WORK", title: "A fresh start is only a moment away.", body: "Reset your password securely, then return to the portfolio you have been building." },
  activation: { eyebrow: "YOUR INSTITUTION, YOUR NEXT STEP", title: "Your teaching journey starts with the right support.", body: "Institution invitations connect your portfolio to the people and practice that matter." },
};

const sceneImage: Record<AuthScene, string> = {
  signin: "/auth-signin.png",
  create: "/auth-create.png",
  recovery: "/auth-recovery.png",
  activation: "/auth-activation.png",
};

export function AuthAside({ scene = "signin" }: { scene?: AuthScene }) {
  const copy = sceneCopy[scene];
  return (
    <aside className="relative flex min-h-[320px] flex-col overflow-hidden bg-[#285BC0] px-7 py-6 text-white sm:px-10 sm:py-8 lg:min-h-full lg:px-11 lg:py-10 xl:px-14">
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-32 h-[25rem] w-[25rem] rounded-full border border-white/[0.12]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-[21rem] w-[21rem] rounded-full border border-white/[0.10]" />
      <Wordmark light />
      <div className="relative z-10 mx-auto flex w-full max-w-[590px] flex-1 flex-col justify-center pb-2 pt-8 lg:pb-4 lg:pt-10">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[.2em] text-blue-100/80">{copy.eyebrow}</p>
        <h1 className="max-w-[520px] text-[32px] font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-[38px] xl:text-[42px]">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-lg text-[14px] leading-6 text-blue-50/80">
          {copy.body}
        </p>
        <div className="relative mt-8 flex flex-1 flex-col justify-center lg:mt-12">
          <div className="flex items-center justify-center">
            <img src={sceneImage[scene]} alt="" aria-hidden="true" className="w-full max-w-[540px] object-contain" />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/20 pt-4 text-[11px] text-blue-50/75">
          <span>Plan with purpose</span><span>Reflect with care</span><span>Show your growth</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-blue-100/60">
        <span>Made for reflective teaching practice.</span>
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
  const inviteToken = new URLSearchParams(window.location.search).get("invite") ?? undefined;
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
  const resendConfirmation = trpc.auth.resendSignupConfirmation.useMutation({
    onSuccess: () => setNotice("If this address has a pending account, a confirmation email will be sent. Check your inbox and spam folder."),
    onError: () => setNotice("The confirmation request could not be sent. Please try again."),
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
    if (isForgot) reset.mutate({ email, inviteToken });
    else if (isCreate) signup.mutate({ email, name, password, inviteToken }, { onError });
    else login.mutate({ email, password }, { onError });
  };

  return (
    <main className="min-h-screen bg-[#edf1f7] p-0 sm:p-5 lg:p-8">
      <div className="mx-auto min-h-screen max-w-[1380px] overflow-hidden bg-white shadow-[0_28px_90px_rgba(31,51,88,.14)] sm:min-h-[calc(100vh-40px)] sm:rounded-[28px] lg:grid lg:min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1.02fr)_minmax(480px,.98fr)]">
      <AuthAside scene={mode === "forgot" ? "recovery" : mode} />
      <section className="relative flex min-h-[650px] flex-col px-6 py-6 sm:px-10 lg:min-h-full lg:px-12 lg:py-8 xl:px-16">
        <div className="flex items-center justify-end">
          <p className="text-sm text-slate-500">
            {isForgot ? "Remembered your password?" : isCreate ? "Already have an account?" : "New to Teachfolio?"}{" "}
            <button type="button" onClick={() => switchMode(isCreate || isForgot ? "signin" : "create")} className="font-semibold text-[#285bc0] decoration-blue-300 underline-offset-4 hover:underline">
              {isCreate || isForgot ? "Sign in" : "Create account"}
            </button>
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12 lg:py-16">
          <div className="mb-7">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#285bc0]">{isForgot ? "Account recovery" : isCreate ? "Start your portfolio" : "Welcome to Teachfolio"}</p>
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
              <input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Tendai Moyo" className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70" />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-slate-700">Email address</span>
              <span className="relative block">
                <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@school.ac.zw" className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70" />
              </span>
            </label>

            {!isForgot && (
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-[13px] font-semibold text-slate-700">
                  <span>Password</span>
                  {!isCreate && <button type="button" onClick={() => switchMode("forgot")} className="font-semibold text-[#285bc0] hover:text-blue-900">Forgot password?</button>}
                </span>
                <span className="relative block">
                  <input required minLength={isCreate ? 12 : 1} maxLength={128} type={showPassword ? "text" : "password"} autoComplete={isCreate ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={isCreate ? "At least 12 characters" : "Enter your password"} className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                {isCreate && <span className="mt-2 block text-xs text-slate-500">Use 12 or more characters to keep your account secure.</span>}
              </label>
            )}

            {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] leading-5 text-emerald-900">{notice}</p>}
            {!isCreate && !isForgot && email.trim() && (
              <button
                type="button"
                disabled={resendConfirmation.isPending}
                onClick={() => resendConfirmation.mutate({ email: email.trim(), inviteToken })}
                className="text-sm font-semibold text-[#285bc0] underline underline-offset-4 disabled:opacity-60"
              >
                {resendConfirmation.isPending ? "Sending confirmation…" : "Resend confirmation email"}
              </button>
            )}
            {(formError || error) && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-5 text-rose-800">{formError || error}</p>}

            <button disabled={pending} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#285bc0] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(40,91,192,.2)] transition hover:bg-[#214fa9] hover:shadow-[0_10px_22px_rgba(40,91,192,.24)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-60">
              {pending ? "Please wait…" : isForgot ? "Send reset link" : isCreate ? "Create my account" : "Sign in to your portfolio"}
            </button>
          </form>

          {!isForgot && (
            <div className="mt-6 border-l-2 border-emerald-500 pl-3.5">
              <p className="text-xs leading-[1.6] text-slate-600">Your portfolio is private. Account creation does not assign a role; access begins after your institution administrator activates your invitation.</p>
            </div>
          )}

          {isForgot && <button type="button" onClick={() => switchMode("signin")} className="mt-5 self-start text-sm font-semibold text-[#285bc0] hover:text-blue-900">← Back to sign in</button>}
          <div className="mt-8 text-center text-[11px] text-slate-400">Secure sign-in · Your work stays yours</div>
        </div>
        <footer className="flex justify-center pb-1 text-[11px] text-slate-400 lg:justify-end">© {new Date().getFullYear()} Teachfolio · Built for reflective practice</footer>
      </section>
      </div>
    </main>
  );
}

export function PasswordRecoveryScreen({ tokens, onComplete }: { tokens: { accessToken: string; refreshToken: string }; onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const update = trpc.auth.updatePassword.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); onComplete(); } });
  return (
    <main className="min-h-screen bg-[#edf1f7] p-0 sm:p-5 lg:p-8">
      <div className="mx-auto min-h-screen max-w-[1380px] overflow-hidden bg-white shadow-[0_28px_90px_rgba(31,51,88,.14)] sm:min-h-[calc(100vh-40px)] sm:rounded-[28px] lg:grid lg:min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1.02fr)_minmax(480px,.98fr)]">
      <AuthAside scene="recovery" />
      <section className="flex min-h-[650px] flex-col px-6 py-6 sm:px-10 lg:min-h-full lg:px-12 lg:py-8 xl:px-16">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          <div className="mb-7">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#285bc0]">Account recovery</p>
            <h1 className="mt-2 text-[36px] font-semibold tracking-[-0.045em] text-slate-950">Choose a new password</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Choose at least 12 characters to secure your Teachfolio account.</p>
          </div>
          <form onSubmit={event => { event.preventDefault(); setError(""); update.mutate({ ...tokens, password }, { onError: cause => setError(cause.message) }); }} className="space-y-4">
            <label className="block"><span className="mb-2 block text-[13px] font-semibold text-slate-700">New password</span><input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" className="h-[50px] w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70" /></label>
            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-800">{error}</p>}
            <button disabled={update.isPending} className="flex h-[52px] w-full items-center justify-center rounded-xl bg-[#285bc0] text-sm font-semibold text-white hover:bg-[#214fa9] disabled:opacity-60">{update.isPending ? "Saving…" : "Save new password"}</button>
          </form>
        </div>
        <footer className="text-center text-[11px] text-slate-400 lg:text-right">© {new Date().getFullYear()} Teachfolio</footer>
      </section>
      </div>
    </main>
  );
}
