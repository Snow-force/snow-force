import type { Registration, RegistrationRefund } from "@/lib/types";
export type CancellationRequest = {
  id: string;
  registration_id: string;
  requested_by: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  decision_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  refund_amount: number;
  refund_operation_id: string | null;
  created_at: string;
  updated_at: string;
};
export type CancellationCase = {
  registrationId: string;
  name: string;
  eventSlug: string;
  registrationStatus: Registration["status"];
  paidAmount: number;
  refundedAmount: number;
  currency: string;
  canRequest: boolean;
  request: CancellationRequest | null;
  refundStatus: string;
  externalRefund: boolean;
};
export function cancellationRefundStatus(
  request: CancellationRequest | null,
  refunds: RegistrationRefund[],
  refundedAmount: number,
  paidAmount: number,
) {
  const operation = request?.refund_operation_id
    ? refunds.find((r) => r.id === request.refund_operation_id)
    : undefined;
  const latest =
    operation ??
    [...refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (
    latest &&
    ["creating", "pending", "requires_action", "failed", "canceled"].includes(
      latest.status,
    )
  )
    return latest.status;
  if (latest?.status === "succeeded" && refundedAmount < latest.amount)
    return "reconciliation_required";
  if (
    request &&
    request.status === "approved" &&
    Number(request.refund_amount) > 0 &&
    !operation
  )
    return "awaiting_execution";
  if (refundedAmount > 0)
    return refundedAmount >= paidAmount
      ? "fully_refunded"
      : "partially_refunded";
  if (request?.status === "approved") return "no_refund";
  return "none";
}
export const cancellationLabels: Record<string, { en: string; zh: string }> = {
  pending: { en: "Cancel requested — awaiting approval", zh: "取消申请待审核" },
  approved: { en: "Cancellation approved", zh: "取消已批准" },
  rejected: { en: "Cancellation rejected", zh: "取消申请已拒绝" },
  withdrawn: { en: "Request withdrawn", zh: "申请已撤回" },
  reconciliation_required: {
    en: "Refund confirmed; totals need reconciliation",
    zh: "退款已确认，金额待同步核对",
  },
  none: { en: "No refund", zh: "未退款" },
  no_refund: { en: "Approved without refund", zh: "批准取消，不退款" },
  awaiting_execution: {
    en: "Refund approved — not yet submitted",
    zh: "退款已批准，待执行",
  },
  creating: {
    en: "Refund outcome awaiting verification",
    zh: "退款结果待核对",
  },
  requires_action: { en: "Refund needs attention", zh: "退款需要处理" },
  failed: {
    en: "Refund failed — staff action needed",
    zh: "退款失败，需人工处理",
  },
  canceled: {
    en: "Refund cancelled — staff action needed",
    zh: "退款已终止，需人工处理",
  },
  fully_refunded: { en: "Fully refunded", zh: "已全额退款" },
  partially_refunded: { en: "Partially refunded", zh: "已部分退款" },
};
export function refundLabel(status: string) {
  return status === "pending"
    ? { en: "Refund processing", zh: "退款处理中" }
    : (cancellationLabels[status] ?? { en: status, zh: status });
}
