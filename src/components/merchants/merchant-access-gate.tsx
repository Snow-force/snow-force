"use client";

import Link from "next/link";
import { resendMerchantVerification } from "@/lib/merchants/actions";
import { useLanguage } from "@/lib/language";

type MerchantAccessReason = "anonymous" | "unverified" | "profile";

type MerchantAccessGateProps = {
  readonly reason: MerchantAccessReason;
  readonly next: string;
  readonly email?: string | null;
};

export function MerchantAccessGate({ reason, next, email }: MerchantAccessGateProps) {
  const { t } = useLanguage();
  const isAnonymous = reason === "anonymous";
  const isUnverified = reason === "unverified";
  const title = isAnonymous
    ? t({ en: "Sign in to continue", zh: "请登录后继续" })
    : isUnverified
      ? t({ en: "Verify your email to continue", zh: "请先验证邮箱再继续" })
      : t({ en: "Complete your merchant profile", zh: "请完善商家资料" });
  const body = isAnonymous
    ? t({ en: "A merchant account is required to submit or view booth applications.", zh: "需要商家账号才能提交或查看展位申请。" })
    : isUnverified
      ? t({ en: "For application security, verify the email on your merchant account before continuing.", zh: "为保障申请安全，请先完成商家账号的邮箱验证。" })
      : t({ en: "Your merchant profile is missing. Contact SnowForce support before applying.", zh: "你的商家资料缺失。请在申请前联系 SnowForce 支持团队。" });

  return (
    <main className="merchant-shell min-h-[100dvh] px-4 py-10 sm:px-6">
      <section className="merchant-portal-card mx-auto max-w-xl text-center">
        <p className="label text-snow-700">SnowForce</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--sf-ink)]">{title}</h1>
        <p className="mt-3 text-base leading-7 text-[var(--sf-text-strong)]">{body}</p>
        {isAnonymous ? (
          <Link href={`/merchant?next=${encodeURIComponent(next)}`} className="btn-primary mt-6">
            {t({ en: "Open merchant sign-in", zh: "打开商家登录" })}
          </Link>
        ) : isUnverified ? (
          <form action={resendMerchantVerification} className="mx-auto mt-6 max-w-sm text-left">
            <label htmlFor="merchant-gate-email" className="label">{t({ en: "Merchant email", zh: "商家邮箱" })}</label>
            <input id="merchant-gate-email" name="email" type="email" className="input-field" defaultValue={email ?? ""} autoComplete="email" required />
            <button className="btn-primary mt-4 w-full">{t({ en: "Resend verification email", zh: "重新发送验证邮件" })}</button>
          </form>
        ) : (
          <Link href="/merchant/settings" className="btn-primary mt-6">{t({ en: "Open merchant profile", zh: "打开商家资料" })}</Link>
        )}
      </section>
    </main>
  );
}
