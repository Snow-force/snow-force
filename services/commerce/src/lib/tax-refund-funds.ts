import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { exactTaxUsdCents } from "./tax-quote-money";
import { checkedRefundSale, TaxRefundConflict } from "./tax-refund-contract";
import { checkedTaxRefundReservation } from "./tax-refund-reservations";
import { taxSaleFingerprint } from "./tax-sale-contract";
import { assertTaxSaleFunds, type TaxSaleProvider } from "./tax-sale-worker";
import { nativeRefundId, stripeRefundId, verifiedStripeRefundSchema } from "./tax-refund-funds-contract";
export { nativeRefundId, stripeRefundId, verifiedStripeRefundSchema } from "./tax-refund-funds-contract";

const epoch = z.coerce.number().int().positive().safe(), money = z.unknown().transform(exactTaxUsdCents);
const nativeSchema = z.object({ id: nativeRefundId, payment_id: z.string(), amount: money, raw_amount: z.object({ value: money }),
  created_by: z.string(), created_at: epoch, metadata: z.object({ snowforce_refund: z.object({ operation_id: z.uuid(), allocation_fingerprint: z.string() }) }),
  provider_id: z.literal("pp_stripe_stripe"), currency_code: z.literal("usd"), intent_id: z.string(), livemode: z.boolean(), session_id: z.string(),
  payment_amount: money, payment_raw_amount: z.object({ value: money }),
  captures: z.array(z.object({ id: z.string(), amount: money, raw_amount: z.object({ value: money }), created_at: epoch })).length(1),
});
const proofSchema = z.object({ schema_version: z.literal(1), operation_id: z.uuid(), native_refund_id: nativeRefundId, stripe_refund_id: stripeRefundId,
  account_id: z.string(), livemode: z.boolean(), payment_id: z.string(), intent_id: z.string(), total_cents: z.number().int().positive(),
  native: z.unknown(), refund: verifiedStripeRefundSchema, observed_at: epoch,
}).strict();
export type TaxRefundFundsReader = Pick<TaxSaleProvider, "account" | "intent" | "livemode"> & { refund(id: string): Promise<unknown> };
export function createTaxRefundFundsReader(): TaxRefundFundsReader {
  const key = process.env.COMMERCE_STRIPE_API_KEY;
  if (!key || !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) throw new Error("Shop Stripe configuration unavailable.");
  const client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15000, maxNetworkRetries: 1 });
  return { livemode: /^(sk|rk)_live_/.test(key), account: () => client.accounts.retrieveCurrent(),
    intent: id => client.paymentIntents.retrieve(z.string().regex(/^pi_[A-Za-z0-9]+$/).parse(id)),
    refund: id => client.refunds.retrieve(stripeRefundId.parse(id)) };
}
type Reservation = ReturnType<typeof checkedTaxRefundReservation>;
function checkedNative(reservation: Reservation, raw: unknown) {
  const sale = checkedRefundSale(reservation.source_data.sale), native = nativeSchema.parse(raw), capture = native.captures[0];
  if (reservation.state !== "started" || !reservation.first_attempt_at || native.payment_id !== reservation.payment_id || native.created_by !== reservation.staff_id ||
    native.created_at < reservation.first_attempt_at || native.metadata.snowforce_refund.operation_id !== reservation.id ||
    native.metadata.snowforce_refund.allocation_fingerprint !== reservation.allocation_fingerprint || native.amount !== reservation.total_cents || native.raw_amount.value !== native.amount ||
    native.intent_id !== sale.source.intent_id || native.livemode !== reservation.livemode || native.session_id !== sale.source.session_id ||
    native.payment_amount !== sale.quote.amounts.total_cents || native.payment_raw_amount.value !== native.payment_amount ||
    capture.id !== sale.source.capture_id || capture.amount !== native.payment_amount || capture.raw_amount.value !== capture.amount || capture.created_at !== sale.source.captured_at) throw new TaxRefundConflict();
  return native;
}
/** Preserve money values already normalized to cents; don't parse them as USD a
 * second time when checking an immutable stored proof. */
function nativeForStorage(native: ReturnType<typeof nativeSchema.parse>) { return native; }
function storedNative(raw: unknown) {
  const stored = z.object({ amount: z.number().int(), raw_amount: z.object({ value: z.number().int() }), payment_amount: z.number().int(),
    payment_raw_amount: z.object({ value: z.number().int() }), captures: z.array(z.object({ amount: z.number().int(), raw_amount: z.object({ value: z.number().int() }) }).passthrough()) }).passthrough().parse(raw);
  const usd = (cents: number) => `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  return { ...stored, amount: usd(stored.amount), raw_amount: { value: usd(stored.raw_amount.value) }, payment_amount: usd(stored.payment_amount),
    payment_raw_amount: { value: usd(stored.payment_raw_amount.value) }, captures: stored.captures.map(capture => ({ ...capture, amount: usd(capture.amount), raw_amount: { value: usd(capture.raw_amount.value) } })) };
}
export function checkedTaxRefundFunds(rawReservation: unknown, rawProof: unknown) {
  const reservation = checkedTaxRefundReservation(rawReservation), sale = checkedRefundSale(reservation.source_data.sale), proof = proofSchema.parse(rawProof);
  const native = checkedNative(reservation, storedNative(proof.native)), refund = proof.refund;
  if (proof.operation_id !== reservation.id || proof.account_id !== reservation.account_id || proof.livemode !== reservation.livemode || proof.payment_id !== reservation.payment_id ||
    proof.intent_id !== sale.source.intent_id || proof.total_cents !== reservation.total_cents || proof.native_refund_id !== native.id || proof.stripe_refund_id !== refund.id ||
    refund.amount !== reservation.total_cents || refund.payment_intent !== sale.source.intent_id || refund.created < reservation.first_attempt_at! || refund.created < sale.source.captured_at ||
    refund.created > proof.observed_at || native.created_at > proof.observed_at || refund.metadata.snowforce_operation !== reservation.id ||
    refund.metadata.snowforce_allocation !== reservation.allocation_fingerprint || refund.metadata.snowforce_order !== reservation.order_id || refund.metadata.snowforce_payment !== reservation.payment_id) throw new TaxRefundConflict();
  return { ...proof, native: nativeForStorage(native), refund };
}
export const refundReservationFields = `id,sequence,order_id,sale_task_id,case_id,case_version,native_return_id,staff_id,account_id,livemode,payment_id,total_cents,
  input,input_fingerprint,source_data,source_fingerprint,allocation,allocation_fingerprint,request,request_fingerprint,state,
  floor(extract(epoch from first_attempt_at))::bigint as first_attempt_at,floor(extract(epoch from cancelled_at))::bigint as cancelled_at,cancellation_reason`;
export async function readRefundReservation(db: TaxQuoteConnection, rawId: unknown, lock = false) {
  const id = z.uuid().parse(rawId);
  return checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse((await db.raw(`select ${refundReservationFields} from commerce.snowforce_refund_allocations where id=?${lock ? " for update" : ""}`, [id])).rows)[0]);
}
export async function readNativeTaxRefund(db: TaxQuoteConnection, reservation: Reservation, rawId: unknown, lock = false) {
  const id = nativeRefundId.parse(rawId);
  const row = z.array(z.unknown()).length(1).parse((await db.raw(`select r.id,r.payment_id,r.amount,r.raw_amount,r.created_by,r.metadata,
    floor(extract(epoch from r.created_at))::bigint as created_at,p.provider_id,p.currency_code,p.data->>'id' as intent_id,p.data->'livemode' as livemode,p.payment_session_id as session_id,
    p.amount as payment_amount,p.raw_amount as payment_raw_amount,
    (select jsonb_agg(jsonb_build_object('id',c.id,'amount',c.amount,'raw_amount',c.raw_amount,'created_at',floor(extract(epoch from c.created_at))) order by c.id)
      from commerce.capture c where c.payment_id=p.id and c.deleted_at is null) as captures
    from commerce.refund r join commerce.payment p on p.id=r.payment_id
    where r.id=? and p.id=? and r.deleted_at is null and p.deleted_at is null and p.canceled_at is null${lock ? " for update of p,r" : ""}`, [id, reservation.payment_id])).rows)[0];
  return checkedNative(reservation, row);
}
/** Read-only current provider proof. Callers authenticate before entering this
 * service; user-supplied amounts or success flags cannot create funds evidence. */
export async function inspectTaxRefundFunds(scope: MedusaContainer, rawId: unknown, rawNativeId: unknown, rawStripeId: unknown, reader?: TaxRefundFundsReader) {
  const id = z.uuid().parse(rawId), nativeId = nativeRefundId.parse(rawNativeId), stripeId = stripeRefundId.parse(rawStripeId);
  const db = scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION), reservation = await readRefundReservation(db, id);
  const native = await readNativeTaxRefund(db, reservation, nativeId), provider = reader ?? createTaxRefundFundsReader();
  const sale = checkedRefundSale(reservation.source_data.sale);
  await assertTaxSaleFunds(sale.source, provider);
  const refund = verifiedStripeRefundSchema.parse(await provider.refund(stripeId));
  const observedAt = z.array(z.object({ database_now: epoch })).length(1).parse((await db.raw("select floor(extract(epoch from clock_timestamp()))::bigint as database_now")).rows)[0].database_now;
  if (refund.id !== stripeId) throw new TaxRefundConflict();
  return checkedTaxRefundFunds(reservation, { schema_version: 1, operation_id: id, native_refund_id: nativeId, stripe_refund_id: stripeId,
    account_id: reservation.account_id, livemode: reservation.livemode, payment_id: reservation.payment_id, intent_id: sale.source.intent_id, total_cents: reservation.total_cents,
    native: nativeForStorage(native), refund, observed_at: observedAt });
}
export const taxRefundFundsFingerprint = (rawReservation: unknown, rawProof: unknown) => taxSaleFingerprint(checkedTaxRefundFunds(rawReservation, rawProof));
