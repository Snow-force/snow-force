"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language";

/** Mount for one real operation and unmount when it settles; never starts work. */
export function PendingFeedback({ kind }: { kind: "cart" | "checkout" | "payment" }) {
  const { lang } = useLanguage();
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const slow = window.setTimeout(() => setStage(1), 8_000);
    const unresolved = window.setTimeout(() => setStage(2), 30_000);
    return () => { window.clearTimeout(slow); window.clearTimeout(unresolved); };
  }, []);
  if (!stage) return null;
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  return <div role="status" aria-live="polite" aria-atomic="true" className="mt-4 rounded-lg border border-[#d2d2d7] bg-white p-4 text-sm leading-relaxed">
    <p>{stage === 1 ? text("This is taking longer than usual. Your request is still in progress.", "本次响应较慢，请稍候，当前请求仍在处理中。")
      : kind === "cart" ? text("The cart update is not confirmed yet. Keep this page open and avoid repeating the change.", "购物车更新结果尚未确认。请保留此页面，暂勿重复操作。")
      : text("The result is not confirmed yet. Keep this page open and do not submit another payment.", "结果尚未确认。请保留此页面，暂勿再次付款。")}</p>
    {stage === 2 && <Link className="mt-2 inline-flex min-h-11 items-center text-[#0066cc] underline" href={kind === "cart" ? "/shop/cart" : "/member/orders"} target="_blank" rel="noopener noreferrer">{kind === "cart" ? text("View current cart in a new tab", "在新标签页查看当前购物车") : text("Check orders in a new tab", "在新标签页检查订单")}</Link>}
  </div>;
}
