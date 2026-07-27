"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { resetMemberPassword } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";

type ResetPasswordFormProps = {
  hasSession: boolean;
  searchParams: Record<string, string | undefined>;
};

export function ResetPasswordForm({ hasSession, searchParams }: ResetPasswordFormProps) {
  const { t } = useLanguage();
  return (
    <div className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <Link href="/member" className="text-sm font-medium text-snow-600 hover:text-snow-700">
          {t({ en: "← Back to member login", zh: "← 返回会员登录" })}
        </Link>
        <section className="card mt-6 space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-snow-600">
              {t({ en: "Password reset", zh: "密码重置" })}
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">
              {t({ en: "Set a new password", zh: "设置新密码" })}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {t({
                en: "Choose a password of at least 6 characters. Sign in with it once you're done.",
                zh: "新密码至少 6 个字符。完成后请使用新密码登录。",
              })}
            </p>
          </div>
          <MemberStatusMessage searchParams={searchParams} scope="reset" />
          {hasSession ? (
            <form action={resetMemberPassword} className="space-y-5">
              <div>
                <label className="label" htmlFor="reset-password">
                  {t({ en: "New password", zh: "新密码" })}
                </label>
                <input id="reset-password" name="password" type="password" className="input-field" minLength={6} required />
              </div>
              <div>
                <label className="label" htmlFor="reset-confirm-password">
                  {t({ en: "Confirm new password", zh: "确认新密码" })}
                </label>
                <input id="reset-confirm-password" name="confirmPassword" type="password" className="input-field" minLength={6} required />
              </div>
              <button className="btn-primary w-full">
                {t({ en: "Update password", zh: "更新密码" })}
              </button>
            </form>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t({
                en: "The reset link has expired or no recovery session is active. Please send a new password reset email.",
                zh: "重置链接已失效或尚未建立恢复会话。请重新发送密码重置邮件。",
              })}
              <div className="mt-3">
                <Link href="/member/forgot-password" className="font-semibold text-snow-700 hover:text-snow-600">
                  {t({ en: "Resend reset email", zh: "重新发送重置邮件" })}
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
