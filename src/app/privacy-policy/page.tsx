"use client";

import { PrivacyNoticeContent } from "@/components/site/privacy-notice-content";
import { useLanguage } from "@/lib/language";

export default function PrivacyPolicyPage() {
  const { lang, t } = useLanguage();
  return <main className={`bg-white py-16 sm:py-20 ${lang === "zh" ? "break-keep" : ""}`}><div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8"><header className="text-center"><h1 className="section-title">{t({ en: "Privacy Notice", zh: "隐私守则" })}</h1><p className="mt-3 text-[15px] leading-7 text-[#7a7a7a]">{t({ en: "How SnowForce handles member and event information.", zh: "SnowForce 如何处理会员和活动信息。" })}</p><p className="mt-2 text-[13px] text-[#7a7a7a]">{t({ en: "Last updated: August 4, 2026", zh: "最后更新：2026 年 8 月 4 日" })}</p></header><div className="mt-10 border-t border-[#e0e0e0] pt-8"><PrivacyNoticeContent /></div></div></main>;
}
