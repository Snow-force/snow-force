import type { Registration, RegistrationFinance, RegistrationSettlementStatus } from "@/lib/types";

export type RegistrationFinanceInput = Partial<{
  depositAmount: number | null;
  depositStatus: RegistrationFinance["depositStatus"];
  depositPaidAt: string;
  paymentMethod: string;
  paymentCurrency: RegistrationFinance["paymentCurrency"];
  paymentNote: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string;
  refundedAmount: number;
  lodgingAssignment: string;
  finalAmount: number | null;
  settlementStatus: RegistrationSettlementStatus;
  settlementNote: string;
  couponCode: string;
  discountAmount: number;
}>;

export const defaultRegistrationFinance: RegistrationFinance = {
  depositAmount: null,
  depositStatus: "pending",
  depositPaidAt: "",
  paymentMethod: "",
  paymentCurrency: "",
  paymentNote: "",
  stripeCheckoutSessionId: "",
  stripePaymentIntentId: "",
  refundedAmount: 0,
  lodgingAssignment: "",
  finalAmount: null,
  settlementAmount: null,
  settlementStatus: "not_started",
  settlementNote: "",
};

export function calculateSettlementAmount(
  depositAmount: number | null,
  finalAmount: number | null,
  refundedAmount = 0,
) {
  if (depositAmount === null || finalAmount === null) return null;
  return finalAmount - (depositAmount - refundedAmount);
}

export function settlementStatusForAmount(
  amount: number | null,
  requestedStatus?: RegistrationSettlementStatus,
): RegistrationSettlementStatus {
  if (requestedStatus === "settled") return "settled";
  if (amount === null) return requestedStatus ?? "not_started";
  if (amount > 0) return "pending_balance";
  if (amount < 0) return "pending_refund";
  return "settled";
}

export function normalizeRegistrationFinance(
  finance: Registration["finance"] | undefined,
): RegistrationFinance {
  const merged = { ...defaultRegistrationFinance, ...finance };
  const settlementAmount = calculateSettlementAmount(
    merged.depositAmount,
    merged.finalAmount,
    merged.refundedAmount,
  );
  return {
    ...merged,
    settlementAmount,
    settlementStatus: merged.settlementStatus,
  };
}

export function applyRegistrationFinanceInput(
  current: Registration["finance"] | undefined,
  input: RegistrationFinanceInput,
): RegistrationFinance {
  const next = {
    ...normalizeRegistrationFinance(current),
    ...input,
  };
  const settlementAmount = calculateSettlementAmount(
    next.depositAmount,
    next.finalAmount,
    next.refundedAmount,
  );
  return {
    ...next,
    settlementAmount,
    settlementStatus: input.settlementStatus ?? settlementStatusForAmount(settlementAmount, next.settlementStatus),
  };
}
