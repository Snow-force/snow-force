import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateEntityId, MathBN, MedusaError } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import { checkoutFingerprint, stripeProviderId, type CheckoutCart } from "./checkout-policy";
import { verifyPolicyAcceptance } from "./policy-consent";
import { paymentRecoveryFingerprint, readNativePaymentRecovery, type PaymentRecoveryConnection } from "./payment-recovery";
import { assertActiveStripeTaxSetup } from "./tax-setup";
import { assertPersistedCartTaxQuote, bindTaxQuotePayment } from "./tax-quote-ledger";
import { normalizeQuotedPaymentCollection } from "./payment-amount";

const attemptKey = "snowforce_payment_creation";
const pendingKey = "snowforce_payment_creation_pending";
const id = z.string().min(1).max(120);
const intentId = z.string().regex(/^pi_[A-Za-z0-9]+$/);
const exactCents = z.coerce.number().finite().positive().transform((value) => MathBN.mult(value, 100).toNumber())
  .refine(Number.isSafeInteger, "Exact USD cents are required.");
const attemptSchema = z.object({ version: z.literal(1), cart_id: id, customer_id: id, quote: z.string().regex(/^[a-f0-9]{64}$/), livemode: z.boolean(), namespace: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const rowSchema = z.object({ id, amount: exactCents, currency_code: z.literal("usd"), provider_id: z.literal(stripeProviderId), status: z.enum(["pending", "requires_more", "error"]), data: z.object({ [pendingKey]: z.literal(true) }).strict(), metadata: z.object({ [attemptKey]: attemptSchema }).strict(), created_at: z.union([z.string(), z.date()]).transform((value) => new Date(value).getTime()), database_now: z.union([z.string(), z.date()]).transform((value) => new Date(value).getTime()) });
const remoteSchema = z.object({ id: intentId, amount: z.number().int().positive().safe(), currency: z.literal("usd"), livemode: z.boolean(), status: z.enum(["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "succeeded", "canceled"]), amount_received: z.number().int().nonnegative().safe(), amount_capturable: z.number().int().nonnegative().safe(), client_secret: z.string(), metadata: z.object({ session_id: id }) });
export type StripePaymentCreator = {
  livemode: boolean; namespace: string;
  createIntent: (parameters: Stripe.PaymentIntentCreateParams, idempotencyKey: string) => Promise<unknown>;
  retrieveIntent: (id: string) => Promise<unknown>;
};
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Check the existing payment before starting another payment.");
const unavailable = () => new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment initialization needs another status check. This attempt has been preserved.");
function assertLease(signals: readonly (AbortSignal | undefined)[]) {
  if (signals.some((signal) => signal?.aborted)) throw conflict();
}
export function paymentCreationInterrupted(cart: CheckoutCart) {
  return !!cart.payment_collection?.payment_sessions.some((session) => !session.data?.id && session.data?.[pendingKey] === true);
}
export function createStripePaymentCreator(): StripePaymentCreator {
  const key = process.env.COMMERCE_STRIPE_API_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw unavailable();
  const client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15_000, maxNetworkRetries: 1 });
  return {
    livemode: /^(sk|rk)_live_/.test(key), namespace: createHash("sha256").update(key).digest("hex"),
    createIntent: (parameters, idempotencyKey) => client.paymentIntents.create(parameters, { idempotencyKey }),
    retrieveIntent: (value) => client.paymentIntents.retrieve(intentId.parse(value)),
  };
}
async function lockPaymentRows(db: PaymentRecoveryConnection, cart: CheckoutCart) {
  await db.raw("select id from commerce.cart where id=? and deleted_at is null for update", [cart.id]);
  await db.raw("select id from commerce.payment_collection where id=? and deleted_at is null for update", [cart.payment_collection!.id]);
  await db.raw("select id from commerce.payment_session where payment_collection_id=? order by id for update", [cart.payment_collection!.id]);
}
async function readAttempt(db: PaymentRecoveryConnection, sessionId: string) {
  const { rows } = await db.raw("select id,amount,currency_code,provider_id,status,data,metadata,created_at,current_timestamp as database_now from commerce.payment_session where id=? and deleted_at is null", [sessionId]);
  return z.array(rowSchema).length(1).parse(rows)[0];
}
function assertAttempt(row: z.infer<typeof rowSchema>, cart: CheckoutCart, writer: StripePaymentCreator, quotedCents: number) {
  const attempt = row.metadata[attemptKey];
  if (attempt.cart_id !== cart.id || attempt.customer_id !== cart.customer_id || attempt.quote !== checkoutFingerprint(cart) || attempt.livemode !== writer.livemode || attempt.namespace !== writer.namespace || row.amount !== quotedCents) throw conflict();
  // Stripe only guarantees creation-key replay for 24h. Never mint another PI
  // after an ambiguous attempt has aged out, even after a process restart.
  if (!Number.isFinite(row.created_at) || !Number.isFinite(row.database_now) || row.database_now < row.created_at || row.database_now - row.created_at >= 22 * 60 * 60 * 1000) throw conflict();
}
export function verifyPaymentIntentBinding(raw: unknown, row: { id: string; amount: number }, writer: { livemode: boolean }) {
  const remote = remoteSchema.parse(raw);
  if (remote.metadata.session_id !== row.id || remote.amount !== row.amount || remote.livemode !== writer.livemode || !remote.client_secret.startsWith(`${remote.id}_secret_`) || !/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(remote.client_secret) || remote.amount_received > remote.amount || remote.amount_capturable > remote.amount || remote.amount_received + remote.amount_capturable > remote.amount) throw conflict();
  const moneyMatches = remote.status === "requires_capture" ? remote.amount_capturable === remote.amount && remote.amount_received === 0
    : remote.status === "succeeded" ? remote.amount_received === remote.amount && remote.amount_capturable === 0
    : remote.amount_received === 0 && remote.amount_capturable === 0;
  if (!moneyMatches) throw conflict();
  return remote;
}
export const nativePaymentSessionStatus = (status: z.infer<typeof remoteSchema>["status"]) => ({ requires_payment_method: "pending", requires_confirmation: "pending", requires_action: "requires_more", processing: "pending_authorization", requires_capture: "authorized", succeeded: "authorized", canceled: "canceled" }[status]);

/** Caller holds both checkout/cart leases. Never delete, cancel or compensate a session. */
export async function createDurableCartPayment(cart: CheckoutCart, scope: MedusaContainer, signals: readonly (AbortSignal | undefined)[] = [], injected?: StripePaymentCreator) {
  try {
    assertLease(signals);
    verifyPolicyAcceptance(cart);
    cart = await normalizeQuotedPaymentCollection(cart, scope, signals);
    const taxProof = await assertPersistedCartTaxQuote(cart, scope, await assertActiveStripeTaxSetup(scope), "create_payment");
    const quotedCents = taxProof.receipt.total_cents;
    if (!cart.payment_collection || cart.payment_collection.currency_code !== "usd" || exactCents.parse(cart.payment_collection.amount) !== quotedCents) throw conflict();
    const writer = injected ?? createStripePaymentCreator();
    const query = scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code", "countries.iso_2", "payment_providers.id", "payment_providers.is_enabled"], filters: { id: cart.region_id } });
    const region = z.object({ id: z.literal(cart.region_id), currency_code: z.literal("usd"), countries: z.array(z.object({ iso_2: z.literal("us") })).length(1), payment_providers: z.array(z.object({ id: z.string(), is_enabled: z.boolean() })) }).parse(regions[0]);
    if (!region.payment_providers.some((provider) => provider.id === stripeProviderId && provider.is_enabled)) throw conflict();
    assertLease(signals);
    const db = scope.resolve<PaymentRecoveryConnection>(ContainerRegistrationKeys.PG_CONNECTION);
    // Persist the actual native session before making a Stripe request. Its ID
    // is both the permanent webhook binding and the stable creation key.
    const reserved = await db.transaction(async (connection) => {
      await lockPaymentRows(connection, cart);
      assertLease(signals);
      const original = await readNativePaymentRecovery(connection, cart);
      if (original.collections.length !== 1) throw conflict();
      const sessions = original.collections[0].sessions;
      if (sessions.length > 1 || sessions.some((session) => session.status === "canceled" || session.intent_id !== null)) throw conflict();
      let sessionId = sessions[0]?.id;
      if (!sessionId) {
        sessionId = generateEntityId(undefined, "payses");
        const cents = quotedCents;
        const decimal = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
        const metadata = { [attemptKey]: attemptSchema.parse({ version: 1, cart_id: cart.id, customer_id: cart.customer_id, quote: checkoutFingerprint(cart), livemode: writer.livemode, namespace: writer.namespace }) };
        await connection.raw(`insert into commerce.payment_session (id,payment_collection_id,provider_id,currency_code,amount,raw_amount,status,data,context,metadata)
          values (?,?,?,'usd',?::numeric/100,?::jsonb,'pending',?::jsonb,?::jsonb,?::jsonb)`, [sessionId, cart.payment_collection!.id, stripeProviderId, cents, JSON.stringify({ value: decimal, precision: 20 }), JSON.stringify({ [pendingKey]: true }), JSON.stringify({ idempotency_key: sessionId }), JSON.stringify(metadata)]);
      }
      const row = await readAttempt(connection, sessionId);
      assertAttempt(row, cart, writer, quotedCents);
      await bindTaxQuotePayment(connection, taxProof.receipt, row.id);
      assertLease(signals);
      const provisional: CheckoutCart = { ...cart, payment_collection: { ...cart.payment_collection!, payment_sessions: [{ id: row.id, provider_id: stripeProviderId, currency_code: "usd", amount: quotedCents / 100, status: row.status, data: row.data }] } };
      const fingerprint = paymentRecoveryFingerprint(await readNativePaymentRecovery(connection, provisional));
      assertLease(signals);
      return { row, fingerprint };
    });
    const { row: attempt } = reserved;
    assertLease(signals);
    // No mutable profile, address, browser data or implicit confirmation is
    // included, so every replay has exactly the same Stripe parameters.
    const created = verifyPaymentIntentBinding(await writer.createIntent({ amount: attempt.amount, currency: "usd", capture_method: "manual", automatic_payment_methods: { enabled: true }, metadata: { session_id: attempt.id } }, attempt.id), attempt, writer);
    assertLease(signals);
    // Creation responses can be cached by Stripe. Read the current status,
    // rather than overwrite newer provider state with a replayed response.
    const current = verifyPaymentIntentBinding(await writer.retrieveIntent(created.id), attempt, writer);
    if (current.id !== created.id) throw conflict();
    assertLease(signals);
    const provisional: CheckoutCart = { ...cart, payment_collection: { ...cart.payment_collection, payment_sessions: [{ id: attempt.id, provider_id: stripeProviderId, currency_code: "usd", amount: quotedCents / 100, status: attempt.status, data: attempt.data }] } };
    await db.transaction(async (connection) => {
      await lockPaymentRows(connection, provisional);
      assertLease(signals);
      const before = await readNativePaymentRecovery(connection, provisional);
      const row = await readAttempt(connection, attempt.id);
      assertAttempt(row, provisional, writer, quotedCents);
      if (paymentRecoveryFingerprint(before) !== reserved.fingerprint || JSON.stringify(row.data) !== JSON.stringify(attempt.data) || row.status !== attempt.status) throw conflict();
      const updated = await connection.raw(`update commerce.payment_session set data=?::jsonb,status=?,updated_at=now()
        where id=? and payment_collection_id=? and provider_id=? and status=? and authorized_at is null and deleted_at is null
        and amount=?::numeric/100 and currency_code='usd' and data=?::jsonb and metadata=?::jsonb returning id`, [JSON.stringify(current), nativePaymentSessionStatus(current.status), attempt.id, provisional.payment_collection!.id, stripeProviderId, attempt.status, attempt.amount, JSON.stringify(attempt.data), JSON.stringify(attempt.metadata)]);
      if (updated.rows.length !== 1) throw conflict();
      assertLease(signals);
    });
  } catch (error) {
    if (error instanceof MedusaError) throw error;
    throw unavailable();
  }
}
