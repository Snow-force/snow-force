import Link from "next/link";

import { AutoSubmitAccess } from "@/components/reviews/auto-submit-access";
import { acceptCheckinAction } from "@/lib/reviews/actions";

const resultCopy: Record<string, { title: string; body: string; tone: string }> = {
  success: {
    title: "Check-in complete / 签到成功",
    body: "Your confirmed registration is now marked attended. 已将你的报名记录标记为到场。",
    tone: "border-green-200 bg-green-50 text-green-900",
  },
  already: {
    title: "Already checked in / 已完成签到",
    body: "No further action is needed. 无需重复操作。",
    tone: "border-blue-200 bg-blue-50 text-blue-900",
  },
  not_registered: {
    title: "Registration not found / 未找到有效报名",
    body: "Please ask on-site staff to confirm the member account used for registration.",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  not_open: {
    title: "Check-in is closed / 签到已关闭",
    body: "Please contact on-site staff for help.",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  verify_email: {
    title: "Verify your email / 请先验证邮箱",
    body: "Open the verification email, then scan this QR code again.",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

export default async function CheckinPage(
  props: {
    params: Promise<{ code: string }>;
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const result = searchParams.result
    ? resultCopy[searchParams.result] ?? {
        title: "Check-in unavailable / 无法签到",
        body: "This QR code is invalid or no longer available. Please ask on-site staff for help.",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
      }
    : undefined;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {result ? (
          <div className={`rounded-xl border p-5 ${result.tone}`}>
            <h1 className="text-xl font-semibold">{result.title}</h1>
            <p className="mt-2 text-sm leading-6">{result.body}</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">SnowForce event</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-950">Checking you in… / 正在签到</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Keep this page open. If automatic check-in does not start, use the button below.
            </p>
            <div className="mt-5">
              <AutoSubmitAccess accessCode={params.code} action={acceptCheckinAction} label="Complete check-in" />
            </div>
          </>
        )}
        <Link href="/member" className="mt-5 inline-block text-sm font-medium text-blue-700">Go to member portal →</Link>
      </section>
    </main>
  );
}
