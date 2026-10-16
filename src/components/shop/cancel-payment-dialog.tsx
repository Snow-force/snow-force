"use client";

import { useEffect, useId, useRef } from "react";
import { useLanguage } from "@/lib/language";
import { formatStorePrice } from "@/lib/shop/storefront";
import { LoadingStatus } from "./loading-status";
import { PendingFeedback } from "./pending-feedback";

export type CancelPaymentPrompt = { itemId?: string; token: string; amountCents: number };
export function CancelPaymentDialog({ prompt, busy, uncertain, dismiss, confirm }: { prompt: CancelPaymentPrompt | null; busy: boolean; uncertain: boolean; dismiss: () => void; confirm: (prompt: CancelPaymentPrompt) => Promise<void> }) {
  const { lang } = useLanguage(), id = useId(), dialog = useRef<HTMLDialogElement>(null);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  useEffect(() => {
    const element = dialog.current;
    if (prompt && !element?.open) element?.showModal();
    if (!prompt && element?.open) element.close();
  }, [prompt]);
  return <dialog ref={dialog} aria-labelledby={id} aria-describedby={`${id}-description`} className="m-auto w-[min(480px,calc(100%_-_32px))] rounded-xl border border-[#d2d2d7] bg-white p-6 text-[#1d1d1f] backdrop:bg-black/50" onCancel={event => { if (busy) event.preventDefault(); else dismiss(); }}>
    <h2 id={id} className="text-xl font-semibold">{prompt?.itemId ? text("Cancel the unfinished payment and remove this item?", "取消未完成的付款并删除此商品？") : text("Cancel the unfinished payment and edit checkout?", "取消未完成的付款并修改结账信息？")}</h2>
    <p id={`${id}-description`} className="mt-4 text-sm leading-relaxed">{prompt?.itemId ? text("The server will check the original payment, cancel it only if it is unpaid and unauthorized, then restore your cart before removing the item.", "系统会核对原付款，仅在未扣款、未授权时尝试取消，恢复购物车后再删除商品。") : text("The server will check the original payment and restore checkout only after cancellation is verified. You will need to review tax, delivery and the policy again.", "系统会核对原付款，确认取消成功后恢复结账编辑。你需要重新核对税费、收货方式和政策。")}</p>
    {prompt && <p className="mt-3 text-sm">{text("Original checkout", "原结账金额")}: {formatStorePrice(prompt.amountCents / 100, lang)} USD</p>}
    {busy ? <div className="mt-4 text-sm"><LoadingStatus>{text("Checking cancellation and restoring your cart…", "正在核对取消结果并恢复购物车…")}</LoadingStatus></div> : uncertain && <p role="alert" className="mt-4 text-sm">{text("The result is not confirmed yet. Check the same payment before retrying; no new payment will be created.", "结果尚待确认。重试会先核对同一笔付款，不会创建新付款。")}</p>}
    {busy && prompt && <PendingFeedback kind="payment" />}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button autoFocus type="button" className="min-h-11 rounded-full border border-[#d2d2d7] px-5 text-sm" disabled={busy} onClick={dismiss}>{uncertain ? text("Close & check payment status", "关闭并检查付款状态") : text("Keep original payment", "保留原付款")}</button>
      <button type="button" className="btn-primary min-h-11" disabled={busy || !prompt} onClick={() => { if (prompt) void confirm(prompt); }}>{prompt?.itemId ? uncertain ? text("Check cancellation & retry removal", "核对取消结果并重试删除") : text("Cancel unpaid payment & remove", "取消未付款并删除") : uncertain ? text("Check cancellation & retry", "核对取消结果并重试") : text("Cancel unpaid payment & edit", "取消未付款并修改")}</button>
    </div>
  </dialog>;
}
