"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { RegistrationDepositStatus, RegistrationFinance, RegistrationSettlementStatus } from "@/lib/types";

type FinanceAction = (formData: FormData) => void | Promise<void>;

const depositStatusLabels: Record<RegistrationDepositStatus, string> = {
  pending: "Unpaid",
  paid: "Deposit Paid",
  refunded: "Refunded",
  waived: "Waived",
};

const settlementStatusLabels: Record<RegistrationSettlementStatus, string> = {
  not_started: "Not settled",
  settled: "Settled",
  pending_balance: "Need extra payment",
  pending_refund: "Need refund",
};

const depositStatusClasses: Record<RegistrationDepositStatus, string> = {
  pending: "border-gray-200 bg-gray-50 text-gray-700",
  paid: "border-green-200 bg-green-50 text-green-700",
  refunded: "border-blue-200 bg-blue-50 text-blue-700",
  waived: "border-purple-200 bg-purple-50 text-purple-700",
};

const settlementStatusClasses: Record<RegistrationSettlementStatus, string> = {
  not_started: "border-gray-200 bg-gray-50 text-gray-700",
  settled: "border-green-200 bg-green-50 text-green-700",
  pending_balance: "border-orange-200 bg-orange-50 text-orange-700",
  pending_refund: "border-blue-200 bg-blue-50 text-blue-700",
};

interface RegistrationFinanceControlProps {
  action: FinanceAction;
  createdAt: string;
  finance: RegistrationFinance;
  isSaved: boolean;
  registrationId: string;
  returnEvent: string;
  refundControl?: ReactNode;
}

function SubmitButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className={[
        "rounded px-3 py-1.5 text-xs font-semibold transition",
        dirty
          ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
          : "border border-gray-200 bg-white text-gray-400",
        pending ? "cursor-wait bg-gray-500 text-white" : "",
      ].join(" ")}
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

export function RegistrationFinanceControl({ isSaved, ...props }: RegistrationFinanceControlProps) {
  const [previousIsSaved, setPreviousIsSaved] = useState(isSaved);
  const [showToast, setShowToast] = useState(isSaved);

  if (previousIsSaved !== isSaved) {
    setPreviousIsSaved(isSaved);
    setShowToast(isSaved);
  }

  useEffect(() => {
    if (!isSaved) return;
    const timeout = window.setTimeout(() => setShowToast(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [isSaved]);

  const { finance, registrationId } = props;
  const formKey = JSON.stringify([
    registrationId,
    finance.depositAmount,
    finance.depositStatus,
    finance.settlementStatus,
    finance.paymentMethod === "stripe",
  ]);

  return <RegistrationFinanceFields key={formKey} {...props} showToast={showToast} />;
}

function RegistrationFinanceFields({
  action,
  createdAt,
  finance,
  registrationId,
  returnEvent,
  refundControl,
  showToast,
}: Omit<RegistrationFinanceControlProps, "isSaved"> & { showToast: boolean }) {
  const initialDepositAmount = finance.depositAmount === null ? "" : String(finance.depositAmount);
  const [depositAmount, setDepositAmount] = useState(initialDepositAmount);
  const [depositStatus, setDepositStatus] = useState<RegistrationDepositStatus>(finance.depositStatus);
  const [settlementStatus, setSettlementStatus] = useState<RegistrationSettlementStatus>(finance.settlementStatus);
  const formId = `finance-${registrationId}`;
  const paidViaStripe = finance.paymentMethod === "stripe";
  const isStripeManaged = paidViaStripe;

  const dirty =
    depositAmount !== initialDepositAmount ||
    depositStatus !== finance.depositStatus ||
    settlementStatus !== finance.settlementStatus;

  return (
    <Fragment>
      <td className="px-4 py-3">
        <label
          className={[
            "flex w-24 items-center rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100",
            isStripeManaged ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <span className="text-gray-400">$</span>
          <input
            form={formId}
            name="depositAmount"
            value={depositAmount}
            onChange={(event) => setDepositAmount(event.target.value)}
            inputMode="decimal"
            aria-label="Deposit amount"
            readOnly={isStripeManaged}
            className="ml-1 w-full bg-transparent text-gray-900 outline-none"
          />
        </label>
      </td>
      <td className="px-4 py-3">
        <select
          form={formId}
          name="depositStatus"
          value={depositStatus}
          onChange={(event) => setDepositStatus(event.target.value as RegistrationDepositStatus)}
          aria-label="Deposit status"
          disabled={isStripeManaged}
          className={`rounded-full border px-3 py-1 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-blue-100 ${depositStatusClasses[depositStatus]} ${isStripeManaged ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <option value="pending">{depositStatusLabels.pending}</option>
          <option value="paid">{depositStatusLabels.paid}</option>
          <option value="refunded">{depositStatusLabels.refunded}</option>
          <option value="waived">{depositStatusLabels.waived}</option>
        </select>
        {isStripeManaged ? (
          <p className="text-xs text-gray-500 mt-1">
            Stripe-managed payment — use Refund &amp; cancel below instead of editing this status.
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <select
          form={formId}
          name="settlementStatus"
          value={settlementStatus}
          onChange={(event) => setSettlementStatus(event.target.value as RegistrationSettlementStatus)}
          aria-label="Settlement status"
          className={`rounded-full border px-3 py-1 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-blue-100 ${settlementStatusClasses[settlementStatus]}`}
        >
          <option value="not_started">{settlementStatusLabels.not_started}</option>
          <option value="settled">{settlementStatusLabels.settled}</option>
          <option value="pending_balance">{settlementStatusLabels.pending_balance}</option>
          <option value="pending_refund">{settlementStatusLabels.pending_refund}</option>
        </select>
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">{new Date(createdAt).toLocaleDateString()}</td>
      <td className="py-3 pl-4">
        <form id={formId} action={action} className="flex justify-end">
          <input type="hidden" name="id" value={registrationId} />
          <input type="hidden" name="returnEvent" value={returnEvent} />
          <SubmitButton dirty={dirty} />
        </form>
        {showToast ? (
          <div className="fixed bottom-6 right-6 z-50 rounded border border-green-200 bg-white px-4 py-2 text-sm font-medium text-green-700 shadow-lg">
            Finance updated
          </div>
        ) : null}
        {refundControl}
      </td>
    </Fragment>
  );
}
