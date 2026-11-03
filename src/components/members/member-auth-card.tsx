"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useLanguage } from "@/lib/language";
import {
  loginMemberProfile,
  loginMemberWithGoogle,
  registerMemberProfile,
  requestMemberMagicLink,
  requestMemberPasswordReset,
} from "@/lib/members/actions";
import {
  isValidMemberEmail,
  normalizeMemberEmail,
  validatePassword,
} from "@/lib/members/member-validation";
import { MemberStatusMessage } from "./member-status-message";

type AuthCardProps = {
  searchParams: Record<string, string | undefined>;
};

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function RegisterSubmitButton({ enabled, pending }: { readonly enabled: boolean; readonly pending: boolean }) {
  return (
    <button
      type="submit"
      className="auth-primary-button mt-1 md:min-h-14 md:text-[17px]"
      disabled={!enabled || pending}
      aria-busy={pending}
    >
      {pending ? "Creating account..." : "Create SnowForce account"}
      <span className="sr-only" aria-live="polite">
        {pending ? "Creating your SnowForce account." : ""}
      </span>
    </button>
  );
}

export function MemberAuthCard({ searchParams }: AuthCardProps) {
  const { t } = useLanguage();
  const initialMode = searchParams.mode === "register" || searchParams.mode === "magic" ? searchParams.mode : "login";
  const [mode, setMode] = useState<"login" | "register" | "magic">(initialMode);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [registerPending, setRegisterPending] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerEmailTouched, setRegisterEmailTouched] = useState(false);
  const [registerConfirmTouched, setRegisterConfirmTouched] = useState(false);
  const [registerSubmitted, setRegisterSubmitted] = useState(false);
  const next = searchParams.next ?? "/member";
  const passwordValidation = validatePassword(registerPassword);
  const emailIsValid = isValidMemberEmail(registerEmail);
  const passwordsMatch = registerConfirmPassword.length > 0 && registerPassword === registerConfirmPassword;
  const registrationIsValid = emailIsValid && passwordValidation.valid && passwordsMatch && privacyAccepted;
  const showEmailError = (registerEmailTouched || registerSubmitted) && !emailIsValid;
  const showConfirmError = (registerConfirmTouched || registerSubmitted) && !passwordsMatch;

  async function handleRegistrationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterSubmitted(true);
    if (!registrationIsValid) return;
    setRegisterPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("email", normalizeMemberEmail(registerEmail));
      formData.set("marketingEmailOptIn", "on");
      await registerMemberProfile(formData);
    } finally {
      setRegisterPending(false);
    }
  }

  const heading = mode === "register" ? "Create profile" : mode === "magic" ? "Magic link" : "Welcome";
  const subtext = forgotOpen
    ? "Enter your email and we'll send a reset link."
    : mode === "register"
      ? "Start with the essentials. Add riding details after verification."
      : mode === "magic"
        ? "No password needed. A secure SnowForce sign-in link will be sent."
        : "Plan the next ride, track trips, and keep your registration details ready.";

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-[40px] border border-white/15 bg-[#0f1724]/90 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7 md:max-w-[520px] md:rounded-[44px] md:p-10 min-[960px]:max-w-none xl:p-12">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7dd3fc] md:text-[12px]">SnowForce Account</p>
        <h2 className="mt-1.5 text-[26px] font-semibold leading-[1.1] tracking-[-0.5px] text-white md:mt-2 md:text-[34px] md:tracking-[-0.9px] xl:text-[38px]">
          {heading}
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-white/40 md:mt-3 md:text-[15px] md:leading-6">
          {subtext}
        </p>
      </div>

      <div className="mt-4 md:mt-6">
        <MemberStatusMessage searchParams={searchParams} />
      </div>

      {forgotOpen ? (
        /* ─── Forgot password secondary panel ─── */
        <div className="mt-4 md:mt-6">
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="mb-4 text-[12px] font-semibold text-white/50 hover:text-white"
          >
            ← Back
          </button>
          <form action={requestMemberPasswordReset} className="space-y-3 md:space-y-4">
            <AuthField label="Email" id="forgot-email" name="email" type="email" autoComplete="email" />
            <button className="auth-primary-button mt-1 md:min-h-14 md:text-[17px]">Send reset link</button>
          </form>
        </div>
      ) : (
        /* ─── Main form area ─── */
        <div className="mt-4 md:mt-6">
          {mode === "register" ? (
            <form noValidate onSubmit={handleRegistrationSubmit} className="space-y-3 md:space-y-4">
              <input type="hidden" name="next" value={next} />
              <AuthField label="Display name" id="register-member-name" name="displayName" autoComplete="name" />
              <AuthField
                label="Email"
                id="register-member-email"
                name="email"
                type="email"
                autoComplete="email"
                value={registerEmail}
                onBlur={() => setRegisterEmailTouched(true)}
                onChange={(event) => setRegisterEmail(event.target.value)}
                aria-invalid={showEmailError}
                aria-describedby={showEmailError ? "register-email-error" : undefined}
              />
              {showEmailError ? (
                <p id="register-email-error" className="-mt-2 text-xs text-red-300" role="alert">
                  {t({ en: "Please enter a valid email address.", zh: "请输入有效的邮箱地址。" })}
                </p>
              ) : null}
              <AuthField
                label="Password"
                id="register-member-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
              />
              <PasswordRequirements validation={passwordValidation} submitted={registerSubmitted} />
              <AuthField
                label="Confirm password"
                id="register-member-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={registerConfirmPassword}
                onBlur={() => setRegisterConfirmTouched(true)}
                onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                aria-invalid={showConfirmError}
                aria-describedby={showConfirmError ? "register-confirm-password-error" : undefined}
              />
              {showConfirmError ? (
                <p id="register-confirm-password-error" className="-mt-2 text-xs text-red-300" role="alert">
                  {t({ en: "The two passwords do not match.", zh: "两次输入的密码不一致。" })}
                </p>
              ) : null}
              <div className="space-y-2.5 pt-1 text-[13px] leading-5 text-white/65 md:text-[14px]">
                <label className="flex items-start gap-3">
                  <input
                    name="privacyPolicyAccepted"
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(event) => setPrivacyAccepted(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/25 bg-white/5 text-[#005bea]"
                    required
                  />
                  <span>
                    {t({ en: "I have read and agree to the ", zh: "我已阅读并同意" })}
                    <Link href="/privacy-policy" target="_blank" className="font-semibold text-[#7dd3fc] underline underline-offset-2">
                      {t({ en: "Privacy Notice", zh: "《隐私守则》" })}
                    </Link>
                    {t({ en: ", including permission for SnowForce to use event photos and videos on social media.", zh: "，包括授权 SnowForce 将活动照片和视频用于社交媒体。" })}
                  </span>
                </label>
              </div>
              <RegisterSubmitButton enabled={registrationIsValid} pending={registerPending} />
            </form>
          ) : mode === "magic" ? (
            <form action={requestMemberMagicLink} className="space-y-3 md:space-y-4">
              <input type="hidden" name="next" value={next} />
              <AuthField label="Email" id="magic-member-email" name="email" type="email" autoComplete="email" />
              <button className="auth-primary-button mt-1 md:min-h-14 md:text-[17px]">Send secure link</button>
            </form>
          ) : (
            <form action={loginMemberProfile} className="space-y-3 md:space-y-4">
              <input type="hidden" name="next" value={next} />
              <AuthField label="Email" id="login-member-email" name="email" type="email" autoComplete="email" />
              <AuthField label="Password" id="login-member-password" name="password" type="password" autoComplete="current-password" />
              <div className="flex items-center justify-between gap-3 text-[12px] text-white/50 md:text-[13px]">
                <label className="flex items-center gap-2">
                  <input name="remember" type="checkbox" className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#005bea]" defaultChecked />
                  Keep me signed in
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="font-semibold text-[#7dd3fc] hover:text-white"
                >
                  Forgot password?
                </button>
              </div>
              <button className="auth-primary-button mt-1 md:min-h-14 md:text-[17px]">Sign in</button>
            </form>
          )}

          {/* Google divider */}
          <div className="mt-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-white/20 md:mt-6">
            <span className="h-px flex-1 bg-white/10" />
            <span>or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form action={loginMemberWithGoogle} className="mt-4 md:mt-5">
            <input type="hidden" name="next" value={next} />
            <button aria-describedby="google-account-help" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 text-[15px] font-semibold text-white transition hover:bg-white/10 active:scale-[0.98] md:min-h-14 md:text-[17px]">
              <GoogleIcon /> Continue with Google
            </button>
          </form>
          <p id="google-account-help" className="mt-3 text-center text-xs leading-relaxed text-white/60">
            {t({ en: "Already registered? Choose the Google account with the same email as your SnowForce account to access your existing trips.", zh: "已注册过？请选择与 SnowForce 注册邮箱一致的 Google 账号，查看原有报名记录。" })}
          </p>
        </div>
      )}

      {/* Bottom small action links */}
      {!forgotOpen && (
        <div className="mt-5 flex flex-col items-center gap-2.5 border-t border-white/8 pt-4 text-center text-[12px] md:mt-6 md:gap-3 md:pt-5 md:text-[13px]">
          {mode === "login" ? (
            <>
              <button
                type="button"
                onClick={() => setMode("register")}
                className="text-white/40 transition hover:text-white"
              >
                Don&apos;t have an account? <span className="font-semibold text-[#7dd3fc]">Register</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("magic")}
                className="text-white/40 transition hover:text-white"
              >
                Use a <span className="font-semibold text-[#7dd3fc]">magic link</span> instead
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setMode("login"); setForgotOpen(false); }}
              className="text-white/40 transition hover:text-white"
            >
              ← Back to <span className="font-semibold text-[#7dd3fc]">sign in</span>
            </button>
          )}
          <Link
            href="/merchant"
            className="text-white/40 transition hover:text-white"
          >
            Looking to set up a booth? Visit the&nbsp;<span className="font-semibold text-[#7dd3fc]">Merchant Portal</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function PasswordRequirements({
  validation,
  submitted,
}: {
  readonly validation: ReturnType<typeof validatePassword>;
  readonly submitted: boolean;
}) {
  const { t } = useLanguage();
  const requirements = [
    [t({ en: "At least 8 characters", zh: "至少 8 个字符" }), validation.minLength],
    [t({ en: "One uppercase letter", zh: "包含一个大写字母" }), validation.hasUppercase],
    [t({ en: "One lowercase letter", zh: "包含一个小写字母" }), validation.hasLowercase],
    [t({ en: "One number", zh: "包含一个数字" }), validation.hasNumber],
  ] as const;

  return (
    <ul className="-mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-4 md:text-xs" aria-label="Password requirements">
      {requirements.map(([label, met]) => (
        <li key={label} className={met ? "text-emerald-300" : submitted ? "text-red-300" : "text-white/40"}>
          <span aria-hidden="true" className="mr-1">{met ? "✓" : "•"}</span>{label}
        </li>
      ))}
    </ul>
  );
}

function AuthField({ label, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40 md:mb-1.5 md:text-[12px]">{label}</label>
      <input id={id} className="auth-input-dark md:min-h-14 md:px-5 md:text-[17px]" required {...props} />
    </div>
  );
}
