import { createHash, randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { BigNumber, ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import { stripeProviderId } from "./checkout-policy";

export type RefundConnection = {
  raw: (sql: string, values?: (string | number)[]) => Promise<{ rows: unknown[] }>;
  transaction: <T>(operation: (connection: RefundConnection) => Promise<T>) => Promise<T>;
};
const nativeId = z.string().min(1).max(120);
const cents = z.union([z.instanceof(BigNumber), z.number().finite(), z.string().regex(/^\d+(?:\.\d+)?$/)])
  .transform((value) => MathBN.mult(value, 100))
  .refine((value) => Number.isSafeInteger(value.toNumber()) && MathBN.gte(value, 0), "An exact USD cent amount is required.")
  .transform((value) => value.toNumber());
const nativePayment = z.object({
  id: nativeId, provider_id: nativeId, currency_code: z.literal("usd"), amount_cents: cents,
  intent_id: z.string().nullable(), livemode: z.boolean().nullable(), canceled: z.boolean(),
  captures: z.array(z.object({ id: nativeId, amount_cents: cents })),
  refunds: z.array(z.object({ id: nativeId, amount_cents: cents })),
});
const nativeFunds = z.object({ id: z.string().regex(/^order_[A-Za-z0-9]+$/), currency_code: z.literal("usd"), payments: z.array(nativePayment).min(1).max(100) });
export type NativeRefundFunds = z.infer<typeof nativeFunds>;
const remoteId = z.string().regex(/^pi_[A-Za-z0-9]+$/);
const remoteCents = z.number().int().positive().safe();
const remoteIntent = z.object({ id: remoteId, currency: z.literal("usd"), livemode: z.boolean(), status: z.string(), amount: remoteCents, amount_received: z.number().int().nonnegative().safe() });
const refundStatus = z.enum(["pending", "requires_action", "succeeded", "failed", "canceled"]);
const remoteRefund = z.object({
  id: z.string().regex(/^re_[A-Za-z0-9]+$/), payment_intent: z.union([remoteId, z.object({ id: remoteId })]).transform((value) => typeof value === "string" ? value : value.id),
  currency: z.literal("usd"), amount: remoteCents, status: refundStatus, created: z.number().int().nonnegative(),
});
const refundPage = z.object({ has_more: z.boolean(), data: z.array(remoteRefund).max(100) });
export type StripeRefundReader = {
  livemode: boolean;
  retrieveIntent: (id: string) => Promise<unknown>;
  listRefunds: (id: string, cursor?: string) => Promise<unknown>;
};
const conflict = (message: string) => new MedusaError(MedusaError.Types.CONFLICT, message);
const safeFailure = () => new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Stripe refund verification is unavailable. No refund or completion was attempted.");
export function createStripeRefundReader(): StripeRefundReader {
  const key = process.env.COMMERCE_STRIPE_API_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw safeFailure();
  const client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15_000, maxNetworkRetries: 1 });
  return {
    livemode: /^(sk|rk)_live_/.test(key),
    retrieveIntent: (id) => client.paymentIntents.retrieve(remoteId.parse(id)),
    listRefunds: (id, cursor) => client.refunds.list({ payment_intent: remoteId.parse(id), limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
  };
}

/** Read only the payment facts needed for reconciliation, never client secrets or card data. */
export async function readNativeRefundFunds(db: RefundConnection, orderId: string): Promise<NativeRefundFunds> {
  const id = nativeFunds.shape.id.parse(orderId);
  const result = await db.raw(`select o.id,o.currency_code,coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'provider_id',p.provider_id,'currency_code',p.currency_code,
      'amount_cents',p.amount,'intent_id',p.data->>'id','livemode',p.data->'livemode','canceled',p.canceled_at is not null,
      'captures',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'amount_cents',c.amount) order by c.id) from commerce.capture c where c.payment_id=p.id and c.deleted_at is null),'[]'::jsonb),
      'refunds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount_cents',r.amount) order by r.id) from commerce.refund r where r.payment_id=p.id and r.deleted_at is null),'[]'::jsonb)) order by p.id)
    from commerce.payment p join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id
    where l.order_id=o.id and l.deleted_at is null and p.deleted_at is null),'[]'::jsonb) as payments
    from commerce."order" o where o.id=? and o.deleted_at is null`, [id]);
  const rows = z.array(nativeFunds).length(1).parse(result.rows);
  const value = rows[0];
  const identifiers = value.payments.flatMap((payment) => [payment.id, ...payment.captures.map((capture) => capture.id), ...payment.refunds.map((refund) => refund.id)]);
  if (new Set(identifiers).size !== identifiers.length) throw conflict("Duplicate native payment, capture or refund. Reconcile the order before completing.");
  return value;
}
export function refundFundsFingerprint(value: NativeRefundFunds) {
  return createHash("sha256").update(JSON.stringify({ ...value, payments: [...value.payments].sort((a,b) => a.id.localeCompare(b.id)).map((payment) => ({ ...payment, captures: [...payment.captures].sort((a,b) => a.id.localeCompare(b.id)), refunds: [...payment.refunds].sort((a,b) => a.id.localeCompare(b.id)) })) })).digest("hex");
}
const sum = (values: number[]) => values.reduce((total, value) => {
  const next = total + value;
  if (!Number.isSafeInteger(next)) throw safeFailure();
  return next;
}, 0);
async function allRefunds(reader: StripeRefundReader, intentId: string) {
  const result: z.infer<typeof remoteRefund>[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
    const page = refundPage.parse(await reader.listRefunds(intentId, cursor));
    for (const refund of page.data) {
      if (refund.payment_intent !== intentId || seen.has(refund.id)) throw safeFailure();
      seen.add(refund.id); result.push(refund);
    }
    if (!page.has_more) return result;
    if (!page.data.length) throw safeFailure();
    cursor = page.data[page.data.length - 1].id;
  }
  throw safeFailure();
}
export async function inspectRefundFunds(funds: NativeRefundFunds, reader: StripeRefundReader, startedAt = new Date().toISOString()) {
  z.iso.datetime().parse(startedAt);
  const ids = funds.payments.filter((payment) => payment.amount_cents > 0).map((payment) => payment.intent_id);
  if (ids.some((id) => !remoteId.safeParse(id).success) || new Set(ids).size !== ids.length) throw conflict("Native payments are missing a unique Stripe PaymentIntent. Reconcile before completing.");
  const payments = [];
  for (const payment of funds.payments) {
    if (payment.amount_cents === 0 && !payment.captures.length && !payment.refunds.length) continue;
    if (payment.provider_id !== stripeProviderId || payment.canceled || !payment.intent_id) throw conflict("Only an active, reconciled Stripe payment can settle this request.");
    const intent = remoteIntent.parse(await reader.retrieveIntent(payment.intent_id));
    if (intent.id !== payment.intent_id || intent.livemode !== reader.livemode || (payment.livemode !== null && payment.livemode !== intent.livemode)) throw safeFailure();
    const refunds = await allRefunds(reader, intent.id);
    const capturedCents = sum(payment.captures.map((capture) => capture.amount_cents));
    const expectedRefundCents = sum(payment.refunds.map((refund) => refund.amount_cents));
    const succeededCents = sum(refunds.filter((refund) => refund.status === "succeeded").map((refund) => refund.amount));
    const unresolved = refunds.some((refund) => ["pending", "requires_action"].includes(refund.status));
    const matches = intent.status === "succeeded" && intent.amount === payment.amount_cents && intent.amount_received === capturedCents && capturedCents > 0 && succeededCents === expectedRefundCents && succeededCents <= capturedCents && payment.refunds.every((refund) => refund.amount_cents > 0) && payment.captures.every((capture) => capture.amount_cents > 0);
    payments.push({ payment_id: payment.id, intent_id: intent.id, livemode: intent.livemode, captured_cents: capturedCents, expected_refund_cents: expectedRefundCents, succeeded_refund_cents: succeededCents, state: unresolved ? "pending" as const : matches ? "verified" as const : "exception" as const, native_refunds: payment.refunds, refunds: refunds.map(({ id, status, amount, created }) => ({ id, status, amount_cents: amount, created })) });
  }
  const state = payments.some((payment) => payment.state === "exception") ? "exception" as const : payments.some((payment) => payment.state === "pending") ? "pending" as const : "verified" as const;
  return { schema_version: 1 as const, order_id: funds.id, fingerprint: refundFundsFingerprint(funds), observed_at: startedAt, state, payments };
}
export type RefundFundsCheck = Awaited<ReturnType<typeof inspectRefundFunds>>;
const auditSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("staff"), staff_id: nativeId, request_id: z.string().uuid() }).strict(),
  z.object({ source: z.literal("stripe_webhook"), event_id: z.string().regex(/^evt_[A-Za-z0-9]+$/) }).strict(),
  z.object({ source: z.literal("native_payment"), payment_id: nativeId }).strict(),
]);
export type RefundCheckAudit = z.infer<typeof auditSchema>;
export async function verifyOrderRefundFunds(scope: MedusaContainer, orderId: string, reader?: StripeRefundReader) {
  const db = scope.resolve<RefundConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  const funds = await readNativeRefundFunds(db, orderId);
  try { return await inspectRefundFunds(funds, reader ?? createStripeRefundReader()); }
  catch (error) { if (error instanceof MedusaError) throw error; throw safeFailure(); }
}
export async function lastOrderRefundFunds(scope: MedusaContainer, orderId: string) {
  nativeFunds.shape.id.parse(orderId);
  const db = scope.resolve<RefundConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  const result = await db.raw("select state,observed_at,fingerprint from commerce.snowforce_refund_verifications where order_id=?", [orderId]);
  const rows = z.array(z.object({ state: z.enum(["verified", "pending", "exception"]), observed_at: z.coerce.date().transform((value) => value.toISOString()), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) })).max(1).parse(result.rows);
  if (!rows[0]) return null;
  const funds = await readNativeRefundFunds(db, orderId);
  return { state: rows[0].state, observed_at: rows[0].observed_at, changed: refundFundsFingerprint(funds) !== rows[0].fingerprint };
}
/** Short DB transaction after all network reads; lock the same payments native refunds serialize on. */
export async function saveRefundFundsCheck(db: RefundConnection, check: RefundFundsCheck, audit: RefundCheckAudit, now = Date.now()) {
  auditSchema.parse(audit);
  if (now - Date.parse(check.observed_at) > 120_000 || Date.parse(check.observed_at) > now + 1_000) throw conflict("Refund verification expired. Check Stripe again before completing.");
  await db.raw("select p.id from commerce.payment p join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id where l.order_id=? and l.deleted_at is null and p.deleted_at is null order by p.id for update of p", [check.order_id]);
  if (refundFundsFingerprint(await readNativeRefundFunds(db, check.order_id)) !== check.fingerprint) throw conflict("The payment or refunds changed during verification. Check again before completing.");
  const result = await db.raw("insert into commerce.snowforce_refund_verifications(order_id,fingerprint,observed_at,state,snapshot,audit) values(?,?,?::timestamptz,?,?::jsonb,?::jsonb) on conflict(order_id) do update set fingerprint=excluded.fingerprint,observed_at=excluded.observed_at,state=excluded.state,snapshot=excluded.snapshot,audit=excluded.audit,updated_at=now() where commerce.snowforce_refund_verifications.observed_at<=excluded.observed_at returning order_id", [check.order_id, check.fingerprint, check.observed_at, check.state, JSON.stringify(check), JSON.stringify(audit)]);
  if (result.rows.length !== 1) throw conflict("A newer refund check exists. Refresh before continuing.");
  await db.raw("insert into commerce.snowforce_refund_verification_history(id,order_id,fingerprint,observed_at,state,snapshot,audit) values(?::uuid,?,?,?::timestamptz,?,?::jsonb,?::jsonb)", [randomUUID(), check.order_id, check.fingerprint, check.observed_at, check.state, JSON.stringify(check), JSON.stringify(audit)]);
}
export function assertRefundFundsSucceeded(check: RefundFundsCheck) {
  if (check.state !== "verified") throw conflict("Stripe refunds are still processing or do not match the native order. Reconcile funds before completing this request.");
}

/** Native queues can serialize Buffers; verify the original bytes, ignoring the parsed body. */
export function refundWebhookIntent(input: unknown) {
  const envelope = z.object({ provider: z.string(), payload: z.object({ rawData: z.union([z.string(), z.instanceof(Buffer), z.object({ type: z.literal("Buffer"), data: z.array(z.number().int().min(0).max(255)).max(1_048_576) })]), headers: z.record(z.string(), z.unknown()) }) }).parse(input);
  if (envelope.provider !== "stripe_stripe") return null;
  const key = process.env.COMMERCE_STRIPE_API_KEY, secret = process.env.COMMERCE_STRIPE_WEBHOOK_SECRET;
  const signature = envelope.payload.headers["stripe-signature"];
  if (!key || !/^(sk|rk)_(test|live)_/.test(key) || !secret?.startsWith("whsec_") || typeof signature !== "string") throw safeFailure();
  const raw = typeof envelope.payload.rawData === "object" && !Buffer.isBuffer(envelope.payload.rawData) ? Buffer.from(envelope.payload.rawData.data) : envelope.payload.rawData;
  try {
    const client = new Stripe(key, { apiVersion: "2026-09-30.endive" });
    const event = client.webhooks.constructEvent(raw, signature, secret);
    if (!["refund.created", "refund.updated", "refund.failed"].includes(event.type)) return null;
    if (event.livemode !== /^(sk|rk)_live_/.test(key)) throw safeFailure();
    const value = z.object({ payment_intent: z.union([remoteId, z.object({ id: remoteId }), z.null()]) }).parse(event.data.object);
    const intentId = value.payment_intent === null ? null : typeof value.payment_intent === "string" ? value.payment_intent : value.payment_intent.id;
    return intentId ? { intent_id: intentId, event_id: z.string().regex(/^evt_[A-Za-z0-9]+$/).parse(event.id) } : null;
  } catch { throw safeFailure(); }
}
