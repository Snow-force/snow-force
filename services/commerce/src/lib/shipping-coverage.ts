import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import type { CheckoutCart } from "./checkout-policy";
import { calculatedShippingCents, readShippingPolicy, snowforceShippingProviderId } from "./shipping-policy";
import { verifiedCartMerchandiseCents } from "./tax-cart-merchandise";

const optionsSchema = z.array(z.object({
  id: z.string(), provider_id: z.literal(snowforceShippingProviderId), price_type: z.literal("calculated"), prices: z.array(z.unknown()), service_zone: z.object({ geo_zones: z.array(z.object({ type: z.string(), country_code: z.string(), province_code: z.string().nullable() })) }),
}));

// Always re-read coverage before payment and order completion: an old quote or
// direct API call must not bypass changes made to the native service zone.
export async function readCartShippingPolicy(cart: Pick<CheckoutCart, "shipping_address" | "shipping_methods">, container: MedusaContainer) {
  const address = cart.shipping_address;
  if (!address || cart.shipping_methods.length !== 1) throw new Error("A shipping address and one shipping method are required.");
  const selectedId = cart.shipping_methods[0].shipping_option_id;
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "shipping_option", filters: { id: selectedId },
    fields: ["id", "provider_id", "price_type", "prices.*", "prices.price_rules.*", "service_zone.geo_zones.type", "service_zone.geo_zones.country_code", "service_zone.geo_zones.province_code"],
  });
  const options = optionsSchema.parse(data);
  if (options.length !== 1 || options[0].id !== selectedId || !options[0].service_zone.geo_zones.some((area) =>
    area.country_code.toLowerCase() === address.country_code &&
    (area.type === "country" || (area.type === "province" && area.province_code?.toLowerCase() === address.province.toLowerCase()))
  )) throw new Error("The selected shipping method does not cover this address. Review delivery options.");
  return readShippingPolicy(options[0].prices);
}

export async function assertCartShippingCoverage(cart: Pick<CheckoutCart, "shipping_address" | "shipping_methods" | "item_total" | "item_tax_total">, container: MedusaContainer) {
  const expectedCents = calculatedShippingCents(await readCartShippingPolicy(cart, container), await verifiedCartMerchandiseCents(cart,container));
  if (Math.round(cart.shipping_methods[0].amount * 100) !== expectedCents) throw new Error("Shipping price changed. Review delivery options.");
}
