import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { exactTaxUsdCents } from "./tax-quote-money";
import { assertTaxRefundReversal, checkedRefundSale, TaxRefundConflict } from "./tax-refund-contract";
import { checkedTaxRefundReservation } from "./tax-refund-reservations";
import { checkedTaxRefundFunds, readNativeTaxRefund } from "./tax-refund-funds";
import { nativeRefundId } from "./tax-refund-funds-contract";
import { checkedTaxRefundTask } from "./tax-refund-ledger";
import { checkedRefundExecution } from "./refund-execution";
import { taxSaleFingerprint } from "./tax-sale-contract";

const recordSchema = z.object({ native_refund_id: nativeRefundId, reservation: z.unknown(), funds: z.unknown(), funds_fingerprint: z.string(),
  tax_task: z.unknown(), cash_task: z.unknown(), database_now: z.coerce.number().int().positive(),
  tax_result: z.object({ account_id: z.string(), livemode: z.boolean(), transaction_id: z.string(), snapshot: z.unknown() }),
  transactions: z.array(z.object({ currency_code: z.literal("usd"), amount: z.unknown(), raw_amount: z.object({ value: z.unknown() }) })).length(1) });
/** Aggregate defense after every component is verified; this is not a
 * substitute for proof and is never exposed as a financial command. */
export function assertRefundBalanceTotals(rawSale: unknown, rawCompleted: unknown) {
  const sale = checkedRefundSale(rawSale), completed = z.array(z.object({ native_refund_id: nativeRefundId,
    stripe_refund_id: z.string().regex(/^re_[A-Za-z0-9]+$/), operation_id: z.uuid(), total_cents: z.number().int().positive().max(99_999_999) }).strict()).max(10000).parse(rawCompleted);
  if (new Set(completed.map(row => row.native_refund_id)).size !== completed.length || new Set(completed.map(row => row.stripe_refund_id)).size !== completed.length ||
    new Set(completed.map(row => row.operation_id)).size !== completed.length || completed.reduce((sum, row) => sum + row.total_cents, 0) > sale.quote.amounts.total_cents) throw new TaxRefundConflict();
}
/** Completed prior refunds must individually match the same original sale,
 * current native records, immutable money proof, tax result and order debit. */
export function checkedCompletedRefund(rawSale: unknown, rawRecord: unknown, currentNative: unknown) {
  const sale = checkedRefundSale(rawSale), row = recordSchema.parse(rawRecord), reservation = checkedTaxRefundReservation(row.reservation);
  const funds = checkedTaxRefundFunds(reservation, row.funds);
  const tax = checkedTaxRefundTask({ ...z.record(z.string(), z.unknown()).parse(row.tax_task), reservation, funds, database_now: row.database_now });
  const cash = checkedRefundExecution({ ...z.record(z.string(), z.unknown()).parse(row.cash_task), reservation, database_now: row.database_now });
  const stored = z.object({ transaction: z.unknown(), lines: z.unknown() }).parse(row.tax_result.snapshot);
  const reversal = assertTaxRefundReversal(reservation.source_data.sale, reservation.allocation, stored.transaction, stored.lines);
  const transaction = row.transactions[0];
  const debit = (value: unknown) => {
    const decimal = z.union([z.string().regex(/^-\d+(?:\.\d+)?$/), z.number().negative().finite()]).parse(value);
    return exactTaxUsdCents(String(decimal).slice(1));
  };
  if (taxSaleFingerprint(reservation.source_data.sale) !== taxSaleFingerprint({ source: sale.source, operation_id: sale.operation_id, snapshot: sale.snapshot }) ||
    row.native_refund_id !== funds.native_refund_id || row.funds_fingerprint !== taxSaleFingerprint(funds) ||
    taxSaleFingerprint(currentNative) !== taxSaleFingerprint(funds.native) || tax.state !== "ready" || tax.remote_id !== row.tax_result.transaction_id ||
    row.tax_result.transaction_id !== reversal.transaction.id || row.tax_result.account_id !== reservation.account_id || row.tax_result.livemode !== reservation.livemode ||
    taxSaleFingerprint(row.tax_result.snapshot) !== taxSaleFingerprint(reversal) || cash.state !== "ready" || cash.remote_id !== funds.stripe_refund_id ||
    taxSaleFingerprint(cash.snapshot) !== taxSaleFingerprint(funds.refund) || debit(transaction.amount) !== funds.total_cents || debit(transaction.raw_amount.value) !== funds.total_cents) throw new TaxRefundConflict();
  return { native_refund_id: row.native_refund_id, stripe_refund_id: funds.stripe_refund_id, operation_id: reservation.id, total_cents: funds.total_cents };
}

/** Caller holds the native payment lock inside a short transaction. No remote
 * calls or monetary mutations occur here, including for legacy/manual refunds. */
export async function assertTrackedRefundBalance(db: TaxQuoteConnection, rawSale: unknown, rawNativeIds: unknown) {
  const sale = checkedRefundSale(rawSale), nativeIds = z.array(z.object({ id: nativeRefundId })).parse(rawNativeIds).map(row => row.id);
  if (new Set(nativeIds).size !== nativeIds.length) throw new TaxRefundConflict();
  const rows = (await db.raw(`select f.native_refund_id,f.snapshot as funds,f.fingerprint as funds_fingerprint,
    to_jsonb(a)||jsonb_build_object('first_attempt_at',floor(extract(epoch from a.first_attempt_at)),'cancelled_at',floor(extract(epoch from a.cancelled_at))) as reservation,
    to_jsonb(t)||jsonb_build_object('first_attempt_at',floor(extract(epoch from t.first_attempt_at)*1000),'lease_until',floor(extract(epoch from t.lease_until)*1000)) as tax_task,
    to_jsonb(e)||jsonb_build_object('first_attempt_at',floor(extract(epoch from e.first_attempt_at)*1000),'lease_until',floor(extract(epoch from e.lease_until)*1000)) as cash_task,
    to_jsonb(result) as tax_result,floor(extract(epoch from clock_timestamp())*1000)::bigint as database_now,
    coalesce((select jsonb_agg(jsonb_build_object('currency_code',ot.currency_code,'amount',ot.amount,'raw_amount',ot.raw_amount) order by ot.id)
      from commerce.order_transaction ot where ot.order_id=a.order_id and ot.reference='refund' and ot.reference_id=f.native_refund_id and ot.deleted_at is null),'[]'::jsonb) as transactions
    from commerce.snowforce_refund_funds f left join commerce.snowforce_refund_allocations a on a.id=f.allocation_id
    left join commerce.snowforce_refund_tax_tasks t on t.id=a.id left join commerce.snowforce_refund_tax_results result on result.task_id=t.id
    left join commerce.snowforce_refund_executions e on e.id=a.id where f.payment_id=? order by f.native_refund_id`, [sale.source.payment_id])).rows;
  if (rows.length !== nativeIds.length) throw new TaxRefundConflict();
  const checked = [];
  for (const raw of rows) {
    const row = recordSchema.parse(raw), reservation = checkedTaxRefundReservation(row.reservation);
    if (!nativeIds.includes(row.native_refund_id)) throw new TaxRefundConflict();
    checked.push(checkedCompletedRefund(rawSale, row, await readNativeTaxRefund(db, reservation, row.native_refund_id, true)));
  }
  assertRefundBalanceTotals(rawSale, checked);
  return checked;
}
