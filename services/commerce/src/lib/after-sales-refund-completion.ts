import { MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import type { AfterSalesRow } from "./after-sales-policy";
import type { RefundFundsCheck } from "./refund-finality";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { checkedRefundSale, TaxRefundConflict } from "./tax-refund-contract";
import { refundReservationFields } from "./tax-refund-funds";
import { checkedTaxRefundReservation } from "./tax-refund-reservations";
import { taxSaleFingerprint } from "./tax-sale-contract";
import { assertTrackedRefundBalance } from "./tracked-refund-balance";

const conflict = () => new MedusaError(MedusaError.Types.CONFLICT,
  "Complete the request only after its received quantities, individual refunds, native bookkeeping and tax reversals are reconciled.");

/** Caller holds order, case and native payment locks after saving a fresh Stripe
 * check. This verifies existing evidence only; it cannot move money or post tax. */
export async function assertAfterSalesRefundCompletion(db: TaxQuoteConnection, row: AfterSalesRow,
  nativeReturnId: string, check: RefundFundsCheck) {
  try { await verifyCompletion(db, row, nativeReturnId, check); }
  catch (error) {
    if (error instanceof TaxRefundConflict || error instanceof z.ZodError) throw conflict();
    throw error;
  }
}

async function verifyCompletion(db: TaxQuoteConnection, row: AfterSalesRow, nativeReturnId: string, check: RefundFundsCheck) {
  z.string().regex(/^return_[A-Za-z0-9]+$/).parse(nativeReturnId);
  if (row.status !== "processing" || row.order_id !== check.order_id || check.state !== "verified" ||
    !row.native_id || (row.kind === "return" && row.native_id !== nativeReturnId)) throw conflict();
  const history = (await db.raw(`select ${refundReservationFields} from commerce.snowforce_refund_allocations
    where order_id=? order by sequence`, [row.order_id])).rows.map(checkedTaxRefundReservation);
  const active = history.filter(plan => plan.state !== "cancelled"), scoped = active.filter(plan => plan.case_id === row.id);
  if (!active.length) {
    // An equal-value exchange can close without a cash refund. Returns always
    // require allocation evidence; legacy/manual money needs reconciliation.
    if (row.kind !== "exchange" || check.payments.some(payment => payment.native_refunds.length || payment.refunds.length) ||
      (await db.raw("select f.allocation_id from commerce.snowforce_refund_funds f join commerce.snowforce_refund_allocations a on a.id=f.allocation_id where a.order_id=?", [row.order_id])).rows.length) throw conflict();
    return;
  }
  const rawSale = active[0].source_data.sale, sale = checkedRefundSale(rawSale);
  const payment = check.payments.find(value => value.payment_id === sale.source.payment_id);
  if (!payment || check.payments.length !== 1 || payment.intent_id !== sale.source.intent_id ||
    payment.livemode !== sale.source.input.livemode || payment.captured_cents !== sale.quote.amounts.total_cents ||
    active.some(plan => plan.state !== "started" || taxSaleFingerprint(plan.source_data.sale) !== taxSaleFingerprint(rawSale))) throw conflict();
  const completed = await assertTrackedRefundBalance(db, rawSale, payment.native_refunds);
  if (completed.length !== active.length || active.some(plan => !completed.some(proof => proof.operation_id === plan.id))) throw conflict();
  // Equal aggregate amounts are insufficient: bind every current native debit
  // and every fresh Stripe result to the already-validated individual proof.
  if (payment.refunds.length !== completed.length || completed.some(proof =>
    !payment.native_refunds.some(value => value.id === proof.native_refund_id && value.amount_cents === proof.total_cents) ||
    !payment.refunds.some(value => value.id === proof.stripe_refund_id && value.status === "succeeded" && value.amount_cents === proof.total_cents))) throw conflict();
  if (new Set(row.items.map(line => line.id)).size !== row.items.length || scoped.some(plan =>
    plan.native_return_id !== nativeReturnId || plan.case_version > row.version ||
    plan.allocation.lines.some(line => !row.items.some(approved => approved.id === line.item_id)))) throw conflict();
  for (const approved of row.items) {
    const quantity = scoped.flatMap(plan => plan.allocation.lines).filter(line => line.item_id === approved.id)
      .reduce((total, line) => total + line.quantity, 0);
    if (!Number.isSafeInteger(quantity) || quantity > approved.quantity || (row.kind === "return" && quantity !== approved.quantity)) throw conflict();
  }
}
