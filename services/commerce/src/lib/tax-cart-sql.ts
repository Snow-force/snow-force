import { createRawPropertiesFromBigNumber, decorateCartTotals } from "@medusajs/framework/utils";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { taxUsdAmount } from "./tax-quote-money";

const adjustment = z.object({ amount: taxUsdAmount }).passthrough();
const taxes = z.array(z.object({ rate: taxUsdAmount }).passthrough());
const sqlCart = z.object({
  currency_code: z.literal("usd"), credit_lines: z.array(z.object({ amount: taxUsdAmount })).length(0),
  items: z.array(z.object({ unit_price: taxUsdAmount, quantity: z.number().int().positive(), adjustments: z.array(adjustment), tax_lines: taxes }).passthrough()),
  shipping_methods: z.array(z.object({ amount: taxUsdAmount, adjustments: z.array(adjustment), tax_lines: taxes }).passthrough()),
}).passthrough();

async function readCartSnapshot(db: TaxQuoteConnection, cartId: string, customerId?: string) {
  // Read-only snapshots must include every session's presence, including retired
  // rows, without selecting its provider data or metadata. The locked reader's
  // caller has already proved that no linked session or funds exist.
  const collection = customerId === undefined
    ? "to_jsonb(p)||jsonb_build_object('payment_sessions','[]'::jsonb)"
    : `jsonb_build_object('id',p.id,'amount',p.amount,'currency_code',p.currency_code,'payment_sessions',
      coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'provider_id',s.provider_id,'amount',s.amount,
        'currency_code',s.currency_code,'status',s.status,'data',null,'metadata',null) order by s.id)
        from commerce.payment_session s where s.payment_collection_id=p.id),'[]'::jsonb))`;
  const result = await db.raw(`select to_jsonb(c)||jsonb_build_object(
    'shipping_address',(select to_jsonb(a) from commerce.cart_address a where a.id=c.shipping_address_id and a.deleted_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object(
      'adjustments',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from commerce.cart_line_item_adjustment a where a.item_id=i.id and a.deleted_at is null),'[]'::jsonb),
      'tax_lines',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from commerce.cart_line_item_tax_line t where t.item_id=i.id and t.deleted_at is null),'[]'::jsonb)) order by i.id)
      from commerce.cart_line_item i where i.cart_id=c.id and i.deleted_at is null),'[]'::jsonb),
    'shipping_methods',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
      'adjustments',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from commerce.cart_shipping_method_adjustment a where a.shipping_method_id=s.id and a.deleted_at is null),'[]'::jsonb),
      'tax_lines',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from commerce.cart_shipping_method_tax_line t where t.shipping_method_id=s.id and t.deleted_at is null),'[]'::jsonb)) order by s.id)
      from commerce.cart_shipping_method s where s.cart_id=c.id and s.deleted_at is null),'[]'::jsonb),
    'credit_lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from commerce.credit_line l where l.cart_id=c.id and l.deleted_at is null),'[]'::jsonb),
    'payment_collection',(select ${collection} from commerce.payment_collection p join commerce.cart_payment_collection l on l.payment_collection_id=p.id where l.cart_id=c.id and l.deleted_at is null and p.deleted_at is null)
  ) as cart from commerce.cart c where c.id=? and c.deleted_at is null${customerId === undefined ? "" : " and c.customer_id=?"}`, customerId === undefined ? [cartId] : [cartId, customerId]);
  const row = z.array(z.object({ cart: sqlCart })).length(1).parse(result.rows)[0];
  if (customerId !== undefined) z.object({ id: z.literal(cartId), customer_id: z.literal(customerId) }).parse(row.cart);
  // Exactly the amount engine used by installed CartModule.retrieveCart, with the same raw properties.
  decorateCartTotals(row.cart);
  createRawPropertiesFromBigNumber(row.cart);
  return row.cart;
}

/** Only use after unpaid-cart row locks; this connection sees the writes in the same transaction. */
export async function readTaxCartSql(db: TaxQuoteConnection, cartId: string) {
  return readCartSnapshot(db, cartId);
}

/** One fresh MVCC snapshot, restricted to the authenticated owner in SQL.
 * It never grants write permission: native leases, row locks and final financial
 * source checks remain mandatory before every tax or payment mutation.
 */
export async function readOwnedTaxCartSnapshot(db: TaxQuoteConnection, cartId: string, customerId: string) {
  z.string().regex(/^cart_[A-Za-z0-9]+$/).parse(cartId);
  z.string().regex(/^cus_[A-Za-z0-9]+$/).parse(customerId);
  return readCartSnapshot(db, cartId, customerId);
}

/** SHARE prevents both row edits and new source rows during the short local-only application. */
export async function lockTaxApplicationSources(db: TaxQuoteConnection) {
  await db.raw("set local lock_timeout='5s'");
  await db.raw(`lock table commerce.store,commerce.product,commerce.product_variant,
    commerce.stock_location,commerce.stock_location_address,commerce.region,commerce.region_country,
    commerce.shipping_option,commerce.shipping_option_rule,commerce.shipping_option_type,commerce.service_zone,commerce.geo_zone,
    commerce.shipping_option_price_set,commerce.product_variant_price_set,commerce.price_set,commerce.price,commerce.price_rule,
    commerce.price_list,commerce.price_list_rule,commerce.price_preference in share mode`);
}
