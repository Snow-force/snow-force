import type { RegistrationFinance } from "@/lib/types";
import type { RegistrationFinanceInput } from "./finance";

export function manualFinanceUpdate(finance: RegistrationFinance, form: FormData): RegistrationFinanceInput {
  const settlement = String(form.get("settlementStatus") ?? finance.settlementStatus);
  const update: RegistrationFinanceInput = {};
  if (settlement === "not_started" || settlement === "pending_balance" || settlement === "pending_refund" || settlement === "settled") {
    update.settlementStatus = settlement;
  }
  // Re-read ownership of payment fields on the server; disabled HTML fields aren't submitted.
  if (finance.paymentMethod === "stripe") return update;
  if (form.has("depositAmount")) {
    const raw = String(form.get("depositAmount") ?? "").trim();
    const amount = Number(raw);
    if (!raw) update.depositAmount = null;
    else if (Number.isFinite(amount) && amount >= 0) update.depositAmount = amount;
  }
  const status = form.get("depositStatus");
  if (status === "pending" || status === "paid" || status === "refunded" || status === "waived") update.depositStatus = status;
  return update;
}
