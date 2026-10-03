import { createHash } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MathBN, MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "zod";
import { checkoutCartSchema, checkoutFields, checkoutFingerprint, stripeProviderId } from "./checkout-policy";
import { createStripePaymentCreator, nativePaymentSessionStatus, verifyPaymentIntentBinding } from "./payment-creation";
import { paymentRecoveryFingerprint, readNativePaymentRecovery, type PaymentRecoveryConnection } from "./payment-recovery";
import { assertAcceptedShopPolicy } from "./policy-consent";

const creationKey = "snowforce_payment_creation", associationKey = "snowforce_payment_association";
const hash = z.string().regex(/^[a-f0-9]{64}$/), sessionId = z.string().regex(/^payses_[A-Za-z0-9]+$/), intentId = z.string().regex(/^pi_[A-Za-z0-9]+$/);
const cents = z.coerce.number().finite().nonnegative().transform(value => MathBN.mult(value, 100).toNumber()).refine(Number.isSafeInteger);
const timestamp = z.union([z.string(), z.date()]).transform(value => new Date(value).toISOString());
const associationSchema = z.object({ request_id: z.string().uuid(), actor_id: z.string(), intent_id: intentId, original_fingerprint: hash, verified_fingerprint: hash, associated_at: timestamp });
const rowSchema = z.object({
  id: sessionId, collection_id: z.string(), provider_id: z.literal(stripeProviderId), currency_code: z.literal("usd"), amount_cents: cents,
  status: z.string(), created_at: timestamp, updated_at: timestamp, database_now: timestamp, authorized: z.boolean(), pending: z.boolean(), intent_id: z.string().nullable(),
  attempt: z.object({ version: z.literal(1), cart_id: z.string(), customer_id: z.string(), quote: hash, livemode: z.boolean(), namespace: hash }),
  data_hash: z.string(), metadata_hash: z.string(), raw_hash: z.string(),
  association: associationSchema.nullable(),
  links: z.array(z.object({ cart_id: z.string(), customer_id: z.string().nullable(), retired: z.boolean(), cart_completed: z.boolean(), cart_deleted: z.boolean(), has_order: z.boolean(), has_payment: z.boolean() })).max(100),
});
type NativeRow = z.infer<typeof rowSchema>;
export type PaymentOperationsReader = { livemode: boolean; namespace: string; retrieveIntent: (id: string) => Promise<unknown> };
const unavailable = () => new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment review is unavailable. No payment was created, canceled, captured or refunded.");
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Payment facts changed or do not match. Reload and verify the payment again.");
function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter valid payment review details.");
  return result.data;
}
export function paymentAdminActor(auth: AuthContext | undefined) {
  if (auth?.actor_type !== "user" || !/^user_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to the shop admin.");
  return auth.actor_id;
}
function assertLease(signals: readonly (AbortSignal | undefined)[]) { if (signals.some(signal => signal?.aborted)) throw conflict(); }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function paymentOperationsFingerprint(row: NativeRow) { return digest({ ...row, database_now: undefined }); }
function reader(): PaymentOperationsReader { const value = createStripePaymentCreator(); return { livemode: value.livemode, namespace: value.namespace, retrieveIntent: value.retrieveIntent }; }
const connection = (scope: MedusaContainer) => scope.resolve<PaymentRecoveryConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const select = `select s.id,s.payment_collection_id as collection_id,s.provider_id,s.currency_code,s.amount as amount_cents,s.status,
  s.created_at,s.updated_at,current_timestamp as database_now,s.authorized_at is not null as authorized,
  coalesce(s.data->'snowforce_payment_creation_pending'='true'::jsonb,false) as pending,s.data->>'id' as intent_id,
  s.metadata->'snowforce_payment_creation' as attempt,s.metadata->'snowforce_payment_association' as association,
  md5(s.data::text) as data_hash,md5(coalesce(s.metadata,'{}'::jsonb)::text) as metadata_hash,md5(s.raw_amount::text) as raw_hash,
  coalesce((select jsonb_agg(jsonb_build_object('cart_id',l.cart_id,'customer_id',c.customer_id,'retired',l.deleted_at is not null,
    'cart_completed',c.completed_at is not null,'cart_deleted',c.id is null or c.deleted_at is not null,
    'has_order',exists(select 1 from commerce.order_cart oc where oc.cart_id=l.cart_id),
    'has_payment',exists(select 1 from commerce.payment p where p.payment_collection_id=s.payment_collection_id)) order by l.id)
    from commerce.cart_payment_collection l left join commerce.cart c on c.id=l.cart_id where l.payment_collection_id=s.payment_collection_id),'[]'::jsonb) as links
  from commerce.payment_session s where s.provider_id=? and s.deleted_at is null and s.metadata->'snowforce_payment_creation'->>'version'='1'`;
async function readRow(db: PaymentRecoveryConnection, value: string) {
  const { rows } = await db.raw(`${select} and s.id=?`, [stripeProviderId, value]);
  if (!rows.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment attempt not found.");
  return z.array(rowSchema).length(1).parse(rows)[0];
}
function safeRow(row: NativeRow) {
  const active = row.links.filter(link => !link.retired), link = active[0] ?? row.links[0];
  const age = Date.parse(row.database_now) - Date.parse(row.created_at);
  const eligible = row.amount_cents > 0 && ["pending", "requires_more", "error"].includes(row.status) && row.pending && !row.intent_id && !row.authorized && active.length === 1 && row.links.length === 1 && !active[0].cart_completed && !active[0].cart_deleted && !active[0].has_order && !active[0].has_payment;
  return { id: row.id, collectionId: row.collection_id, cartId: link?.cart_id ?? null, customerId: link?.customer_id ?? null, amountCents: row.amount_cents, currency: "usd" as const, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, livemode: row.attempt.livemode, intentId: intentId.safeParse(row.intent_id).success ? row.intent_id : null, interrupted: row.pending && !row.intent_id, expired: age >= 22 * 60 * 60 * 1000, eligible, retired: !active.length, fingerprint: paymentOperationsFingerprint(row), association: row.association ? { actorId: row.association.actor_id, associatedAt: row.association.associated_at, intentId: row.association.intent_id } : null };
}
export type PaymentOperationsRecord = ReturnType<typeof safeRow>;
export async function listPaymentOperations(scope: MedusaContainer, auth: AuthContext | undefined, filter: unknown, offset: unknown) {
  paymentAdminActor(auth);
  const state = parse(z.enum(["interrupted", "all"]).default("interrupted"), filter);
  const page = parse(z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number).pipe(z.number().int().min(0).max(1_000_000)).default(0), offset);
  try {
    const where = state === "interrupted" ? " and coalesce(s.data->'snowforce_payment_creation_pending'='true'::jsonb,false) and s.data->>'id' is null" : "";
    const result = await connection(scope).raw(`with attempts as (${select}${where}), page as (select * from attempts order by created_at,id limit 50 offset ?)
      select coalesce((select jsonb_agg(page order by created_at,id) from page),'[]'::jsonb) as records,(select count(*) from attempts) as count`, [stripeProviderId, page]);
    const row = z.object({ records: z.array(rowSchema), count: z.coerce.number().int().nonnegative().safe() }).parse(result.rows[0]);
    return { records: row.records.map(safeRow), count: row.count, offset: page, limit: 50 };
  } catch (error) { if (error instanceof MedusaError) throw error; throw unavailable(); }
}
export async function paymentOperationDetail(scope: MedusaContainer, auth: AuthContext | undefined, value: unknown) {
  paymentAdminActor(auth); const id = parse(sessionId, value);
  try { return { record: safeRow(await readRow(connection(scope), id)) }; }
  catch (error) { if (error instanceof MedusaError) throw error; throw unavailable(); }
}
const command = z.discriminatedUnion("command", [
  z.object({ command: z.literal("inspect"), intentId, fingerprint: hash }).strict(),
  z.object({ command: z.literal("associate"), intentId, fingerprint: hash, verifiedFingerprint: hash, requestId: z.string().uuid(), confirmed: z.literal(true) }).strict(),
]);
async function inspect(row: NativeRow, value: string, api: PaymentOperationsReader) {
  if (row.attempt.livemode !== api.livemode || row.attempt.namespace !== api.namespace || (row.intent_id && row.intent_id !== value)) throw conflict();
  const remote = verifyPaymentIntentBinding(await api.retrieveIntent(value), { id: row.id, amount: row.amount_cents }, api);
  if (remote.id !== value) throw conflict();
  const facts = { intentId: remote.id, sessionId: remote.metadata.session_id, amountCents: remote.amount, livemode: remote.livemode, status: remote.status, receivedCents: remote.amount_received, capturableCents: remote.amount_capturable };
  return { data: remote, preview: { ...facts, verifiedFingerprint: digest(facts) } };
}
export type PaymentOperationsPreview = Awaited<ReturnType<typeof inspect>>["preview"];
export async function changePaymentOperation(scope: MedusaContainer, auth: AuthContext | undefined, value: unknown, raw: unknown, injected?: PaymentOperationsReader) {
  const actorId = paymentAdminActor(auth), id = parse(sessionId, value), input = parse(command, raw);
  try {
    const db = connection(scope), initial = await readRow(db, id);
    const audit = initial.association;
    if (input.command === "associate" && audit?.request_id === input.requestId) {
      if (audit.actor_id !== actorId || audit.intent_id !== input.intentId || audit.original_fingerprint !== input.fingerprint || audit.verified_fingerprint !== input.verifiedFingerprint || initial.intent_id !== input.intentId) throw conflict();
      return { record: safeRow(initial), associated: true, replayed: true };
    }
    if (paymentOperationsFingerprint(initial) !== input.fingerprint) throw conflict();
    const api = injected ?? reader();
    if (input.command === "inspect") {
      const result = await inspect(initial, input.intentId, api);
      return { record: safeRow(initial), preview: result.preview, associated: false, replayed: false };
    }
    if (!safeRow(initial).eligible || initial.association || !["pending", "requires_more", "error"].includes(initial.status)) throw conflict();
    const cartId = initial.links[0].cart_id;
    const locking = scope.resolve<ILockingModule>(Modules.LOCKING);
    return await locking.execute(`snowforce-checkout:${cartId}`, async signal => locking.execute(cartId, async cartSignal => {
      const signals = [signal, cartSignal]; assertLease(signals);
      const row = await readRow(db, id);
      if (paymentOperationsFingerprint(row) !== input.fingerprint || !safeRow(row).eligible) throw conflict();
      const query = scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: carts } = await query.graph({ entity: "cart", fields: checkoutFields, filters: { id: cartId } });
      const cart = checkoutCartSchema.parse(carts[0]);
      if (cart.customer_id !== row.attempt.customer_id || row.attempt.cart_id !== cart.id || row.attempt.quote !== checkoutFingerprint(cart) || cart.payment_collection?.id !== row.collection_id) throw conflict();
      await assertAcceptedShopPolicy(cart, scope);
      assertLease(signals);
      const originalNative = await readNativePaymentRecovery(db, cart);
      if (originalNative.collections.length !== 1 || originalNative.collections[0].sessions.length !== 1 || originalNative.collections[0].sessions[0].id !== id || originalNative.collections[0].sessions[0].intent_id !== null) throw conflict();
      const result = await inspect(row, input.intentId, api);
      assertLease(signals);
      if (result.preview.verifiedFingerprint !== input.verifiedFingerprint) throw conflict();
      return db.transaction(async transaction => {
        await transaction.raw("select id from commerce.cart where id=? and deleted_at is null for update", [cart.id]);
        await transaction.raw("select id from commerce.payment_collection where id=? and deleted_at is null for update", [row.collection_id]);
        await transaction.raw("select id from commerce.payment_session where payment_collection_id=? order by id for update", [row.collection_id]);
        assertLease(signals);
        const current = await readRow(transaction, id);
        if (paymentOperationsFingerprint(current) !== input.fingerprint || !safeRow(current).eligible) throw conflict();
        const native = await readNativePaymentRecovery(transaction, cart);
        if (paymentRecoveryFingerprint(native) !== paymentRecoveryFingerprint(originalNative)) throw conflict();
        const savedAudit = { request_id: input.requestId, actor_id: actorId, intent_id: input.intentId, original_fingerprint: input.fingerprint, verified_fingerprint: input.verifiedFingerprint, associated_at: new Date().toISOString() };
        const updated = await transaction.raw(`update commerce.payment_session set data=?::jsonb,status=?,metadata=jsonb_set(metadata,'{snowforce_payment_association}',?::jsonb),updated_at=now()
          where id=? and payment_collection_id=? and provider_id=? and currency_code='usd' and amount=?::numeric/100
          and status=? and authorized_at is null and deleted_at is null and md5(data::text)=? and md5(metadata::text)=? and md5(raw_amount::text)=? returning id`, [JSON.stringify(result.data), nativePaymentSessionStatus(result.data.status), JSON.stringify(savedAudit), id, row.collection_id, stripeProviderId, row.amount_cents, row.status, row.data_hash, row.metadata_hash, row.raw_hash]);
        if (updated.rows.length !== 1) throw conflict();
        assertLease(signals);
        const adopted = await readRow(transaction, id);
        if (adopted.intent_id !== result.preview.intentId || adopted.association?.request_id !== input.requestId) throw conflict();
        assertLease(signals);
        return { record: safeRow(adopted), associated: true, replayed: false };
      });
    }, { timeout: 15, expire: 120 }), { timeout: 15, expire: 120 });
  } catch (error) { if (error instanceof MedusaError) throw error; throw unavailable(); }
}
