"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import type { Event } from "@/lib/types";
import { isMerchantBoothEventEligible } from "@/lib/events/merchant-booth";

export { isMerchantBoothEventEligible } from "@/lib/events/merchant-booth";

export function MerchantBoothCta({ event }: { event: Event }) {
  const { t } = useLanguage();
  if (!isMerchantBoothEventEligible(event)) return null;

  return (
    <section className="card" aria-labelledby="merchant-booth-heading">
      <p className="text-[14px] font-semibold uppercase tracking-[-0.224px] text-[#0066cc]">
        {t({ en: "Merchant booths", zh: "商户摊位" })}
      </p>
      <h2 id="merchant-booth-heading" className="mt-2 text-[24px] font-semibold leading-[1.18] tracking-[-0.28px] text-[#1d1d1f]">
        {t({ en: "Bring your brand to this session", zh: "让你的品牌来到这场活动" })}
      </h2>
      <p className="mt-2 text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">
        {t({ en: "Apply for an event booth. Applications are reviewed by SnowForce; booth fees are arranged offline.", zh: "申请活动摊位。SnowForce 将审核申请；摊位费用在线下安排。" })}
      </p>
      <Link href={`/merchant/applications?event=${encodeURIComponent(event.slug)}`} className="btn-secondary mt-5">
        {t({ en: "Apply for a booth", zh: "申请摊位" })}
      </Link>
    </section>
  );
}
