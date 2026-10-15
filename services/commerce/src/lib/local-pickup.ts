import { createHmac, timingSafeEqual } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import type { CheckoutCart } from "./checkout-policy";
import { readShippingPolicy, snowforcePickupCode, snowforceShippingProviderId } from "./shipping-policy";

export const pickupConfirmationKey = "snowforce_pickup_confirmation";
export const pickupContactSchema = z.object({
  name: z.string().trim().min(1).max(100), phone: z.string().trim().min(7).max(30).regex(/^[+\d\s().-]+$/), appointmentConfirmed: z.literal(true),
}).strict();
const pointAddress = z.object({ address_1: z.string().trim().min(1).max(200), address_2: z.string().nullable().default(null), city: z.string().trim().min(1).max(100), province: z.literal("ca"), postal_code: z.string().regex(/^\d{5}(?:-\d{4})?$/), country_code: z.literal("us") });
const offerSchema = z.object({ id: z.string().regex(/^so_[A-Za-z0-9]+$/), locationId: z.string().regex(/^sloc_[A-Za-z0-9]+$/), name: z.string().min(1).max(300), address: pointAddress }).strict();
export type PickupOffer = z.infer<typeof offerSchema>;
type PickupConnection = { raw(sql: string, values: string[]): Promise<{ rows: unknown[] }> };
export async function persistPickupOption(db: PickupConnection, input: { storeId: string; locationId: string; serviceZoneId: string; optionId: string }) {
  // A concurrent policy/tax review owns other Store metadata keys. Never write
  // an earlier full metadata snapshot over those newer administrative records.
  const saved = await db.raw(`update commerce.store set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{snowforce_pickup_option_id}',to_jsonb(?::text),true),updated_at=clock_timestamp()
    where id=? and deleted_at is null and metadata->>'snowforce_fulfillment_location_id'=? and metadata->>'snowforce_service_zone_id'=?
    and (metadata->>'snowforce_pickup_option_id' is null or metadata->>'snowforce_pickup_option_id'=?) returning id`, [input.optionId, input.storeId, input.locationId, input.serviceZoneId, input.optionId]);
  if (saved.rows.length !== 1) throw new Error("Warehouse or pickup configuration changed. Reload before enabling pickup.");
}
type PickupCart = Pick<CheckoutCart, "id" | "customer_id" | "region_id" | "shipping_address" | "shipping_methods" | "metadata">;

/** An operator-created option at the reviewed warehouse is the only pickup point.
 * Its address and free price are never supplied by a storefront customer. */
export async function readPickupOffer(container: MedusaContainer): Promise<PickupOffer | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: stores } = await query.graph({ entity: "store", fields: ["id", "default_location_id", "default_sales_channel_id", "metadata"] });
  const store = z.array(z.object({ default_location_id: z.string().nullable(), default_sales_channel_id: z.string().nullable(), metadata: z.record(z.string(), z.unknown()).nullable() })).length(1).parse(stores)[0];
  const optionId = store.metadata?.snowforce_pickup_option_id;
  if (optionId === undefined || optionId === null) return null;
  const id = z.string().regex(/^so_[A-Za-z0-9]+$/).parse(optionId);
  const locationId = z.string().regex(/^sloc_[A-Za-z0-9]+$/).parse(store.metadata?.snowforce_fulfillment_location_id);
  if (store.default_location_id !== locationId || !store.default_sales_channel_id) throw new Error("Review the pickup warehouse.");
  const { data: locations } = await query.graph({ entity: "stock_location", filters: { id: locationId }, fields: ["id", "name", "address.*", "fulfillment_sets.id", "fulfillment_sets.type", "fulfillment_providers.id", "sales_channels.id"] });
  const location = z.array(z.object({ id: z.literal(locationId), name: z.string(), address: pointAddress, fulfillment_sets: z.array(z.object({ id: z.string(), type: z.string() })), fulfillment_providers: z.array(z.object({ id: z.string() })), sales_channels: z.array(z.object({ id: z.string() })) })).length(1).parse(locations)[0];
  const { data: options } = await query.graph({ entity: "shipping_option", filters: { id }, fields: ["id", "provider_id", "price_type", "type.code", "prices.*", "prices.price_rules.*", "service_zone.fulfillment_set_id", "service_zone.geo_zones.*", "rules.*"] });
  const option = z.array(z.object({ id: z.literal(id), provider_id: z.literal(snowforceShippingProviderId), price_type: z.literal("calculated"), type: z.object({ code: z.literal(snowforcePickupCode) }), prices: z.array(z.unknown()), service_zone: z.object({ fulfillment_set_id: z.string(), geo_zones: z.array(z.object({ type: z.string(), country_code: z.string(), province_code: z.string().nullable() })) }), rules: z.array(z.object({ attribute: z.string(), operator: z.string(), value: z.string() })) })).length(1).parse(options)[0];
  if (readShippingPolicy(option.prices).fee_cents !== 0 || !location.fulfillment_sets.some(set => set.id === option.service_zone.fulfillment_set_id && set.type === "pickup") || !location.fulfillment_providers.some(provider => provider.id === snowforceShippingProviderId) || !location.sales_channels.some(channel => channel.id === store.default_sales_channel_id) || !option.service_zone.geo_zones.some(zone => zone.country_code === "us" && (zone.type === "country" || (zone.type === "province" && zone.province_code === "ca"))) || !["enabled_in_store", "is_return"].every(attribute => option.rules.filter(rule => rule.attribute === attribute).length === 1 && option.rules.some(rule => rule.attribute === attribute && rule.operator === "eq" && rule.value === (attribute === "is_return" ? "false" : "true")))) throw new Error("Review pickup pricing, coverage and availability.");
  return offerSchema.parse({ id, locationId, name: location.name, address: location.address });
}

export function pickupAddress(offer: PickupOffer, input: z.infer<typeof pickupContactSchema>) {
  const contact = pickupContactSchema.parse(input), [first_name, ...last] = contact.name.split(/\s+/);
  const point = pointAddress.parse(offer.address);
  return { ...point, address_2: point.address_2 ?? "", first_name, last_name: last.join(" "), phone: contact.phone };
}
const unsignedSchema = z.object({ schema_version: z.literal(1), cart_id: z.string(), customer_id: z.string().min(1), region_id: z.string(), offer: offerSchema, address: pointAddress.extend({ first_name: z.string().min(1), last_name: z.string().nullable(), phone: z.string().min(7) }), appointment_confirmed: z.literal(true), confirmed_at: z.iso.datetime() }).strict();
const receiptSchema = unsignedSchema.extend({ signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
function signingKey() {
  if ((process.env.JWT_SECRET?.length ?? 0) < 32) throw new Error("Pickup verification is not configured.");
  return createHmac("sha256", process.env.JWT_SECRET!).update("snowforce/pickup-confirmation/v1").digest();
}
export function sealPickupConfirmation(cart: Pick<PickupCart, "id" | "customer_id" | "region_id">, offer: PickupOffer, contact: z.infer<typeof pickupContactSchema>) {
  const unsigned = unsignedSchema.parse({ schema_version: 1, cart_id: cart.id, customer_id: cart.customer_id, region_id: cart.region_id, offer, address: pickupAddress(offer, contact), appointment_confirmed: true, confirmed_at: new Date().toISOString() });
  return { ...unsigned, signature: createHmac("sha256", signingKey()).update(JSON.stringify(unsigned)).digest("hex") };
}
export function verifyPickupConfirmation(cart: PickupCart, offer: PickupOffer) {
  const { signature, ...unsigned } = receiptSchema.parse(cart.metadata?.[pickupConfirmationKey]);
  const expected = createHmac("sha256", signingKey()).update(JSON.stringify(unsignedSchema.parse(unsigned))).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")) || unsigned.cart_id !== cart.id || unsigned.customer_id !== cart.customer_id || unsigned.region_id !== cart.region_id || JSON.stringify(unsigned.offer) !== JSON.stringify(offerSchema.parse(offer)) || JSON.stringify(unsigned.address) !== JSON.stringify(unsignedSchema.shape.address.parse(cart.shipping_address)) || cart.shipping_methods.length !== 1 || cart.shipping_methods[0].shipping_option_id !== offer.id || cart.shipping_methods[0].amount !== 0 || Date.parse(unsigned.confirmed_at) > Date.now()) throw new Error("Confirm the current pickup appointment before paying.");
  return unsigned;
}

/** Native order creation copies cart metadata. Keep its historical pickup point
 * if the operator later edits the warehouse address. */
export function orderPickupSelected(order: { customer_id: string | null; region_id?: string | null; metadata?: Record<string, unknown> | null; shipping_address: CheckoutCart["shipping_address"]; shipping_methods?: { shipping_option_id: string; amount: number }[] }, shippingCents: number) {
  const parsed = receiptSchema.safeParse(order.metadata?.[pickupConfirmationKey]);
  if (!parsed.success || !order.shipping_methods?.some(method => method.shipping_option_id === parsed.data.offer.id)) return false;
  if (shippingCents !== 0 || !order.region_id) throw new Error("Invalid pickup order amounts.");
  verifyPickupConfirmation({ id: parsed.data.cart_id, customer_id: order.customer_id, region_id: order.region_id, metadata: order.metadata ?? null, shipping_address: order.shipping_address, shipping_methods: order.shipping_methods.map(method => ({ ...method, id: "historical", name: "Pickup" })) }, parsed.data.offer);
  return true;
}
