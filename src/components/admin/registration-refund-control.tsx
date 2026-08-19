"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentCurrency, RegistrationFinance, RegistrationRefund } from "@/lib/types";

type PaymentPreview = {
  paymentIntentId: string;
  checkoutSessionId: string;
  amount: number;
  refundedAmount: number;
  refundableAmount: number;
  currency: PaymentCurrency;
  customerEmail: string;
  createdAt: string;
};

type VerifyAction = (formData: FormData) => Promise<
  { success: true; preview: PaymentPreview } | { success: false; error: string }
>;
type LinkAction = VerifyAction;
type RefundAction = (formData: FormData) => Promise<
  | { success: true; warning?: string }
  | { success: false; error: string; requiresReview?: boolean }
>;

function amountLabel(amount: number, currency: string) {
  return `${currency.toUpperCase()} ${amount.toFixed(currency === "jpy" ? 0 : 2)}`;
}

export function RegistrationRefundControl({
  canRefund,
  finance,
  linkAction,
  refunds,
  refundAction,
  registrationId,
  verifyAction,
}: {
  canRefund: boolean;
  finance: RegistrationFinance;
  linkAction: LinkAction;
  refunds: RegistrationRefund[];
  refundAction: RefundAction;
  registrationId: string;
  verifyAction: VerifyAction;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"link" | "refund" | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<"requested_by_customer" | "duplicate">("requested_by_customer");
  const [message, setMessage] = useState("");
  const remaining = Math.max(0, (finance.depositAmount ?? 0) - finance.refundedAmount);
  const defaultRefund =
    finance.settlementAmount !== null && finance.settlementAmount < 0
      ? Math.min(Math.abs(finance.settlementAmount), remaining)
      : remaining;
  const [refundAmount, setRefundAmount] = useState(String(defaultRefund));
  const [operationId, setOperationId] = useState("");
  const dialogTitleId = `registration-refund-title-${registrationId}`;
  const hasInFlightRefund = refunds.some((refund) =>
    ["creating", "pending", "requires_action"].includes(refund.status),
  );
  const canLink = finance.paymentMethod === "stripe" && !finance.stripePaymentIntentId;
  const canIssueRefund = finance.paymentMethod === "stripe" && Boolean(finance.stripePaymentIntentId) && remaining > 0;
  const sortedRefunds = useMemo(
    () => [...refunds].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [refunds],
  );

  function close() {
    setMode(null);
    setPreview(null);
    setConfirmation("");
    setMessage("");
  }

  function openRefund() {
    setRefundAmount(String(defaultRefund));
    setOperationId(crypto.randomUUID());
    setMode("refund");
    setMessage("");
  }

  function verifyPayment() {
    setMessage("");
    const formData = new FormData();
    formData.set("registrationId", registrationId);
    formData.set("paymentIntentId", paymentIntentId);
    startTransition(async () => {
      const result = await verifyAction(formData);
      if (result.success) setPreview(result.preview);
      else setMessage(result.error);
    });
  }

  function linkPayment() {
    if (!preview) return;
    const formData = new FormData();
    formData.set("registrationId", registrationId);
    formData.set("paymentIntentId", preview.paymentIntentId);
    formData.set("confirmation", confirmation);
    startTransition(async () => {
      const result = await linkAction(formData);
      if (!result.success) return setMessage(result.error);
      close();
      router.refresh();
    });
  }

  function issueRefund() {
    const formData = new FormData();
    formData.set("registrationId", registrationId);
    formData.set("operationId", operationId);
    formData.set("amount", refundAmount);
    formData.set("reason", reason);
    formData.set("internalNote", note);
    formData.set("confirmation", confirmation);
    startTransition(async () => {
      const result = await refundAction(formData);
      if (!result.success) return setMessage(result.error);
      setMessage(result.warning ?? "Refund created and registration cancelled.");
      router.refresh();
      if (!result.warning) close();
    });
  }

  return (
    <div className="mt-2 min-w-44 text-left">
      {sortedRefunds.length > 0 ? (
        <div className="mb-2 space-y-1 text-[11px] text-gray-600">
          {sortedRefunds.map((refund) => (
            <p key={refund.id}>
              {amountLabel(refund.amount, refund.currency)} · {refund.status}
              {refund.failureReason ? ` · ${refund.failureReason}` : ""}
            </p>
          ))}
        </div>
      ) : null}
      {canRefund && canLink ? (
        <button type="button" onClick={() => setMode("link")} className="text-xs font-semibold text-blue-700 hover:underline">
          Link Stripe payment
        </button>
      ) : null}
      {canRefund && canIssueRefund ? (
        <button
          type="button"
          onClick={openRefund}
          disabled={hasInFlightRefund}
          className="block text-xs font-semibold text-red-700 hover:underline disabled:text-gray-400"
        >
          {hasInFlightRefund ? "Refund processing" : "Refund & cancel"}
        </button>
      ) : null}
      {!canRefund && (canLink || canIssueRefund) ? (
        <p className="text-[11px] text-gray-400">Admin required for refunds</p>
      ) : null}

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <div
            aria-labelledby={dialogTitleId}
            aria-modal="true"
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
            onKeyDown={(event) => { if (event.key === "Escape") close(); }}
            role="dialog"
          >
            <h3 id={dialogTitleId} className="text-lg font-semibold text-gray-900">
              {mode === "link" ? "Link historical Stripe payment" : "Refund and cancel registration"}
            </h3>
            {mode === "link" ? (
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  PaymentIntent ID
                  <input autoFocus value={paymentIntentId} onChange={(event) => { setPaymentIntentId(event.target.value); setPreview(null); }} placeholder="pi_..." className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm" />
                </label>
                {!preview ? (
                  <button type="button" onClick={verifyPayment} disabled={isPending} className="btn-primary px-4 py-2 text-sm">
                    {isPending ? "Verifying..." : "Verify payment"}
                  </button>
                ) : (
                  <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                    <p>{amountLabel(preview.amount, preview.currency)} paid</p>
                    <p>{preview.customerEmail}</p>
                    <p>{new Date(preview.createdAt).toLocaleString()}</p>
                    <p>{amountLabel(preview.refundableAmount, preview.currency)} remains refundable</p>
                    <label className="mt-3 block font-medium">
                      Type LINK to confirm
                      <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded border border-blue-300 bg-white px-3 py-2" />
                    </label>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  This refund will also cancel the registration and release its event capacity. Cancellation is not automatically reversed if the refund later fails.
                </p>
                <p className="text-sm text-gray-600">
                  Remaining refundable: {amountLabel(remaining, finance.paymentCurrency || "usd")}
                </p>
                <label className="block text-sm font-medium text-gray-700">
                  Refund amount
                  <input autoFocus type="number" min="0" max={remaining} step={finance.paymentCurrency === "jpy" ? "1" : "0.01"} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Reason
                  <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2">
                    <option value="requested_by_customer">Customer request</option>
                    <option value="duplicate">Duplicate payment</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Internal note
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} required className="mt-1 min-h-20 w-full rounded border border-gray-300 px-3 py-2" />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Type REFUND to confirm
                  <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                </label>
              </div>
            )}
            {message ? <p className="mt-3 text-sm font-medium text-red-700" role="alert">{message}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={close} className="rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700">Close</button>
              {mode === "link" && preview ? (
                <button type="button" onClick={linkPayment} disabled={isPending || confirmation !== "LINK"} className="btn-primary px-4 py-2 text-sm disabled:bg-gray-300">Link payment</button>
              ) : null}
              {mode === "refund" ? (
                <button type="button" onClick={issueRefund} disabled={isPending || confirmation !== "REFUND" || !note.trim()} className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300">
                  {isPending ? "Refunding..." : "Refund & cancel"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
