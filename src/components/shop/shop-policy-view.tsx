"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import type { ShopPolicySection, ShopPublishedPolicy } from "@/lib/shop/policies";
import { shopSupportEmail } from "@/lib/shop/contact";

const sectionTitles: Record<ShopPolicySection, { en: string; zh: string }> = {
  shipping: { en: "Shipping & delivery", zh: "配送与送达" },
  requests: { en: "Request a return or exchange", zh: "申请退换货" },
  conditions: { en: "Return conditions", zh: "退换货条件" },
  shipping_costs: { en: "Return shipping costs", zh: "退换货运费" },
  refunds: { en: "Refunds", zh: "退款处理" },
  return_address: { en: "Return address", zh: "退货地址" },
  consumer_rights: { en: "Your consumer rights", zh: "消费者权利" },
};
const sections = Object.keys(sectionTitles) as ShopPolicySection[];

export function ShopPolicyView({ policy, unavailable }: { policy: ShopPublishedPolicy | null; unavailable: boolean }) {
  const { lang } = useLanguage();
  const title = lang === "zh" ? "商城配送与退换政策" : "Shipping & returns";
  const supportEmail = !unavailable && policy ? policy.content.customer_service_email : shopSupportEmail;
  return <div className="shop-container py-10 sm:py-16">
    <Link href="/shop" className="inline-flex min-h-11 items-center text-sm text-[#0066cc] hover:underline">{lang === "zh" ? "← 返回装备商城" : "← Back to Gear Shop"}</Link>
    <header className="mt-4 border-b border-[#e0e0e0] pb-8 sm:pb-10">
      <p className="shop-eyebrow text-[#7a7a7a]">SNOWFORCE / GEAR SHOP</p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
      {policy && !unavailable && <div className="mt-6 space-y-2 text-sm leading-relaxed text-[#7a7a7a]">
        <p>{lang === "zh" ? "销售主体：" : "Seller: "}<span className="text-[#333333]">{policy.content.seller_name}</span></p>
        <p>{lang === "zh" ? "版本 " : "Version "}{policy.version}<span aria-hidden="true"> · </span>{lang === "zh" ? "生效时间：" : "Effective: "}<time dateTime={policy.effective_at}>{new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(policy.effective_at))}</time>{lang === "zh" ? "（美国太平洋时间）" : " (Pacific Time)"}</p>
      </div>}
      <p className="mt-6 text-sm leading-relaxed text-[#7a7a7a]">{lang === "zh" ? "售后咨询：" : "Customer service: "}<a href={`mailto:${supportEmail}`} className="text-[#0066cc] hover:underline">{supportEmail}</a></p>
    </header>
    {unavailable || !policy ? <div role="status" className="max-w-2xl py-12">
      <h2 className="text-xl font-semibold">{unavailable ? (lang === "zh" ? "商城政策暂时无法加载" : "Shop policy is temporarily unavailable") : (lang === "zh" ? "商城政策尚未生效" : "Shop policy is not yet effective")}</h2>
      <p className="mt-3 text-base leading-relaxed text-[#7a7a7a]">{unavailable ? (lang === "zh" ? "请稍后重新打开本页，查看当前已生效的配送与退换政策。" : "Please reopen this page later to read the current shipping and returns policy.") : (lang === "zh" ? "商城政策发布并生效后，会在本页显示。" : "The shop policy will appear here once it is published and takes effect.")}</p>
    </div> : <div className="grid gap-10 py-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
      <nav aria-label={lang === "zh" ? "商城政策目录" : "Shop policy contents"} className="lg:sticky lg:top-28 lg:self-start">
        <ul className="space-y-1">{sections.map((section) => <li key={section}><a href={`#${section}`} className="inline-flex min-h-11 items-center py-2 text-sm text-[#0066cc] hover:underline">{sectionTitles[section][lang]}</a></li>)}</ul>
      </nav>
      <div className="max-w-3xl space-y-10">{sections.map((section) => <section key={section} id={section} aria-labelledby={`${section}-title`} className="scroll-mt-28 border-b border-[#e0e0e0] pb-10 last:border-b-0">
        <h2 id={`${section}-title`} className="text-xl font-semibold sm:text-2xl">{sectionTitles[section][lang]}</h2>
        <p className="mt-4 whitespace-pre-line break-words text-base leading-7 text-[#333333] sm:text-[17px]">{policy.content.copy[section][lang]}</p>
      </section>)}</div>
    </div>}
  </div>;
}
