import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import type { CheckoutCart } from "./checkout-policy";
import { assertPersistedCartTaxQuote } from "./tax-quote-ledger";
import { assertActiveStripeTaxSetup } from "./tax-setup";
import { exactTaxUsdCents, taxUsdAmount } from "./tax-quote-money";
import { readNativePaymentRecovery, type PaymentRecoveryConnection } from "./payment-recovery";

const fail = () => new MedusaError(MedusaError.Types.CONFLICT, "Payment money no longer matches the verified tax quote.");
const guardSchema = z.object({
  id: z.string(), link_id: z.string(), customer_id: z.string(), currency_code: z.literal("usd"),
  amount: taxUsdAmount, raw_amount: z.object({ value: z.string(), precision: z.number().int() }),
  raw_fingerprint: z.string().regex(/^[a-f0-9]{32}$/), receipt_signature: z.string(),
  status: z.enum(["not_paid", "awaiting", "failed", "canceled"]), completed: z.literal(false),
  authorized_amount: taxUsdAmount, captured_amount: taxUsdAmount, refunded_amount: taxUsdAmount,
  session_count: z.coerce.number().int().nonnegative(), collection_count: z.coerce.number().int().nonnegative(),
  has_order: z.literal(false), has_payment: z.literal(false), has_authorization: z.literal(false),
});
function assertLease(signals: readonly (AbortSignal | undefined)[]) {
  if (signals.some(signal => signal?.aborted)) throw fail();
}

/** Caller holds both checkout and native cart leases. Only empty, unfunded
 * collections may be converted from native float-rate totals to quote cents. */
export async function normalizeQuotedPaymentCollection(cart: CheckoutCart, scope: MedusaContainer, signals: readonly (AbortSignal | undefined)[] = []): Promise<CheckoutCart> {
  try {
    assertLease(signals);
    const { receipt } = await assertPersistedCartTaxQuote(cart, scope, await assertActiveStripeTaxSetup(scope), "create_payment");
    const collection = cart.payment_collection;
    if (!collection || collection.currency_code !== "usd") throw fail();
    const quoted = receipt.total_cents / 100;
    if (collection.amount !== cart.total && collection.amount !== quoted) throw fail();
    const db = scope.resolve<PaymentRecoveryConnection>(ContainerRegistrationKeys.PG_CONNECTION);
    return await db.transaction(async connection => {
      await connection.raw("set local lock_timeout='5s'");
      await connection.raw("select id from commerce.cart where id=? and deleted_at is null for update", [cart.id]);
      await connection.raw("select id from commerce.cart_payment_collection where cart_id=? and deleted_at is null order by id for update", [cart.id]);
      await connection.raw("select id from commerce.payment_collection where id=? and deleted_at is null for update", [collection.id]);
      await connection.raw("select id from commerce.payment_session where payment_collection_id=? order by id for update", [collection.id]);
      assertLease(signals);
      const { rows } = await connection.raw(`select pc.id,l.id as link_id,c.customer_id,pc.currency_code,pc.amount,pc.raw_amount,
        md5(pc.raw_amount::text) as raw_fingerprint,c.metadata->'snowforce_tax_quote'->>'signature' as receipt_signature,
        pc.status,(pc.completed_at is not null or c.completed_at is not null) as completed,
        coalesce(pc.authorized_amount,0) as authorized_amount,coalesce(pc.captured_amount,0) as captured_amount,coalesce(pc.refunded_amount,0) as refunded_amount,
        (select count(*) from commerce.payment_session s where s.payment_collection_id=pc.id) as session_count,
        (select count(*) from commerce.cart_payment_collection other where other.cart_id=c.id and other.deleted_at is null) as collection_count,
        exists(select 1 from commerce.order_cart oc where oc.cart_id=c.id) as has_order,
        exists(select 1 from commerce.payment p where p.payment_collection_id=pc.id) as has_payment,
        exists(select 1 from commerce.payment_session s where s.payment_collection_id=pc.id and s.authorized_at is not null) as has_authorization
        from commerce.cart c join commerce.cart_payment_collection l on l.cart_id=c.id
        join commerce.payment_collection pc on pc.id=l.payment_collection_id
        where c.id=? and c.currency_code='usd' and c.deleted_at is null and l.deleted_at is null and pc.deleted_at is null`, [cart.id]);
      const guard = z.array(guardSchema).length(1).parse(rows)[0];
      if (guard.id !== collection.id || guard.customer_id !== cart.customer_id || guard.receipt_signature !== receipt.signature || guard.collection_count !== 1 || Number(guard.amount) !== collection.amount || !MathBN.eq(guard.amount, guard.raw_amount.value) || [guard.authorized_amount, guard.captured_amount, guard.refunded_amount].some(value => !MathBN.eq(value, 0))) throw fail();
      assertLease(signals);
      if (!MathBN.eq(guard.amount, quoted)) {
        if (guard.session_count || collection.payment_sessions.length) throw fail();
        const decimal = `${Math.floor(receipt.total_cents / 100)}.${String(receipt.total_cents % 100).padStart(2, "0")}`;
        const updated = await connection.raw(`update commerce.payment_collection pc set amount=?::numeric/100,raw_amount=?::jsonb,updated_at=now()
          where pc.id=? and pc.currency_code='usd' and pc.amount=?::numeric and md5(pc.raw_amount::text)=?
          and pc.completed_at is null and pc.deleted_at is null and coalesce(pc.authorized_amount,0)=0
          and coalesce(pc.captured_amount,0)=0 and coalesce(pc.refunded_amount,0)=0
          and not exists(select 1 from commerce.payment_session s where s.payment_collection_id=pc.id)
          and not exists(select 1 from commerce.payment p where p.payment_collection_id=pc.id)
          and not exists(select 1 from commerce.order_cart oc where oc.cart_id=?)
          and exists(select 1 from commerce.cart_payment_collection l join commerce.cart c on c.id=l.cart_id
            where l.id=? and l.cart_id=? and l.payment_collection_id=pc.id and l.deleted_at is null
            and c.customer_id=? and c.completed_at is null and c.deleted_at is null
            and c.metadata->'snowforce_tax_quote'->>'signature'=?) returning pc.id`,
          [receipt.total_cents, JSON.stringify({ value: decimal, precision: 20 }), collection.id, String(guard.amount), guard.raw_fingerprint, cart.id, guard.link_id, cart.id, cart.customer_id!, receipt.signature]);
        if (updated.rows.length !== 1) throw fail();
      }
      const current: CheckoutCart = { ...cart, payment_collection: { ...collection, amount: quoted } };
      if (exactTaxUsdCents(current.payment_collection!.amount) !== receipt.total_cents) throw fail();
      await readNativePaymentRecovery(connection, current);
      assertLease(signals);
      return current;
    });
  } catch (error) { if (error instanceof MedusaError) throw error; throw fail(); }
}
