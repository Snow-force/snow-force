"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";

export function CartCheckoutNotice({ onContinue }: { onContinue?: () => void }) {
  const { lang } = useLanguage();
  return <div role="alert" className="my-5 rounded-lg bg-[#f5f5f7] p-4 text-sm">
    <p>{lang === "zh" ? "购物车暂时被结账锁定：付款可能仍在进行，或税费记录需要核对。请先检查原付款状态，再修改商品。" : "Cart changes are paused while checkout is active or its tax quote needs review. Check the original payment status before editing items."}</p>
    <p className="mt-2">{lang === "zh" ? "返回或刷新页面不会取消付款。系统确认付款已取消后，重新尝试删除即可恢复编辑；已授权、处理中或已付款的交易不能直接绕过。" : "Going back or refreshing does not cancel a payment. After cancellation is verified, retry removing the item. Authorized, processing or paid transactions cannot be bypassed."}</p>
    <Link href="/shop/checkout" onClick={onContinue} className="mt-3 inline-flex min-h-11 items-center text-[#0066cc] underline">{lang === "zh" ? "返回结账检查付款状态" : "Return to checkout and check payment status"}</Link>
  </div>;
}
