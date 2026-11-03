"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import {
  requestCancellationAction,
  withdrawCancellationAction,
} from "@/lib/registrations/cancellation-actions";
import {
  cancellationLabels,
  refundLabel,
  type CancellationCase,
} from "@/lib/registrations/cancellation-types";
export function CancellationPanel({ cases }: { cases: CancellationCase[] }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [busy, start] = useTransition();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  function run(action: () => Promise<{ success: boolean }>) {
    start(async () => {
      try {
        const result = await action();
        setMessage(
          t(
            result.success
              ? {
                  en: "Saved. Check the updated status below.",
                  zh: "已保存，请查看最新状态。",
                }
              : {
                  en: "Could not save. Refresh or contact staff.",
                  zh: "未能保存，请刷新或联系工作人员。",
                },
          ),
        );
        if (result.success) {
          setSelected(null);
          triggerRef.current?.focus();
          router.refresh();
        }
      } catch {
        setMessage(
          t({
            en: "Could not save. Please retry safely.",
            zh: "未能保存，请重试。",
          }),
        );
      }
    });
  }
  if (!cases.length) return null;
  return (
    <section
      id="cancellations"
      className="space-y-4 rounded-2xl border bg-white p-6"
    >
      <h2 className="text-xl font-semibold">
        {t({ en: "Cancellation requests and refunds", zh: "取消申请与退款" })}
      </h2>
      <p className="text-sm text-gray-600">
        {t({
          en: "Requests need admin approval. Your place stays reserved until approval. Refunds are confirmed separately.",
          zh: "取消申请须管理员批准，批准前仍保留名额。退款结果单独确认。",
        })}
      </p>
      {cases.map((c) => (
        <article
          key={c.registrationId}
          className="space-y-2 rounded-lg border p-4"
        >
          <h3 className="font-semibold">
            {c.name} · {c.eventSlug}
          </h3>
          <p>
            {t({ en: "Registration", zh: "报名" })}:{" "}
            {t(
              c.registrationStatus === "cancelled"
                ? { en: "Cancelled", zh: "已取消" }
                : c.registrationStatus === "waitlist"
                  ? { en: "Waitlist", zh: "候补中" }
                  : { en: "Confirmed", zh: "有效" },
            )}
          </p>
          {c.request && (
            <>
              <p className="font-medium">
                {t(cancellationLabels[c.request.status])}
              </p>
              <p className="whitespace-pre-wrap text-sm">{c.request.reason}</p>
              {c.request.decision_note && (
                <p className="whitespace-pre-wrap text-sm">
                  {t({ en: "Decision", zh: "审核意见" })}:{" "}
                  {c.request.decision_note}
                </p>
              )}
            </>
          )}
          <p className="text-sm">
            {t({ en: "Paid", zh: "已付" })}: {c.paidAmount.toFixed(2)}{" "}
            {c.currency.toUpperCase()} · {t({ en: "Refunded", zh: "已退" })}:{" "}
            {c.refundedAmount.toFixed(2)} · {t(refundLabel(c.refundStatus))}
          </p>
          {c.request?.status === "approved" && (
            <p className="text-sm">
              {t({ en: "Approved refund", zh: "批准退款" })}:{" "}
              {Number(c.request.refund_amount).toFixed(2)}{" "}
              {c.currency.toUpperCase()}
            </p>
          )}
          {c.registrationStatus === "cancelled" &&
            !c.request &&
            c.refundedAmount < c.paidAmount && (
              <p className="text-sm text-amber-800">
                {t({
                  en: "Historical cancellation: contact staff to resolve the remaining payment.",
                  zh: "历史已取消记录：剩余款项需联系工作人员处理。",
                })}
              </p>
            )}
          {c.request?.status === "pending" ? (
            <button
              disabled={busy}
              className="btn-secondary"
              onClick={() =>
                run(() => withdrawCancellationAction(c.request!.id))
              }
            >
              {t({ en: "Withdraw request", zh: "撤回申请" })}
            </button>
          ) : (
            c.canRequest && (
              <button
                disabled={busy}
                className="text-sm font-semibold text-red-700 underline"
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setSelected(c.registrationId);
                }}
              >
                {t({ en: "Request cancellation", zh: "申请取消报名" })}
              </button>
            )
          )}
          {selected === c.registrationId && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t({
                en: "Confirm cancellation request",
                zh: "确认取消申请",
              })}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            >
              <form
                className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(() => requestCancellationAction(f));
                }}
              >
                <h3 className="text-lg font-semibold">
                  {t({ en: "Request cancellation", zh: "申请取消报名" })}:{" "}
                  {c.name}
                </h3>
                <p className="text-sm">
                  {c.eventSlug} · {t({ en: "Paid", zh: "已付" })}{" "}
                  {c.paidAmount.toFixed(2)} {c.currency.toUpperCase()}
                </p>
                <p className="text-sm">
                  {t({
                    en: "Submitting does not cancel your place or automatically refund payment. An admin will review the request and refund amount.",
                    zh: "提交不代表取消成功，也不会自动退款。管理员将审核申请及退款金额。",
                  })}
                </p>
                <input
                  type="hidden"
                  name="registrationId"
                  value={c.registrationId}
                />
                <input type="hidden" name="confirmation" value="REQUEST" />
                <label className="block text-sm">
                  {t({ en: "Reason", zh: "取消原因" })}
                  <textarea
                    autoFocus
                    required
                    minLength={3}
                    maxLength={2000}
                    name="reason"
                    className="mt-1 w-full rounded border p-2"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button disabled={busy} className="btn-primary" type="submit">
                    {t({ en: "Submit for approval", zh: "确认提交审核" })}
                  </button>
                  <button
                    disabled={busy}
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      triggerRef.current?.focus();
                    }}
                  >
                    {t({ en: "Keep registration", zh: "保留报名" })}
                  </button>
                </div>
              </form>
            </div>
          )}
        </article>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
