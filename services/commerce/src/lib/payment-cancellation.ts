import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import { checkoutFingerprint, stripeProviderId, type CheckoutCart } from "./checkout-policy";
import { readNativePaymentRecovery, type NativePaymentRecovery, type PaymentRecoveryConnection } from "./payment-recovery";

export const cancellationMetadataKey = "snowforce_cart_cancellation";
const identifier = z.string().min(1).max(120);
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const operationSchema = z.object({ version: z.literal(1), token: tokenSchema, cart_id: identifier, customer_id: identifier, session_id: identifier,
  intent_id: z.string().regex(/^pi_[A-Za-z0-9]+$/), account_id: z.string().regex(/^acct_[A-Za-z0-9]+$/), livemode: z.boolean(),
  amount_cents: z.number().int().positive().safe(), currency: z.literal("usd"), phase: z.enum(["reserved", "canceled"]), created_at: z.iso.datetime() }).strict();
type Operation = z.infer<typeof operationSchema>;
export function paymentCancellationPending(cart: CheckoutCart) {
  return !!cart.payment_collection?.payment_sessions.some(session => session.metadata && Object.hasOwn(session.metadata, cancellationMetadataKey));
}
export type CancellationResult = { status: "confirmation-required"; token: string; amountCents: number; currency: "usd" }
  | { status: "editable" | "canceled" }
  | { status: "blocked" | "pending"; code: "payment-review" | "payment-processing" | "payment-authorized" | "checkout-changed" | "verification-unavailable" | "recovery-pending" };
export type CancellationWriter = { livemode: boolean; account: () => Promise<unknown>; retrieveIntent: (id: string) => Promise<unknown>; cancelIntent: (id: string, key: string) => Promise<unknown> };
class CancellationFailure extends Error { constructor(readonly result: Extract<CancellationResult, { status: "blocked" | "pending" }>) { super(result.code); } }
const blocked = (code: Extract<CancellationResult, { status: "blocked" | "pending" }>["code"] = "payment-review") => new CancellationFailure({ status: "blocked", code });
const pending = () => new CancellationFailure({ status: "pending", code: "verification-unavailable" });
const remoteSchema = z.object({ id: z.string().regex(/^pi_[A-Za-z0-9]+$/), currency: z.literal("usd"), livemode: z.boolean(), amount: z.number().int().positive().safe(),
  capture_method: z.literal("manual"), status: z.enum(["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "succeeded", "canceled"]),
  amount_received: z.number().int().nonnegative().safe(), amount_capturable: z.number().int().nonnegative().safe(), metadata: z.object({ session_id: identifier }),
  latest_charge: z.object({ id: z.string().min(1).max(255), paid: z.boolean(), captured: z.boolean(), refunded: z.boolean(), amount_captured: z.number().int().nonnegative().safe(), amount_refunded: z.number().int().nonnegative().safe(), status: z.enum(["failed", "pending", "succeeded"]) }).nullable(),
});
function lease(signals: readonly (AbortSignal | undefined)[]) { if (signals.some(value => value?.aborted)) throw pending(); }
export function createCancellationWriter(): CancellationWriter {
  const key = process.env.COMMERCE_STRIPE_API_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw pending();
  const client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15_000, maxNetworkRetries: 1 });
  return { livemode: /^(sk|rk)_live_/.test(key), account: () => client.accounts.retrieveCurrent(),
    retrieveIntent: id => client.paymentIntents.retrieve(id, { expand: ["latest_charge"] }),
    cancelIntent: (id, idempotencyKey) => client.paymentIntents.cancel(id, { cancellation_reason: "requested_by_customer" }, { idempotencyKey }) };
}
type Target = { token: string; cart_id: string; customer_id: string; session_id: string; intent_id: string; amount_cents: number; livemode: boolean };
function targetFor(cart: CheckoutCart, native: NativePaymentRecovery): Target | null {
  const sessions = native.collections.flatMap(collection => collection.sessions);
  if (!sessions.length) return null;
  if (sessions.length !== 1) throw blocked();
  const session = sessions[0];
  if (!["pending", "requires_more", "error", "canceled"].includes(session.status)) throw blocked("payment-authorized");
  if (session.provider_id !== stripeProviderId || !/^pi_[A-Za-z0-9]+$/.test(session.intent_id ?? "") || session.livemode === null ||
      session.data_session_id !== session.id || session.data_amount_cents !== session.amount_cents || session.amount_cents !== native.collections[0].amount_cents) throw blocked();
  const value = { cart_id: native.id, customer_id: native.customer_id, session_id: session.id, intent_id: session.intent_id!, amount_cents: session.amount_cents, livemode: session.livemode };
  return { ...value, token: createHash("sha256").update(JSON.stringify({ ...value, quote: checkoutFingerprint(cart) })).digest("hex") };
}
async function remoteFor(target: Target, writer: CancellationWriter) {
  if (target.livemode !== writer.livemode) throw blocked();
  let remote: z.infer<typeof remoteSchema>;
  try { remote = remoteSchema.parse(await writer.retrieveIntent(target.intent_id)); } catch { throw pending(); }
  if (remote.id !== target.intent_id || remote.metadata.session_id !== target.session_id || remote.amount !== target.amount_cents || remote.livemode !== target.livemode) throw blocked();
  // A failed charge is not authorization. A successful/uncaptured charge, even
  // after a cancel/confirm race, requires reconciliation rather than cart edits.
  if (remote.amount_received || remote.amount_capturable || ["requires_capture", "succeeded"].includes(remote.status) ||
      remote.latest_charge && (remote.latest_charge.paid || remote.latest_charge.captured || remote.latest_charge.refunded || remote.latest_charge.amount_captured || remote.latest_charge.amount_refunded || remote.latest_charge.status !== "failed")) throw blocked("payment-authorized");
  if (remote.status === "processing") throw blocked("payment-processing");
  return remote;
}
async function accountFor(writer: CancellationWriter) { try { return z.object({ id: z.string().regex(/^acct_[A-Za-z0-9]+$/) }).parse(await writer.account()).id; } catch { throw pending(); } }
async function historical(db: PaymentRecoveryConnection, cart: CheckoutCart, token: string): Promise<Operation> {
  const result = await db.raw(`select s.metadata->'snowforce_cart_cancellation' as operation from commerce.payment_session s
    join commerce.cart_payment_collection l on l.payment_collection_id=s.payment_collection_id join commerce.cart c on c.id=l.cart_id
    where c.id=? and c.customer_id=? and c.completed_at is null and c.deleted_at is null and l.deleted_at is not null
      and s.provider_id=? and s.currency_code='usd' and s.status='canceled' and s.authorized_at is null and s.deleted_at is null
      and s.metadata->'snowforce_cart_cancellation'->>'token'=? and s.metadata->'snowforce_cart_cancellation'->>'phase' in ('reserved','canceled')
      and s.metadata->'snowforce_cart_cancellation'->>'session_id'=s.id
      and s.metadata->'snowforce_cart_cancellation'->>'intent_id'=s.data->>'id'
      and s.metadata->'snowforce_cart_cancellation'->>'cart_id'=c.id
      and s.metadata->'snowforce_cart_cancellation'->>'customer_id'=c.customer_id
      and s.amount=(s.metadata->'snowforce_cart_cancellation'->>'amount_cents')::numeric/100`, [cart.id, cart.customer_id!, stripeProviderId, token]);
  const row = z.array(z.object({ operation: operationSchema })).length(1).safeParse(result.rows);
  if (!row.success || row.data[0].operation.token !== token) throw blocked("checkout-changed");
  return row.data[0].operation;
}
async function saveOperation(db: PaymentRecoveryConnection, cart: CheckoutCart, target: Target, account: string, phase: Operation["phase"], signals: readonly (AbortSignal | undefined)[]) {
  return db.transaction(async tx => {
    await tx.raw("select id from commerce.cart where id=? and deleted_at is null for update", [cart.id]);
    await tx.raw("select id from commerce.payment_collection where id=? and deleted_at is null for update", [cart.payment_collection!.id]);
    await tx.raw("select id from commerce.payment_session where payment_collection_id=? order by id for update", [cart.payment_collection!.id]);
    lease(signals);
    const current = targetFor(cart, await readNativePaymentRecovery(tx, cart));
    if (!current || current.token !== target.token) throw blocked("checkout-changed");
    const rows = await tx.raw("select metadata->'snowforce_cart_cancellation' as operation from commerce.payment_session where id=? and deleted_at is null", [target.session_id]);
    if (rows.rows.length !== 1) throw blocked();
    const raw = z.object({ operation: z.unknown() }).parse(rows.rows[0]).operation;
    const existing = raw === null || raw === undefined ? null : operationSchema.parse(raw);
    if (existing && (existing.token !== target.token || existing.account_id !== account || existing.intent_id !== target.intent_id || existing.cart_id !== cart.id || existing.customer_id !== cart.customer_id || existing.session_id !== target.session_id || existing.amount_cents !== target.amount_cents || existing.livemode !== target.livemode)) throw blocked("checkout-changed");
    const operation = operationSchema.parse({ ...target, version: 1, account_id: account, currency: "usd", phase: existing?.phase === "canceled" ? "canceled" : phase, created_at: existing?.created_at ?? new Date().toISOString() });
    const saved = await tx.raw(`update commerce.payment_session set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{snowforce_cart_cancellation}',?::jsonb,true),updated_at=clock_timestamp()
      where id=? and payment_collection_id=? and provider_id=? and currency_code='usd' and amount=?::numeric/100
        and data->>'id'=? and data->'livemode'=?::jsonb and data->'metadata'->>'session_id'=id
        and authorized_at is null and status in ('pending','requires_more','error','canceled') and deleted_at is null returning id`,
    [JSON.stringify(operation), target.session_id, cart.payment_collection!.id, stripeProviderId, target.amount_cents, target.intent_id, JSON.stringify(target.livemode)]);
    if (saved.rows.length !== 1) throw blocked();
    lease(signals);
    return operation;
  });
}
function resultFor(error: unknown): CancellationResult { return error instanceof CancellationFailure ? error.result : { status: "pending", code: "verification-unavailable" }; }
/** Caller holds checkout and native cart leases. Browser identifiers never select a PI. */
export async function previewCartCancellation(cart: CheckoutCart, scope: MedusaContainer, signals: readonly (AbortSignal | undefined)[] = [], injected?: CancellationWriter): Promise<CancellationResult> {
  try {
    lease(signals);
    const db = scope.resolve<PaymentRecoveryConnection>(ContainerRegistrationKeys.PG_CONNECTION);
    const target = targetFor(cart, await readNativePaymentRecovery(db, cart));
    if (!target) return { status: "editable" };
    const writer = injected ?? createCancellationWriter();
    await remoteFor(target, writer); lease(signals);
    return { status: "confirmation-required", token: target.token, amountCents: target.amount_cents, currency: "usd" };
  } catch (error) { return resultFor(error); }
}
export async function cancelUnpaidCartPayment(cart: CheckoutCart, scope: MedusaContainer, token: string, signals: readonly (AbortSignal | undefined)[] = [], injected?: CancellationWriter): Promise<CancellationResult> {
  try {
    tokenSchema.parse(token); lease(signals);
    const db = scope.resolve<PaymentRecoveryConnection>(ContainerRegistrationKeys.PG_CONNECTION);
    const target = targetFor(cart, await readNativePaymentRecovery(db, cart));
    const writer = injected ?? createCancellationWriter();
    if (!target) {
      const old = await historical(db, cart, token);
      if (await accountFor(writer) !== old.account_id) throw blocked();
      const remote = await remoteFor(old, writer); lease(signals);
      if (remote.status !== "canceled") throw blocked();
      if (old.phase === "reserved") {
        const saved = await db.raw(`update commerce.payment_session set metadata=jsonb_set(metadata,'{snowforce_cart_cancellation,phase}','"canceled"'::jsonb),updated_at=clock_timestamp()
          where id=? and metadata->'snowforce_cart_cancellation'->>'token'=? and status='canceled' and authorized_at is null returning id`, [old.session_id, token]);
        if (saved.rows.length !== 1) throw blocked();
      }
      return { status: "canceled" };
    }
    if (target.token !== token) throw blocked("checkout-changed");
    const account = await accountFor(writer);
    await remoteFor(target, writer); lease(signals);
    await saveOperation(db, cart, target, account, "reserved", signals);
    // Re-read immediately before the external write; Stripe's atomic result,
    // subsequent charge evidence and native recovery still decide the outcome.
    let remote = await remoteFor(target, writer); lease(signals);
    if (remote.status !== "canceled") {
      try { await writer.cancelIntent(target.intent_id, `snowforce-cart-cancel:${target.session_id}`); }
      catch { /* A timeout is ambiguous: inspect this same intent before retry. */ }
      lease(signals);
      remote = await remoteFor(target, writer);
    }
    if (remote.status !== "canceled") throw pending();
    lease(signals);
    await saveOperation(db, cart, target, account, "canceled", signals);
    return { status: "canceled" };
  } catch (error) { return resultFor(error); }
}
