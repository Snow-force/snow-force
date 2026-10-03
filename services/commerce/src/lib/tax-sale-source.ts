import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import { checkoutCartSchema, checkoutFields } from "./checkout-policy";
import { readHistoricalNativeTaxQuote, type TaxQuoteConnection } from "./tax-quote-ledger";
import { exactTaxUsdCents } from "./tax-quote-money";
import { checkedTaxSaleSource, saleOrderId, TaxSaleConflict, taxSaleFingerprint } from "./tax-sale-contract";

const money = z.unknown().transform(exactTaxUsdCents), epoch = z.coerce.number().int().positive().safe();
const rowSchema = z.object({ order_id: saleOrderId, customer_id: z.string(), currency_code: z.literal("usd"), order_receipt: z.unknown(),
  cart_id: z.string(), session_id: z.string(), payment_id: z.string(), amount: money, raw_amount: z.object({ value: money }),
  provider_id: z.literal("pp_stripe_stripe"), payment_currency: z.literal("usd"), data: z.object({ id: z.string().regex(/^pi_[A-Za-z0-9]+$/), currency: z.literal("usd"), livemode: z.boolean(), metadata: z.object({ session_id: z.string() }) }),
  captures: z.array(z.object({ id: z.string(), amount: money, raw_amount: z.object({ value: money }), created_at: epoch })).length(1),
  payment_count: z.coerce.number().int(), order_cart_count: z.coerce.number().int(), cart_order_count: z.coerce.number().int(), collection_order_count: z.coerce.number().int(),
});
/** Original completed cart + immutable application + native capture, not mutable product prices or order status. */
export async function readCapturedTaxSale(scope: MedusaContainer, rawOrderId: unknown) {
  const orderId = saleOrderId.parse(rawOrderId), db = scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  const result = await db.raw(`select o.id as order_id,o.customer_id,o.currency_code,o.metadata->'snowforce_tax_quote' as order_receipt,
    oc.cart_id,p.id as payment_id,p.payment_session_id as session_id,p.amount,p.raw_amount,p.provider_id,p.currency_code as payment_currency,p.data,
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'amount',c.amount,'raw_amount',c.raw_amount,'created_at',floor(extract(epoch from c.created_at))) order by c.id)
      from commerce.capture c where c.payment_id=p.id and c.deleted_at is null),'[]'::jsonb) as captures,
    (select count(*) from commerce.payment p2 join commerce.order_payment_collection l2 on l2.payment_collection_id=p2.payment_collection_id where l2.order_id=o.id and l2.deleted_at is null and p2.deleted_at is null) as payment_count,
    (select count(*) from commerce.order_cart l where l.order_id=o.id and l.deleted_at is null) as order_cart_count,
    (select count(*) from commerce.order_cart l where l.cart_id=oc.cart_id and l.deleted_at is null) as cart_order_count,
    (select count(*) from commerce.order_payment_collection l where l.payment_collection_id=p.payment_collection_id and l.deleted_at is null) as collection_order_count
    from commerce."order" o join commerce.order_cart oc on oc.order_id=o.id and oc.deleted_at is null
    join commerce.order_payment_collection opc on opc.order_id=o.id and opc.deleted_at is null
    join commerce.payment p on p.payment_collection_id=opc.payment_collection_id and p.deleted_at is null
    where o.id=? and o.deleted_at is null`, [orderId]);
  const row = z.array(rowSchema).length(1).parse(result.rows)[0];
  if ([row.payment_count, row.order_cart_count, row.cart_order_count, row.collection_order_count].some(count => count !== 1)) throw new TaxSaleConflict();
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields: checkoutFields, filters: { id: row.cart_id } });
  const cart = checkoutCartSchema.parse(z.array(z.unknown()).length(1).parse(data)[0]);
  const { quote, receipt, proof } = await readHistoricalNativeTaxQuote(cart, scope), capture = row.captures[0];
  const session = z.object({ data: z.object({ id: z.literal(row.data.id) }), created_at: epoch, amount: money,
    metadata: z.object({ snowforce_payment_creation: z.object({ cart_id: z.literal(cart.id), customer_id: z.literal(row.customer_id), quote: z.literal(receipt.checkout_fingerprint), livemode: z.literal(quote.livemode) }) }),
  }).parse(proof.payment);
  if (!cart.completed_at || cart.customer_id !== row.customer_id || row.data.metadata.session_id !== row.session_id || proof.payment_session_id !== row.session_id ||
    !proof.bound_at || proof.bound_at < quote.tax_date || proof.bound_at >= quote.expires_at || session.created_at < quote.tax_date || session.created_at > proof.bound_at || session.amount !== quote.amounts.total_cents ||
    row.data.livemode !== quote.livemode || row.amount !== quote.amounts.total_cents || row.raw_amount.value !== row.amount ||
    capture.amount !== row.amount || capture.raw_amount.value !== capture.amount || taxSaleFingerprint(row.order_receipt) !== taxSaleFingerprint(receipt)) throw new TaxSaleConflict();
  return checkedTaxSaleSource({ schema_version: 1, order_id: orderId, cart_id: cart.id, customer_id: cart.customer_id, quote_id: receipt.quote_id,
    payment_id: row.payment_id, session_id: row.session_id, capture_id: capture.id, intent_id: row.data.id, captured_at: capture.created_at,
    receipt, input: quote.input, calculation: proof.calculation,
  }).source;
}
