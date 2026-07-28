"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";
import { resendMemberVerification } from "@/lib/members/actions";

type Variant = "compact" | "prominent";

type MemberResendVerificationProps = {
  readonly variant: Variant;
};

const COPY = {
  label: { en: "Resend verification email", zh: "重新发送验证邮件" },
  placeholder: { en: "Resend verification email", zh: "重新发送验证邮件" },
  buttonIdle: { en: "Resend", zh: "重新发送" },
  buttonPending: { en: "Sending...", zh: "发送中..." },
} as const;

const INPUT_ID = "member-resend-verification-email";

const BUTTON_CLASS: Record<Variant, string> = {
  compact:
    "rounded-full border border-white/10 px-3.5 text-[11px] font-semibold text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
  prominent: "auth-primary-button",
};

function SubmitButton({
  variant,
  pending,
}: {
  readonly variant: Variant;
  readonly pending: boolean;
}) {
  const { t } = useLanguage();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={BUTTON_CLASS[variant]}
    >
      {pending ? t(COPY.buttonPending) : t(COPY.buttonIdle)}
    </button>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${value}`);
}

export function MemberResendVerification({ variant }: MemberResendVerificationProps) {
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);

  function handleSubmit() {
    setPending(true);
  }

  switch (variant) {
    case "compact":
      return (
        <form
          action={resendMemberVerification}
          onSubmit={handleSubmit}
          className="mt-3 flex gap-2"
        >
          <label htmlFor={INPUT_ID} className="sr-only">
            {t(COPY.label)}
          </label>
          <input
            id={INPUT_ID}
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t(COPY.placeholder)}
            required
            className="auth-input-dark min-h-9 flex-1 text-[12px]"
          />
          <SubmitButton variant="compact" pending={pending} />
        </form>
      );
    case "prominent":
      return (
        <form
          action={resendMemberVerification}
          onSubmit={handleSubmit}
          className="mt-4 space-y-3"
        >
          <div>
            <label
              htmlFor={INPUT_ID}
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40"
            >
              {t(COPY.label)}
            </label>
            <input
              id={INPUT_ID}
              name="email"
              type="email"
              autoComplete="email"
              required
              className="auth-input-dark"
            />
          </div>
          <SubmitButton variant="prominent" pending={pending} />
        </form>
      );
    default:
      assertNever(variant);
  }
}
