"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { requestMemberPasswordReset } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";

type ForgotPasswordFormProps = {
  searchParams: Record<string, string | undefined>;
};

export function ForgotPasswordForm({ searchParams }: ForgotPasswordFormProps) {
  const { t } = useLanguage();
  return (
    <div className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <Link href="/member" className="text-sm font-medium text-snow-600 hover:text-snow-700">
          {t({ en: "← Back to member login", zh: "← 返回会员登录" })}
        </Link>
        <form action={requestMemberPasswordReset} className="card mt-6 space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-snow-600">
              {t({ en: "Account recovery", zh: "账户找回" })}
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">
              {t({ en: "Forgot password", zh: "忘记密码" })}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {t({
                en: "Enter the email registered to your SnowForce account. If it exists, we'll send a password reset link.",
                zh: "输入注册邮箱。如果账号存在，我们会发送密码重置链接。",
              })}
            </p>
          </div>
          <MemberStatusMessage searchParams={searchParams} scope="forgot" />
          <div>
            <label className="label" htmlFor="forgot-password-email">
              {t({ en: "Account email", zh: "注册邮箱" })}
            </label>
            <input id="forgot-password-email" name="email" type="email" className="input-field" required />
          </div>
          <button className="btn-primary w-full">
            {t({ en: "Send reset link", zh: "发送重置链接" })}
          </button>
        </form>
      </div>
    </div>
  );
}
