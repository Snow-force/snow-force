"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useLanguage } from "@/lib/language";
import type { AdminMerchantApplicationItem } from "@/lib/merchants/admin-view";
import { MerchantBoothAllocationControl } from "./merchant-booth-allocation-control";

export type MerchantFormAction = (formData: FormData) => void | Promise<void>;

type MerchantOperationActionsProps = {
  readonly record: AdminMerchantApplicationItem;
  readonly returnEvent: string;
  readonly returnStatus: string;
  readonly reviewAction: MerchantFormAction;
  readonly approveAction: MerchantFormAction;
  readonly allocateAction: MerchantFormAction;
  readonly paymentAction: MerchantFormAction;
};

function SubmitButton({ children, tone = "neutral" }: { readonly children: React.ReactNode; readonly tone?: "neutral" | "primary" | "danger" }) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "primary"
      ? "bg-snow-600 text-white hover:bg-snow-700"
      : tone === "danger"
        ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded px-2 py-1 text-xs font-medium transition disabled:cursor-wait disabled:opacity-50 ${toneClass}`}
    >
      {pending ? "…" : children}
    </button>
  );
}

function ReturnFilters({ eventSlug, status }: { readonly eventSlug: string; readonly status: string }) {
  return (
    <>
      <input type="hidden" name="returnEvent" value={eventSlug} />
      <input type="hidden" name="returnStatus" value={status} />
    </>
  );
}

function ReviewControl({
  applicationId,
  returnEvent,
  returnStatus,
  action,
}: {
  readonly applicationId: string;
  readonly returnEvent: string;
  readonly returnStatus: string;
  readonly action: MerchantFormAction;
}) {
  const { t } = useLanguage();
  const [decision, setDecision] = useState<"under_review" | "reject">("under_review");
  const [rejectionReason, setRejectionReason] = useState("");

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <ReturnFilters eventSlug={returnEvent} status={returnStatus} />
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        {t({ en: "Review decision", zh: "审核决定" })}
        <select
          name="decision"
          value={decision}
          onChange={(event) => setDecision(event.currentTarget.value === "reject" ? "reject" : "under_review")}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        >
          <option value="under_review">{t({ en: "Start review", zh: "开始审核" })}</option>
          <option value="reject">{t({ en: "Reject", zh: "拒绝" })}</option>
        </select>
      </label>
      {decision === "reject" ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t({ en: "Reason", zh: "原因" })}
          <textarea
            name="rejectionReason"
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.currentTarget.value)}
            required
            minLength={3}
            rows={2}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
          />
        </label>
      ) : null}
      <SubmitButton tone={decision === "reject" ? "danger" : "neutral"}>
        {decision === "reject" ? t({ en: "Reject application", zh: "拒绝申请" }) : t({ en: "Save review", zh: "保存审核" })}
      </SubmitButton>
    </form>
  );
}

function PaymentControl({
  applicationId,
  returnEvent,
  returnStatus,
  action,
}: {
  readonly applicationId: string;
  readonly returnEvent: string;
  readonly returnStatus: string;
  readonly action: MerchantFormAction;
}) {
  const { t } = useLanguage();
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState("");

  return (
    <form action={action} className="space-y-2 border-t border-gray-100 pt-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <ReturnFilters eventSlug={returnEvent} status={returnStatus} />
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        {t({ en: "Method", zh: "方式" })}
        <input
          name="method"
          value={method}
          onChange={(event) => setMethod(event.currentTarget.value)}
          required
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        {t({ en: "Reference", zh: "付款参考号" })}
        <input
          name="reference"
          value={reference}
          onChange={(event) => setReference(event.currentTarget.value)}
          required
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        {t({ en: "Paid at", zh: "付款时间" })}
        <input
          name="paidAt"
          type="datetime-local"
          value={paidAt}
          onChange={(event) => setPaidAt(event.currentTarget.value)}
          required
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        {t({ en: "Internal note", zh: "内部备注" })}
        <textarea
          name="note"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          rows={2}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        />
      </label>
      <SubmitButton tone="primary">{t({ en: "Confirm payment", zh: "确认付款" })}</SubmitButton>
    </form>
  );
}

export function MerchantOperationActions({
  record,
  returnEvent,
  returnStatus,
  reviewAction,
  approveAction,
  allocateAction,
  paymentAction,
}: MerchantOperationActionsProps) {
  const { t } = useLanguage();
  const { application, allocation, payment } = record;

  if (application.status === "submitted") {
    return <ReviewControl applicationId={application.id} returnEvent={returnEvent} returnStatus={returnStatus} action={reviewAction} />;
  }
  if (application.status === "under_review") {
    return (
      <div className="space-y-2">
        <form action={approveAction}>
          <input type="hidden" name="applicationId" value={application.id} />
          <ReturnFilters eventSlug={returnEvent} status={returnStatus} />
          <SubmitButton tone="primary">{t({ en: "Approve", zh: "批准" })}</SubmitButton>
        </form>
        <ReviewControl applicationId={application.id} returnEvent={returnEvent} returnStatus={returnStatus} action={reviewAction} />
      </div>
    );
  }
  if (application.status === "approved" && !allocation) {
    return (
      <div className="space-y-2">
        <MerchantBoothAllocationControl record={record} returnEvent={returnEvent} returnStatus={returnStatus} action={allocateAction} />
        <PaymentControl applicationId={application.id} returnEvent={returnEvent} returnStatus={returnStatus} action={paymentAction} />
      </div>
    );
  }
  if ((application.status === "approved" || application.status === "payment_pending") && !payment) {
    return <PaymentControl applicationId={application.id} returnEvent={returnEvent} returnStatus={returnStatus} action={paymentAction} />;
  }
  return <span className="text-xs text-gray-400">{t({ en: "No further action", zh: "无需进一步操作" })}</span>;
}
