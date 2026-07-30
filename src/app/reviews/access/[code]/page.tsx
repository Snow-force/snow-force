import Link from "next/link";

import { AutoSubmitAccess } from "@/components/reviews/auto-submit-access";
import { acceptReviewAction } from "@/lib/reviews/actions";

const resultCopy: Record<string, { title: string; body: string }> = {
  not_attended: {
    title: "Review access unavailable / 暂时无法填写反馈",
    body: "Your registration has not been marked attended. Please ask on-site staff to verify Check-in.",
  },
  not_registered: {
    title: "Registration not found / 未找到有效报名",
    body: "Please sign in with the member account used for this event registration.",
  },
  not_open: {
    title: "Review is closed / 反馈通道已关闭",
    body: "The on-site review window is no longer accepting new scans.",
  },
  verify_email: {
    title: "Verify your email / 请先验证邮箱",
    body: "Open the verification email, then scan the Review QR again.",
  },
};

export default function ReviewAccessPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: Record<string, string | undefined>;
}) {
  const result = searchParams.result
    ? resultCopy[searchParams.result] ?? {
        title: "Review unavailable / 无法填写反馈",
        body: "This QR code is invalid or does not open a Review campaign.",
      }
    : undefined;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {result ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <h1 className="text-xl font-semibold">{result.title}</h1>
            <p className="mt-2 text-sm leading-6">{result.body}</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Post-event review</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-950">Preparing your review… / 正在验证资格</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              We will confirm your registration and arrival Check-in before opening the form.
            </p>
            <div className="mt-5">
              <AutoSubmitAccess accessCode={params.code} action={acceptReviewAction} label="Open review" />
            </div>
          </>
        )}
        <Link href="/member" className="mt-5 inline-block text-sm font-medium text-blue-700">Go to member portal →</Link>
      </section>
    </main>
  );
}
