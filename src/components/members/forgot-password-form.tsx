import Link from "next/link";
import { requestMemberPasswordReset } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";

type ForgotPasswordFormProps = {
  searchParams: Record<string, string | undefined>;
};

export function ForgotPasswordForm({ searchParams }: ForgotPasswordFormProps) {
  return (
    <div className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <Link href="/member" className="text-sm font-medium text-snow-600 hover:text-snow-700">
          ← Back to member login
        </Link>
        <form action={requestMemberPasswordReset} className="card mt-6 space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-snow-600">
              Account recovery
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">忘记密码</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              输入注册邮箱。如果账号存在，我们会发送密码重置链接。
            </p>
          </div>
          <MemberStatusMessage searchParams={searchParams} scope="forgot" />
          <div>
            <label className="label" htmlFor="forgot-password-email">注册邮箱</label>
            <input id="forgot-password-email" name="email" type="email" className="input-field" required />
          </div>
          <button className="btn-primary w-full">发送重置链接</button>
        </form>
      </div>
    </div>
  );
}
