import type { MedusaContainer, RefundPaymentInput, RefundPaymentOutput } from "@medusajs/framework/types";
import { BigNumber, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { exactTaxUsdCents } from "./tax-quote-money";
import { inspectTaxRefundFunds, type TaxRefundFundsReader } from "./tax-refund-funds";
import { nativeRefundId } from "./tax-refund-funds-contract";
import { cashRefundRequest } from "./refund-execution";
import { readRefundReservation } from "./tax-refund-funds";
import { taxSaleFingerprint } from "./tax-sale-contract";
import { TaxRefundConflict } from "./tax-refund-contract";
import { requireConfiguredRefundAdapter } from "./refund-runtime";

const association = z.object({ operation_id: z.uuid(), claim_token: z.uuid(), remote_id: z.string().regex(/^re_[A-Za-z0-9]+$/), request: z.unknown(), request_fingerprint: z.string() });
async function readAssociation(db: TaxQuoteConnection, id: string) {
  return z.array(association).length(1).parse((await db.raw(`select e.id as operation_id,e.claim_token,e.remote_id,e.request,e.request_fingerprint
    from commerce.refund r join commerce.snowforce_refund_allocations a on a.id::text=r.metadata->'snowforce_refund'->>'operation_id'
    join commerce.snowforce_refund_executions e on e.id=a.id
    where r.id=? and r.payment_id=a.payment_id and r.created_by=a.staff_id and r.deleted_at is null and a.state='started'
      and r.metadata->'snowforce_refund'->>'allocation_fingerprint'=a.allocation_fingerprint
      and r.metadata->'snowforce_refund'->>'claim_token'=e.claim_token::text
      and e.state='running' and e.lease_until>clock_timestamp()+interval '60 seconds' and e.snapshot->>'status'='succeeded'`, [id])).rows)[0];
}
/** GET-only callback cannot send funds or accept untracked native refunds. */
export async function verifyNativeRefundReconciliation(scope: MedusaContainer, input: RefundPaymentInput, reader?: TaxRefundFundsReader): Promise<RefundPaymentOutput> {
  if (!reader) throw new TaxRefundConflict();
  if (reader.livemode && !requireConfiguredRefundAdapter(scope).livemode) throw new TaxRefundConflict();
  // The installed native payment module passes refund.raw_amount to providers.
  // Preserve its exact decimal string rather than coercing an object to Number.
  const rawAmount = input.amount instanceof BigNumber ? input.amount.raw : input.amount;
  const decimal = rawAmount !== null && typeof rawAmount === "object"
    ? z.object({ value: z.union([z.string(),z.number().finite()]), precision: z.number().int().positive().max(100).optional() }).strict().parse(rawAmount).value
    : rawAmount;
  const id = nativeRefundId.parse(input.context?.idempotency_key), amount = exactTaxUsdCents(decimal);
  const data = z.object({ id: z.string().regex(/^pi_[A-Za-z0-9]+$/), livemode: z.boolean() }).passthrough().parse(input.data);
  if (data.livemode !== reader.livemode) throw new TaxRefundConflict();
  const db = scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION), before = await readAssociation(db, id);
  const reservation = await readRefundReservation(db, before.operation_id), request = cashRefundRequest(reservation);
  if (reservation.livemode !== reader.livemode || amount !== reservation.total_cents || data.id !== request.payment_intent || taxSaleFingerprint(request) !== before.request_fingerprint ||
    taxSaleFingerprint(before.request) !== before.request_fingerprint) throw new TaxRefundConflict();
  const proof = await inspectTaxRefundFunds(scope, before.operation_id, id, before.remote_id, reader);
  const after = await readAssociation(db, id);
  if (taxSaleFingerprint(before) !== taxSaleFingerprint(after) || proof.native_refund_id !== id || proof.total_cents !== amount) throw new TaxRefundConflict();
  return { data: input.data };
}
