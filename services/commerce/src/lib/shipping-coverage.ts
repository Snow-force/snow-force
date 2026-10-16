import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import type { CheckoutCart } from "./checkout-policy";
import { calculatedShippingCents, readShippingPolicy, snowforceShippingProviderId, snowforceShippingCode, snowforcePickupCode } from "./shipping-policy";
import { readPickupOffer, verifyPickupConfirmation } from "./local-pickup";
import { verifiedCartMerchandiseCents } from "./tax-cart-merchandise";

const optionsSchema = z.array(z.object({
  type: z.object({ code: z.enum([snowforceShippingCode, snowforcePickupCode]) }),
  id: z.string(), provider_id: z.literal(snowforceShippingProviderId), price_type: z.literal("calculated"), prices: z.array(z.unknown()), service_zone: z.object({ geo_zones: z.array(z.object({ type: z.string(), country_code: z.string(), province_code: z.string().nullable() })) }),
}));

// Always re-read coverage before payment and order completion: an old quote or
// direct API call must not bypass changes made to the native service zone.
type ShippingCart = Pick<CheckoutCart, "id" | "customer_id" | "region_id" | "metadata" | "shipping_address" | "shipping_methods">;
async function validateCartShippingPolicy(cart: ShippingCart, container: MedusaContainer, data: unknown) {
  const address = cart.shipping_address;
  if (!address || cart.shipping_methods.length !== 1) throw new Error("A shipping address and one shipping method are required.");
  const selectedId = cart.shipping_methods[0].shipping_option_id;
  const options = optionsSchema.parse(data);
  if (options.length !== 1 || options[0].id !== selectedId || !options[0].service_zone.geo_zones.some((area) =>
    area.country_code.toLowerCase() === address.country_code &&
    (area.type === "country" || (area.type === "province" && area.province_code?.toLowerCase() === address.province.toLowerCase()))
  )) throw new Error("The selected shipping method does not cover this address. Review delivery options.");
  const policy = readShippingPolicy(options[0].prices);
  if (options[0].type.code === snowforcePickupCode) {
    const offer = await readPickupOffer(container);
    if (!offer || offer.id !== selectedId || policy.fee_cents !== 0) throw new Error("Pickup is unavailable.");
    verifyPickupConfirmation(cart, offer);
  }
  return policy;
}

export async function readCartShippingPolicy(cart: ShippingCart, container: MedusaContainer) {
  if (!cart.shipping_address || cart.shipping_methods.length !== 1) throw new Error("A shipping address and one shipping method are required.");
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "shipping_option", filters: { id: cart.shipping_methods[0].shipping_option_id },
    fields: ["id", "provider_id", "price_type", "type.code", "prices.*", "prices.price_rules.*", "service_zone.geo_zones.type", "service_zone.geo_zones.country_code", "service_zone.geo_zones.province_code"],
  });
  return validateCartShippingPolicy(cart, container, data);
}

/** A fresh, read-only coverage and price snapshot for an already owned tax source.
 * Keep the same policy validator and pickup confirmation; never cache this across
 * source checks or use it to grant permission for a cart mutation.
 */
export async function readCartShippingPolicySnapshot(cart: ShippingCart, container: MedusaContainer) {
  if (!cart.shipping_address || cart.shipping_methods.length !== 1) throw new Error("A shipping address and one shipping method are required.");
  const selectedId = z.string().regex(/^so_[A-Za-z0-9]+$/).parse(cart.shipping_methods[0].shipping_option_id);
  const result = await container.resolve(ContainerRegistrationKeys.PG_CONNECTION).raw(`select jsonb_build_object(
    'id',o.id,'provider_id',o.provider_id,'price_type',o.price_type,
    'type',(select jsonb_build_object('code',t.code) from commerce.shipping_option_type t where t.id=o.shipping_option_type_id and t.deleted_at is null),
    'service_zone',(select jsonb_build_object('geo_zones',coalesce((select jsonb_agg(jsonb_build_object('type',g.type,'country_code',g.country_code,'province_code',g.province_code) order by g.id) from commerce.geo_zone g where g.service_zone_id=s.id and g.deleted_at is null),'[]'::jsonb)) from commerce.service_zone s where s.id=o.service_zone_id and s.deleted_at is null),
    'prices',coalesce((select jsonb_agg(jsonb_build_object('currency_code',p.currency_code,'amount',p.amount,'price_rules',
      coalesce((select jsonb_agg(jsonb_build_object('attribute',r.attribute,'operator',r.operator,'value',r.value) order by r.id) from commerce.price_rule r where r.price_id=p.id and r.deleted_at is null),'[]'::jsonb)) order by p.id)
      from commerce.price p join commerce.price_set ps on ps.id=p.price_set_id join commerce.shipping_option_price_set l on l.price_set_id=ps.id
      where l.shipping_option_id=o.id and l.deleted_at is null and ps.deleted_at is null and p.deleted_at is null),'[]'::jsonb)
    ) as option from commerce.shipping_option o where o.id=? and o.deleted_at is null`, [selectedId]);
  const rows = z.array(z.object({ option: z.unknown() })).length(1).parse(result.rows);
  return validateCartShippingPolicy(cart, container, rows.map(row => row.option));
}

export async function assertCartShippingCoverage(cart: Pick<CheckoutCart, "id" | "customer_id" | "region_id" | "metadata" | "shipping_address" | "shipping_methods" | "item_total" | "item_tax_total">, container: MedusaContainer) {
  const expectedCents = calculatedShippingCents(await readCartShippingPolicy(cart, container), await verifiedCartMerchandiseCents(cart,container));
  if (Math.round(cart.shipping_methods[0].amount * 100) !== expectedCents) throw new Error("Shipping price changed. Review delivery options.");
}
