import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { BigNumber, ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { checkoutCartSchema, stripeProviderId, type CheckoutCart } from "./checkout-policy";
import { createStripeRefundReader } from "./refund-finality";
import { readRecordedCartPaymentCents } from "./tax-quote-ledger";

export type PaymentRecoveryConnection = {
  raw: (sql: string, values?: (string | number)[]) => Promise<{ rows: unknown[] }>;
  transaction: <T>(operation: (connection: PaymentRecoveryConnection) => Promise<T>) => Promise<T>;
};
export type StripePaymentRecoveryReader = { livemode: boolean; retrieveIntent: (id: string) => Promise<unknown> };
const id = z.string().min(1).max(120);
const intentId = z.string().regex(/^pi_[A-Za-z0-9]+$/);
const cents = z.union([z.instanceof(BigNumber), z.number().finite(), z.string().regex(/^\d+(?:\.\d+)?$/)])
  .transform((value) => MathBN.mult(value, 100))
  .refine((value) => Number.isSafeInteger(value.toNumber()) && MathBN.gte(value, 0), "Exact USD cents are required.")
  .transform((value) => value.toNumber());
const timestamp = z.union([z.string(), z.date()]).transform((value) => new Date(value).toISOString());
const sessionSchema = z.object({
  id, provider_id: id, currency_code: z.literal("usd"), amount_cents: cents, status: z.string(),
  authorized: z.boolean(), intent_id: z.string().nullable(), livemode: z.boolean().nullable(),
  data_session_id: z.string().nullable(), data_amount_cents: z.number().int().nonnegative().safe().nullable(),
  data_fingerprint: z.string().regex(/^[a-f0-9]{32}$/), raw_amount_fingerprint: z.string().regex(/^[a-f0-9]{32}$/), updated_at: timestamp,
});
const collectionSchema = z.object({
  id, link_id: id, currency_code: z.literal("usd"), amount_cents: cents, status: z.string(), completed: z.boolean(),
  authorized_cents: cents, captured_cents: cents, refunded_cents: cents,
  sessions: z.array(sessionSchema).max(100),
});
const nativeSchema = z.object({
  id: z.string().regex(/^cart_[A-Za-z0-9]+$/), customer_id: id, currency_code: z.literal("usd"), completed: z.boolean(),
  updated_at: timestamp, has_order: z.boolean(), has_payment: z.boolean(), has_authorization: z.boolean(),
  collections: z.array(collectionSchema).max(100),
});
export type NativePaymentRecovery = z.infer<typeof nativeSchema>;
const inactive = (session: { status: string }) => session.status === "canceled";
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "The payment needs review. Resume the existing checkout before changing this cart.");
const unavailable = () => new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment verification is unavailable. No payment was canceled or created.");
function assertLease(signals: readonly (AbortSignal | undefined)[]) {
  if (signals.some((signal) => signal?.aborted)) throw new MedusaError(MedusaError.Types.CONFLICT, "Retry payment verification.");
}
export function createStripePaymentRecoveryReader(): StripePaymentRecoveryReader {
  const reader = createStripeRefundReader();
  return { livemode: reader.livemode, retrieveIntent: reader.retrieveIntent };
}

function assertUnpaid(value: NativePaymentRecovery) {
  if (value.completed || value.has_order || value.has_payment || value.has_authorization || value.collections.length > 1) throw conflict();
  for (const collection of value.collections) {
    if (!["not_paid", "awaiting", "failed", "canceled"].includes(collection.status) || collection.completed || collection.authorized_cents || collection.captured_cents || collection.refunded_cents || collection.sessions.some((session) => session.authorized)) throw conflict();
  }
  const sessions = value.collections.flatMap((collection) => collection.sessions);
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) throw conflict();
  const active = sessions.filter((session) => !inactive(session));
  if (active.length > 1 || active.some((session) => session.provider_id !== stripeProviderId || !["pending", "requires_more", "error", "authorized", "captured", "pending_authorization"].includes(session.status))) throw conflict();
}
function bindOwnedCart(value: NativePaymentRecovery, rawCart: CheckoutCart, cartCents: number) {
  const cart = checkoutCartSchema.parse(rawCart);
  if (cart.completed_at || !cart.customer_id || value.id !== cart.id || value.customer_id !== cart.customer_id || value.currency_code !== cart.currency_code) throw conflict();
  const collection = value.collections[0], expected = cart.payment_collection;
  if (!!collection !== !!expected) throw conflict();
  if (!collection || !expected) return;
  if (collection.id !== expected.id || collection.currency_code !== expected.currency_code || collection.amount_cents !== cents.parse(expected.amount) || collection.amount_cents !== cartCents) throw conflict();
  if (collection.sessions.length !== expected.payment_sessions.length) throw conflict();
  for (const session of collection.sessions) {
    const original = expected.payment_sessions.find((candidate) => candidate.id === session.id);
    if (!original || session.provider_id !== original.provider_id || session.currency_code !== original.currency_code || session.amount_cents !== cents.parse(original.amount)) throw conflict();
    if (!inactive(session) && (session.intent_id !== (original.data?.id ?? null) || session.livemode !== (original.data?.livemode ?? null))) throw conflict();
  }
}

/** Select only native binding facts and opaque hashes, never provider secrets. */
export async function readNativePaymentRecovery(db: PaymentRecoveryConnection, cart: CheckoutCart): Promise<NativePaymentRecovery> {
  const cartId = nativeSchema.shape.id.parse(cart.id);
  const result = await db.raw(`select c.id,c.customer_id,c.currency_code,c.completed_at is not null as completed,c.updated_at,
    exists(select 1 from commerce.order_cart oc where oc.cart_id=c.id) as has_order,
    exists(select 1 from commerce.payment p where p.payment_collection_id in
      (select l.payment_collection_id from commerce.cart_payment_collection l where l.cart_id=c.id)) as has_payment,
    exists(select 1 from commerce.payment_session s where s.authorized_at is not null and s.payment_collection_id in
      (select l.payment_collection_id from commerce.cart_payment_collection l where l.cart_id=c.id)) as has_authorization,
    coalesce((select jsonb_agg(jsonb_build_object('id',pc.id,'link_id',l.id,'currency_code',pc.currency_code,'amount_cents',pc.amount,
      'status',pc.status,'completed',pc.completed_at is not null,'authorized_cents',coalesce(pc.authorized_amount,0),
      'captured_cents',coalesce(pc.captured_amount,0),'refunded_cents',coalesce(pc.refunded_amount,0),
      'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'provider_id',s.provider_id,'currency_code',s.currency_code,
        'amount_cents',s.amount,'status',s.status,'authorized',s.authorized_at is not null,'intent_id',s.data->>'id',
        'livemode',s.data->'livemode','data_session_id',s.data->'metadata'->>'session_id','data_amount_cents',s.data->'amount',
        'data_fingerprint',md5(s.data::text),'raw_amount_fingerprint',md5(s.raw_amount::text),'updated_at',s.updated_at) order by s.id)
        from commerce.payment_session s where s.payment_collection_id=pc.id and s.deleted_at is null),'[]'::jsonb)) order by pc.id,l.id)
      from commerce.cart_payment_collection l join commerce.payment_collection pc on pc.id=l.payment_collection_id
      where l.cart_id=c.id and l.deleted_at is null and pc.deleted_at is null),'[]'::jsonb) as collections
    from commerce.cart c where c.id=? and c.deleted_at is null`, [cartId]);
  const value = z.array(nativeSchema).length(1).parse(result.rows)[0];
  assertUnpaid(value);
  const exact = cents.safeParse(cart.total);
  // Fractional native tax totals require the signed, private historical quote.
  // Actual collection/session/provider money always remains exact cents.
  const cartCents = exact.success ? exact.data : await readRecordedCartPaymentCents(db, cart);
  bindOwnedCart(value, cart, cartCents);
  return value;
}
export function paymentRecoveryFingerprint(value: NativePaymentRecovery) {
  return createHash("sha256").update(JSON.stringify({ ...value, collections: [...value.collections].sort((a,b) => a.id.localeCompare(b.id)).map((collection) => ({ ...collection, sessions: [...collection.sessions].sort((a,b) => a.id.localeCompare(b.id)) })) })).digest("hex");
}
const remoteSchema = z.object({
  id: intentId, currency: z.literal("usd"), livemode: z.boolean(), amount: z.number().int().positive().safe(),
  status: z.enum(["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "succeeded", "canceled"]),
  amount_received: z.number().int().nonnegative().safe(), amount_capturable: z.number().int().nonnegative().safe(),
  metadata: z.object({ session_id: id }),
});
/** An API GET is the only external operation; nonterminal payment states remain frozen. */
export async function inspectCanceledPaymentRecovery(value: NativePaymentRecovery, reader: StripePaymentRecoveryReader) {
  assertUnpaid(value);
  const session = value.collections.flatMap((collection) => collection.sessions).find((candidate) => !inactive(candidate));
  if (!session || !["pending", "requires_more", "error"].includes(session.status)) return false;
  if (!intentId.safeParse(session.intent_id).success || session.livemode === null || session.livemode !== reader.livemode || session.data_session_id !== session.id || session.data_amount_cents !== session.amount_cents || session.amount_cents !== value.collections[0].amount_cents) throw conflict();
  let remote: z.infer<typeof remoteSchema>;
  try { remote = remoteSchema.parse(await reader.retrieveIntent(session.intent_id!)); }
  catch { throw unavailable(); }
  if (remote.id !== session.intent_id || remote.metadata.session_id !== session.id || remote.amount !== session.amount_cents || remote.livemode !== reader.livemode || remote.livemode !== session.livemode) throw conflict();
  if (remote.status !== "canceled") return false;
  if (remote.amount_received || remote.amount_capturable) throw conflict();
  return true;
}

/** Caller holds both SnowForce checkout and native cart locks throughout this operation. */
export async function recoverCanceledCartPayment(cart: CheckoutCart, scope: MedusaContainer, signals: readonly (AbortSignal | undefined)[] = [], reader?: StripePaymentRecoveryReader): Promise<{ unlocked: boolean }> {
  try {
    assertLease(signals);
    const db = scope.resolve<PaymentRecoveryConnection>(ContainerRegistrationKeys.PG_CONNECTION);
    const original = await readNativePaymentRecovery(db, cart);
    assertLease(signals);
    const active = original.collections.flatMap((collection) => collection.sessions).filter((session) => !inactive(session));
    const sessions = original.collections.flatMap((collection) => collection.sessions);
    if (!sessions.length) return { unlocked: true };
    if (active.length && !["pending", "requires_more", "error"].includes(active[0].status)) return { unlocked: false };
    const remoteReader = reader ?? createStripePaymentRecoveryReader();
    // Local cancellation alone is insufficient. Verify every session in the
    // retiring collection, including previously canceled sessions.
    for (const session of sessions) {
      const inspected = { ...original, collections: original.collections.map((collection) => ({ ...collection, sessions: collection.sessions.map((entry) => ({ ...entry, status: entry.id === session.id ? "pending" : "canceled" })) })) };
      const canceled = await inspectCanceledPaymentRecovery(inspected, remoteReader);
      assertLease(signals);
      if (!canceled) return { unlocked: false };
    }
    return await db.transaction(async (connection) => {
      await connection.raw("select c.id from commerce.cart c where c.id=? and c.deleted_at is null for update", [cart.id]);
      assertLease(signals);
      const collection = original.collections[0], session = active[0];
      await connection.raw("select pc.id from commerce.payment_collection pc where pc.id=? and pc.deleted_at is null for update", [collection.id]);
      await connection.raw("select s.id from commerce.payment_session s where s.payment_collection_id=? order by s.id for update", [collection.id]);
      assertLease(signals);
      const current = await readNativePaymentRecovery(connection, cart);
      if (paymentRecoveryFingerprint(current) !== paymentRecoveryFingerprint(original)) throw conflict();
      assertLease(signals);
      // Deliberately bypass updatePaymentSession: its provider update can mutate Stripe.
      // Keep provider data, metadata, amount/raw_amount and original identities intact.
      if (session) {
        const updated = await connection.raw(`update commerce.payment_session s set status='canceled',updated_at=now()
          where s.id=? and s.status=? and s.provider_id=? and s.payment_collection_id=? and s.currency_code='usd'
          and s.amount=?::numeric/100 and md5(s.data::text)=? and md5(s.raw_amount::text)=?
          and s.authorized_at is null and s.deleted_at is null
          and exists(select 1 from commerce.cart c join commerce.cart_payment_collection l on l.cart_id=c.id
            join commerce.payment_collection pc on pc.id=l.payment_collection_id where c.id=? and c.customer_id=?
            and c.currency_code='usd' and c.completed_at is null and c.deleted_at is null and l.id=? and l.deleted_at is null
            and pc.id=s.payment_collection_id and pc.deleted_at is null and pc.completed_at is null
            and pc.amount=?::numeric/100 and pc.currency_code='usd' and coalesce(pc.authorized_amount,0)=0
            and coalesce(pc.captured_amount,0)=0 and coalesce(pc.refunded_amount,0)=0)
          and not exists(select 1 from commerce.payment p where p.payment_collection_id=s.payment_collection_id)
          and not exists(select 1 from commerce.order_cart oc where oc.cart_id=?)
          and not exists(select 1 from commerce.payment_session other where other.payment_collection_id=s.payment_collection_id
            and other.id<>s.id and other.deleted_at is null and other.status<>'canceled') returning s.id`,
        [session.id, session.status, stripeProviderId, collection.id, session.amount_cents, session.data_fingerprint, session.raw_amount_fingerprint, cart.id, cart.customer_id!, collection.link_id, collection.amount_cents, cart.id]);
        if (updated.rows.length !== 1) throw conflict();
      }
      assertLease(signals);
      const final = await readNativePaymentRecovery(connection, cart);
      if (final.collections.some((entry) => entry.sessions.some((candidate) => !inactive(candidate)))) throw conflict();
      assertLease(signals);
      // Preserve collection/session rows and the historical link. Only retire
      // the live cart link so native repricing cannot delete/recreate sessions.
      const retired = await connection.raw(`update commerce.cart_payment_collection l set deleted_at=now(),updated_at=now()
        where l.id=? and l.cart_id=? and l.payment_collection_id=? and l.deleted_at is null
        and not exists(select 1 from commerce.payment_session s where s.payment_collection_id=l.payment_collection_id and (s.status<>'canceled' or s.authorized_at is not null))
        and not exists(select 1 from commerce.payment p where p.payment_collection_id=l.payment_collection_id)
        and not exists(select 1 from commerce.order_cart oc where oc.cart_id=l.cart_id) returning l.id`, [collection.link_id, cart.id, collection.id]);
      if (retired.rows.length !== 1) throw conflict();
      const detached = await readNativePaymentRecovery(connection, { ...cart, payment_collection: null });
      if (detached.collections.length) throw conflict();
      assertLease(signals);
      return { unlocked: true };
    });
  } catch (error) {
    if (error instanceof MedusaError) throw error;
    throw unavailable();
  }
}
