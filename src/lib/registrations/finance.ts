import type { Registration, RegistrationFinance, RegistrationSettlementStatus } from "@/lib/types";

export type RegistrationFinanceInput = Partial<{
  depositAmount: number | null;
  depositStatus: RegistrationFinance["depositStatus"];
  depositPaidAt: string;
  paymentMethod: string;
  paymentNote: string;
  lodgingAssignment: string;
  finalAmount: number | null;
  settlementStatus: RegistrationSettlementStatus;
  settlementNote: string;
}>;

export const defaultRegistrationFinance: RegistrationFinance = {
  depositAmount: null,
  depositStatus: "pending",
  depositPaidAt: "",
  paymentMethod: "",
  paymentNote: "",
  lodgingAssignment: "",
  finalAmount: null,
  settlementAmount: null,
  settlementStatus: "not_started",
  settlementNote: "",
};

export function calculateSettlementAmount(depositAmount: number | null, finalAmount: number | null) {
  if (depositAmount === null || finalAmount === null) return null;
  return finalAmount - depositAmount;
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
  const settlementAmount = calculateSettlementAmount(merged.depositAmount, merged.finalAmount);
  return {
    ...merged,
    settlementAmount,
    settlementStatus: settlementStatusForAmount(settlementAmount, merged.settlementStatus),
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
  const settlementAmount = calculateSettlementAmount(next.depositAmount, next.finalAmount);
  return {
    ...next,
    settlementAmount,
    settlementStatus: settlementStatusForAmount(settlementAmount, input.settlementStatus ?? next.settlementStatus),
  };
}
