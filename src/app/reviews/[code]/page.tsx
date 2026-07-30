import Link from "next/link";
import { redirect } from "next/navigation";

import { EventReviewForm } from "@/components/reviews/event-review-form";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { getMemberReviewSession } from "@/lib/reviews/repository";

export default async function ReviewFormPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: Record<string, string | undefined>;
}) {
  const account = await getCurrentMemberAccount();
  if (!account?.profile) {
    redirect(`/member?next=${encodeURIComponent(`/reviews/${params.code}`)}`);
  }
  const session = await getMemberReviewSession(params.code, account.profile.id);
  if (!session?.campaign.reviewConfigSnapshot) {
    redirect(`/reviews/access/${params.code}?result=not_open`);
  }
  const config = session.campaign.reviewConfigSnapshot;
  const completed = Boolean(session.existingReview) || searchParams.submitted === "1";

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {completed ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-700">Submitted</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-950">
            {config.thankYouTitle.en}
            {config.thankYouTitle.zh ? ` / ${config.thankYouTitle.zh}` : ""}
          </h1>
          <p className="mt-3 leading-7 text-gray-600">
            {config.thankYouBody.en}
            {config.thankYouBody.zh ? ` / ${config.thankYouBody.zh}` : ""}
          </p>
          {config.reward.enabled ? (
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
              <h2 className="font-semibold">Gift information / 礼品领取</h2>
              <p className="mt-2 text-sm leading-6">
                {config.reward.description.en}
                {config.reward.description.zh ? ` / ${config.reward.description.zh}` : ""}
              </p>
              <p className="mt-2 text-sm leading-6">
                {config.reward.redemptionInstructions.en}
                {config.reward.redemptionInstructions.zh
                  ? ` / ${config.reward.redemptionInstructions.zh}`
                  : ""}
              </p>
              <p className="mt-3 text-xs text-blue-800">
                One gift per eligible member. Gifts are subject to on-site availability.
                每位符合条件会员限领一次，礼品以现场实际库存为准。
              </p>
            </div>
          ) : null}
          <Link href="/member" className="mt-6 inline-block font-medium text-blue-700">Return to member portal →</Link>
        </section>
      ) : (
        <>
          <header className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">About 3 minutes</p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-950">Event review / 活动反馈</h1>
            <p className="mt-3 max-w-2xl leading-7 text-gray-600">
              Honest, specific feedback helps improve future events. If this event offers a gift,
              it is for completing thoughtful feedback and is never tied to your rating.
            </p>
          </header>
          <EventReviewForm accessCode={params.code} config={config} />
        </>
      )}
    </main>
  );
}
