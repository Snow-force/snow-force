import { BigNumber, MathBN } from "@medusajs/framework/utils";
import { z } from "zod";
import { orderPickupSelected } from "./local-pickup";

const amount = z.union([z.instanceof(BigNumber), z.number().finite(), z.string().regex(/^-?\d+(?:\.\d+)?$/)])
  .transform((value) => MathBN.convert(value)).refine((value) => MathBN.gte(value, 0) && MathBN.lte(value, 20_000_000));
const signedAmount = z.union([z.instanceof(BigNumber), z.number().finite(), z.string().regex(/^-?\d+(?:\.\d+)?$/)])
  .transform((value) => MathBN.convert(value)).refine((value) => MathBN.gte(value, -20_000_000) && MathBN.lte(value, 20_000_000));
const date = z.coerce.date().transform((value) => value.toISOString());
const text = z.string().max(300);
export const nativePaymentStatuses = ["not_paid", "awaiting", "authorized", "partially_authorized", "captured", "partially_captured", "partially_refunded", "refunded", "canceled", "requires_action"] as const;
export const nativeFulfillmentStatuses = ["not_fulfilled", "partially_fulfilled", "fulfilled", "partially_shipped", "shipped", "partially_delivered", "delivered", "canceled"] as const;
const nativeOrder = z.object({
  region_id: z.string().nullable().optional(), metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  shipping_methods: z.array(z.object({ shipping_option_id: z.string(), amount: amount.transform(value => MathBN.convert(value).toNumber()) })).optional(),
  id: z.string().regex(/^order_[A-Za-z0-9]+$/), customer_id: z.string().nullable(), version: z.coerce.number().int().positive(),
  display_id: z.union([z.number().int(), text]), custom_display_id: text.nullish(), status: z.enum(["pending", "completed", "draft", "archived", "canceled", "requires_action"]), currency_code: z.literal("usd"),
  payment_status: z.enum(nativePaymentStatuses), fulfillment_status: z.enum(nativeFulfillmentStatuses),
  item_subtotal: amount, shipping_subtotal: amount, tax_total: amount, discount_subtotal: amount, credit_line_total: signedAmount, total: amount,
  created_at: date, updated_at: date,
  items: z.array(z.object({
    id: text.min(1), product_handle: text.nullish(), product_title: text.nullish(), title: text, variant_title: text.nullish(),
    thumbnail: z.string().max(2000).nullish(), quantity: z.coerce.number().int().positive().max(10_000), unit_price: amount, subtotal: amount,
    detail: z.object({ return_received_quantity: z.coerce.number().int().nonnegative().default(0), return_dismissed_quantity: z.coerce.number().int().nonnegative().default(0) }).nullish(),
  })).min(1).max(100),
  shipping_address: z.object({ first_name: text.nullish(), last_name: text.nullish(), address_1: text, address_2: text.nullish(), city: text, province: text, postal_code: text, country_code: z.literal("us"), phone: text.nullish() }).nullable(),
  fulfillments: z.array(z.object({
    id: text.min(1), canceled_at: date.nullable(), shipped_at: date.nullable(), delivered_at: date.nullable(),
    items: z.array(z.object({ line_item_id: text.nullable() })),
    labels: z.array(z.object({ id: text.min(1), tracking_number: text, tracking_url: z.string().max(2000) })),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })).max(50),
});

export const orderSnapshotFields = ["region_id", "metadata", "shipping_methods.shipping_option_id", "shipping_methods.amount","id", "customer_id", "version", "status", "display_id", "custom_display_id", "currency_code", "item_subtotal", "shipping_subtotal", "tax_total", "discount_subtotal", "credit_line_total", "total", "created_at", "updated_at", "items.*", "items.detail.*", "shipping_address.*", "fulfillments.*", "fulfillments.items.*", "fulfillments.labels.*"];
const cents = (value: Parameters<typeof MathBN.mult>[0]) => Math.round(MathBN.mult(value, 100).toNumber());
function https(value: string) { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; } }

export function orderSnapshot(input: unknown, userId: string) {
  z.string().uuid().parse(userId);
  const order = nativeOrder.parse(input);
  // Keep native decimal arithmetic through validation; convert to integer USD cents only at the projection boundary.
  if (Math.abs(MathBN.sub(MathBN.sum(order.item_subtotal, order.shipping_subtotal, order.tax_total), order.discount_subtotal, order.credit_line_total, order.total).toNumber()) > 0.000001) throw new Error("Inconsistent native order total");
  if (Math.abs(MathBN.sub(MathBN.sum(...order.items.map((item) => item.subtotal)), order.item_subtotal).toNumber()) > 0.000001) throw new Error("Inconsistent native item total");
  if (new Set(order.items.map((item) => item.id)).size !== order.items.length) throw new Error("Duplicate native line item");
  if (order.items.some((item) => (item.detail?.return_received_quantity ?? 0) + (item.detail?.return_dismissed_quantity ?? 0) > item.quantity)) throw new Error("Invalid returned quantity");
  if (order.fulfillments.reduce((sum, fulfillment) => sum + (fulfillment.canceled_at ? 0 : Math.max(1, fulfillment.labels.length)), 0) > 50) throw new Error("Too many shipment labels");
  const subtotal = cents(order.item_subtotal);
  const allocated = order.items.map((item) => Math.floor(MathBN.mult(item.subtotal, 100).toNumber()));
  const remainder = subtotal - allocated.reduce((sum, value) => sum + value, 0);
  if (remainder < 0 || remainder > allocated.length) throw new Error("Invalid rounding allocation");
  const indices = order.items.map((item, index) => ({ index, fraction: MathBN.sub(MathBN.mult(item.subtotal, 100), allocated[index]).toNumber() })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) allocated[indices[i].index]++;
  const shipping = cents(order.shipping_subtotal), tax = cents(order.tax_total), discount = cents(order.discount_subtotal), credit = cents(order.credit_line_total), total = cents(order.total);
  const rounding = total - (subtotal + shipping + tax - discount - credit);
  if (Math.abs(rounding) > 3) throw new Error("Invalid rounding total");
  const status = order.status === "canceled" ? "cancelled" : order.payment_status === "refunded" ? "refunded" : order.fulfillment_status === "delivered" ? "delivered" : ["shipped", "partially_shipped", "partially_delivered"].includes(order.fulfillment_status) ? "shipped" : ["authorized", "captured", "partially_refunded"].includes(order.payment_status) ? "processing" : "pending";
  const ids = new Set(order.items.map((item) => item.id));
  const address = order.shipping_address;
  const pickup = orderPickupSelected({ ...order, shipping_address: address ? { first_name: address.first_name ?? "", last_name: address.last_name ?? null, address_1: address.address_1, address_2: address.address_2 ?? null, city: address.city, province: address.province, postal_code: address.postal_code, country_code: address.country_code, phone: address.phone ?? "" } : null }, shipping);
  return {
    id: order.id, user_id: userId, order_number: order.custom_display_id || String(order.display_id), status, currency: "usd" as const,
    subtotal_cents: subtotal, shipping_cents: shipping, tax_cents: tax, discount_cents: discount, credit_cents: credit, rounding_cents: rounding, total_cents: total,
    native_version: order.version, payment_status: order.payment_status, fulfillment_status: order.fulfillment_status,
    items: order.items.map((item, index) => ({ id: item.id, productSlug: item.product_handle && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.product_handle) ? item.product_handle : null, name: { en: item.product_title || item.title, zh: item.product_title || item.title }, variant: { en: item.variant_title ?? "", zh: item.variant_title ?? "" }, image: item.thumbnail?.startsWith("/") && !item.thumbnail.startsWith("//") ? item.thumbnail : https(item.thumbnail ?? "") ?? "", quantity: item.quantity, returnedQuantity: (item.detail?.return_received_quantity ?? 0) + (item.detail?.return_dismissed_quantity ?? 0), unitPriceCents: cents(item.unit_price), totalCents: allocated[index] })),
    shipments: order.fulfillments.filter((fulfillment) => !fulfillment.canceled_at).flatMap((fulfillment) => {
      const carrier = typeof fulfillment.metadata?.carrier === "string" ? fulfillment.metadata.carrier.slice(0, 300) : "";
      const common = { carrier, status: fulfillment.delivered_at ? "delivered" : fulfillment.shipped_at ? "shipped" : "preparing", shippedAt: fulfillment.shipped_at, deliveredAt: fulfillment.delivered_at, itemIds: [...new Set(fulfillment.items.flatMap((item) => item.line_item_id && ids.has(item.line_item_id) ? [item.line_item_id] : []))] };
      return fulfillment.labels.length ? fulfillment.labels.map((label) => ({ ...common, id: label.id, trackingNumber: label.tracking_number, trackingUrl: https(label.tracking_url) })) : [{ ...common, id: fulfillment.id, trackingNumber: "", trackingUrl: null }];
    }),
    shipping_address: address ? { ...(pickup ? { pickup: true } : {}), name: [address.first_name, address.last_name].filter(Boolean).join(" "), address1: address.address_1, address2: address.address_2 ?? "", city: address.city, state: address.province.toUpperCase(), postalCode: address.postal_code, countryCode: "US" as const } : null,
    created_at: order.created_at, updated_at: order.updated_at,
  };
}
