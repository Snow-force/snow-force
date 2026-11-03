"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reviewCancellationAction,
  executeCancellationRefundAction,
} from "@/lib/registrations/cancellation-actions";
import {
  cancellationLabels,
  refundLabel,
  type CancellationCase,
} from "@/lib/registrations/cancellation-types";
export function CancellationReviewPanel({
  cases,
  canReview,
}: {
  cases: CancellationCase[];
  canReview: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState("");
  const relevant = cases.filter(
    (c) =>
      c.request ||
      c.externalRefund ||
      (c.registrationStatus === "cancelled" && c.paidAmount > c.refundedAmount),
  );
  function run(
    action: () => Promise<{
      success: boolean;
      error?: string;
      warning?: string;
    }>,
  ) {
    start(async () => {
      try {
        const result = await action();
        setMessage(
          result.success
            ? result.warning || "Saved / 已保存"
            : result.error ||
                "Not completed. Refresh and check payment before retrying. / 未完成，请刷新核对后重试。",
        );
        router.refresh();
      } catch {
        setMessage(
          "Could not complete. Refresh before retrying. / 未完成，请刷新后重试。",
        );
      }
    });
  }
  return (
    <section id="cancellations" className="my-6 space-y-4 rounded border p-4">
      <h3 className="text-lg font-semibold">
        Cancellation requests / 取消申请 (
        {relevant.filter((c) => c.request?.status === "pending").length}{" "}
        pending)
      </h3>
      <p className="text-sm text-gray-600">
        Pending requests retain capacity. Approval cancels the place; approved
        refunds require a separate explicit execution. Settlement does not
        indicate refund success. /
        待审核保留名额；批准后取消，退款须单独执行。结算状态不代表退款成功。
      </p>
      {!relevant.length && <p className="text-sm">No requests / 暂无申请</p>}
      {relevant.map((c) => (
        <article
          key={c.registrationId}
          className="space-y-2 rounded border p-3 text-sm"
        >
          <h4 className="font-semibold">
            {c.name} · {c.eventSlug}
          </h4>
          <p>
            Registration / 报名: {c.registrationStatus} ·{" "}
            {c.request
              ? `${cancellationLabels[c.request.status].en} / ${cancellationLabels[c.request.status].zh}`
              : c.registrationStatus === "cancelled"
                ? "Historical cancellation / 历史取消"
                : "No cancellation approval / 无取消审批"}
          </p>
          <p>
            Paid / 已付: {c.paidAmount.toFixed(2)} {c.currency.toUpperCase()} ·
            Refunded / 已退: {c.refundedAmount.toFixed(2)} ·{" "}
            {refundLabel(c.refundStatus).en} / {refundLabel(c.refundStatus).zh}
          </p>
          {c.externalRefund && (
            <p className="text-amber-800">
              External Stripe refund — verify source and cancellation decision /
              Stripe 外部退款，请核对来源及取消审批
            </p>
          )}
          {c.request && (
            <>
              <p className="whitespace-pre-wrap">
                Reason / 原因: {c.request.reason}
              </p>
              <p>
                Requested / 申请: {c.request.created_at} · Reviewed / 审核:{" "}
                {c.request.reviewed_at ?? "—"}
              </p>
              {c.request.decision_note && (
                <p className="whitespace-pre-wrap">
                  Decision / 意见: {c.request.decision_note}
                </p>
              )}
              {c.request.status === "pending" && canReview && (
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(() => reviewCancellationAction(f));
                  }}
                >
                  <input type="hidden" name="requestId" value={c.request.id} />
                  <input type="hidden" name="confirmation" value="REVIEW" />
                  <label>
                    Decision / 决定
                    <select
                      required
                      name="decision"
                      className="block w-full rounded border p-2"
                    >
                      <option value="">Select / 请选择</option>
                      <option value="approve">
                        Approve cancellation / 批准取消
                      </option>
                      <option value="reject">Reject request / 拒绝申请</option>
                    </select>
                  </label>
                  <label>
                    Refund amount / 批准退款金额 ({c.currency.toUpperCase()})
                    <input
                      required
                      name="refundAmount"
                      type="number"
                      min="0"
                      max={Math.max(0, c.paidAmount - c.refundedAmount)}
                      step="0.01"
                      defaultValue="0"
                      className="block w-full rounded border p-2"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    Decision note / 审核原因（拒绝、不退款均须说明）
                    <textarea
                      required
                      name="note"
                      minLength={3}
                      maxLength={2000}
                      className="block w-full rounded border p-2"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <input type="checkbox" required /> I checked the
                    participant, payment and refund amount. Approval releases
                    the place. / 已核对参加者、付款与退款金额，批准后释放名额。
                  </label>
                  <button disabled={busy} className="btn-primary">
                    Confirm decision / 确认审核
                  </button>
                </form>
              )}
              {c.request.status === "approved" &&
                Number(c.request.refund_amount) > 0 && (
                  <p>
                    Approved refund / 批准退款:{" "}
                    {Number(c.request.refund_amount).toFixed(2)}{" "}
                    {c.currency.toUpperCase()} · Operation:{" "}
                    {c.request.refund_operation_id}
                  </p>
                )}
              {c.request.status === "approved" &&
                Number(c.request.refund_amount) > 0 &&
                canReview &&
                ["awaiting_execution", "creating"].includes(c.refundStatus) && (
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      run(() => executeCancellationRefundAction(f));
                    }}
                  >
                    <input
                      type="hidden"
                      name="requestId"
                      value={c.request.id}
                    />
                    <label>
                      Type REFUND / 输入 REFUND
                      <input
                        required
                        pattern="REFUND"
                        name="confirmation"
                        className="block rounded border p-2"
                      />
                    </label>
                    <button disabled={busy} className="btn-primary">
                      Refund {Number(c.request.refund_amount).toFixed(2)}{" "}
                      {c.currency.toUpperCase()} to {c.name} / 执行退款
                    </button>
                  </form>
                )}
              {["failed", "canceled", "requires_action"].includes(
                c.refundStatus,
              ) && (
                <p className="font-semibold text-red-700">
                  Refund needs manual review in Stripe before another attempt. /
                  退款需先在 Stripe 核对，禁止盲目重复退款。
                </p>
              )}
            </>
          )}
          {!canReview && c.request?.status === "pending" && (
            <p>Admin approval required / 需要 admin 审批</p>
          )}
        </article>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
