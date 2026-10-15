"use client";

import { useLanguage } from "@/lib/language";

export default function ShopLoading() {
  const { lang } = useLanguage();
  return <div className="shop-container py-10" aria-busy="true" aria-label={lang === "zh" ? "商城加载中" : "Shop loading"}>
    <p role="status" className="text-sm text-[#666]">{lang === "zh" ? "正在加载商城，请稍候…" : "Loading the shop, please wait…"}</p>
    <div aria-hidden="true" className="mt-6 grid gap-6 motion-safe:animate-pulse lg:grid-cols-[2fr_1fr]">
      <div className="min-h-64 rounded-xl border border-[#e0e0e0] bg-[#f5f5f7] p-6"><div className="h-6 w-1/3 rounded bg-[#e0e0e0]" /><div className="mt-8 h-12 rounded bg-[#e0e0e0]" /><div className="mt-4 h-12 rounded bg-[#e0e0e0]" /></div>
      <div className="min-h-40 rounded-xl border border-[#e0e0e0] bg-[#f5f5f7] p-6"><div className="h-6 w-2/3 rounded bg-[#e0e0e0]" /><div className="mt-8 h-12 rounded bg-[#e0e0e0]" /></div>
    </div>
  </div>;
}
