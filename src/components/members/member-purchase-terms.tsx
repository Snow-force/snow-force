"use client";

import { useLanguage } from "@/lib/language";
import type { AfterSalesPurchase } from "@/lib/shop/after-sales";
import { formatOrderDate } from "@/lib/shop/member-orders";
import { shopPolicySections, type ShopPolicySection } from "@/lib/shop/policies";

const headings: Record<ShopPolicySection, { en: string; zh: string }> = {
  shipping: { en: "Shipping", zh: "配送" }, requests: { en: "Return requests", zh: "退换货申请" },
  conditions: { en: "Item conditions", zh: "商品条件" }, shipping_costs: { en: "Return shipping costs", zh: "退换货运费" },
  refunds: { en: "Refunds", zh: "退款" }, return_address: { en: "Return address", zh: "退货地址" },
  consumer_rights: { en: "Consumer rights", zh: "消费者权利" },
};
export function MemberPurchaseTerms({ purchase }: { purchase: AfterSalesPurchase | null }) {
  const { t, lang } = useLanguage(), policy = purchase?.policy;
  return <div className="mt-5 rounded-lg border border-[#dce2d9] bg-[#f7f8f4] p-4 text-sm leading-6">
    <h3 className="font-semibold">{t({ en: "Your purchase terms", zh: "本次购买条款" })}</h3>
    {policy ? <>
      <p className="mt-2 text-[#687163]">{t({ en: `Policy version ${policy.version}, accepted for this order. Later policies do not replace these terms.`, zh: `本订单适用购买时的政策版本 ${policy.version}，后续政策不会替换这些条款。` })}</p>
      <p className="mt-2">{t({ en: `Ordinary requests: ${policy.content.terms.return_window_days} calendar days after delivery or collection.`, zh: `普通退换货申请：送达或自提领取后 ${policy.content.terms.return_window_days} 个日历日内。` })} {t({ en: "Dates below use Pacific Time.", zh: "下方日期按美国太平洋时间计算。" })}</p>
      <details className="mt-4"><summary className="cursor-pointer font-medium text-[#0066cc]">{t({ en: "Read the policy accepted for this purchase", zh: "查看购买时的完整政策" })}</summary>
        <div className="mt-4 space-y-4"><p>{t({ en: "Seller", zh: "销售主体" })}: {policy.content.seller_name}</p><p>{t({ en: "Support contact at purchase", zh: "购买时的客服联系方式" })}: <a className="text-[#0066cc] underline" href={`mailto:${policy.content.customer_service_email}`}>{policy.content.customer_service_email}</a></p>
          {shopPolicySections.map(section => <div key={section}><h4 className="font-semibold">{t(headings[section])}</h4><p className="mt-1 whitespace-pre-wrap break-words text-[#687163]">{policy.content.copy[section][lang]}</p></div>)}
        </div>
      </details>
    </> : <p className="mt-2 text-[#687163]">{t({ en: "The original purchase policy cannot currently be verified. Support will review your order; no deadline is assumed.", zh: "暂时无法核实原购买政策。客服会核查本订单，不会据此假定申请期限。" })}</p>}
    {purchase?.lines.length ? <ul className="mt-4 space-y-3">{purchase.lines.map(line => <li key={line.id}><p className="font-medium">{line.title}</p><p className="text-[#687163]">{line.status === "manual" ? t({ en: "Delivery dates or split packages need staff review.", zh: "送达日期或分批包裹需要客服核查。" }) : line.status === "expired" ? t({ en: "The ordinary request window has ended. You may submit a request for review.", zh: "普通申请期限已过，仍可提交申请，由客服审核。" }) : t({ en: "Within the ordinary request window.", zh: "仍在普通申请期限内。" })}</p>{line.earliestDeadline && line.latestDeadline ? <p>{t({ en: "Request by", zh: "申请截止日" })}: {formatOrderDate(line.earliestDeadline, lang)}{line.latestDeadline !== line.earliestDeadline && ` – ${formatOrderDate(line.latestDeadline, lang)}`}</p> : null}</li>)}</ul> : null}
    <p className="mt-4 text-[#687163]">{t({ en: "Quality issues and incorrect items remain reviewable beyond the ordinary window. Wait for approval before returning gear.", zh: "质量问题与错发商品超过普通期限仍可申请审核。请获批后再寄回装备。" })}</p>
  </div>;
}
