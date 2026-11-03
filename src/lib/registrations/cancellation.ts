import { normalizeRegistrationFinance } from "./finance";
import type { Registration } from "@/lib/types";

export function hasUnrefundedPayment(registration: Pick<Registration, "finance">) {
  const finance = normalizeRegistrationFinance(registration.finance);
  return finance.depositStatus === "paid" &&
    (finance.depositAmount === null || finance.depositAmount > finance.refundedAmount);
}
