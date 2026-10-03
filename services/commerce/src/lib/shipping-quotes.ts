import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import { discountedItemCents, readShippingPolicy, snowforceShippingCode } from "./shipping-policy";
import { checkoutFields } from "./checkout-policy";
import { verifiedCartMerchandiseCents } from "./tax-cart-merchandise";

export async function readCartItemCents(cartId: string, container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: carts } = await query.graph({ entity: "cart", fields: ["id", "currency_code", "item_total", "item_tax_total", "items.variant_id"], filters: { id: cartId } });
  const cart = z.object({ id: z.literal(cartId), currency_code: z.literal("usd"), item_total: z.unknown(), item_tax_total: z.unknown(),items:z.array(z.object({variant_id:z.string().nullable()})).optional() }).parse(carts[0]);
  if(cart.items?.some(item=>item.variant_id===null)){
    const {data}=await query.graph({entity:"cart",fields:checkoutFields,filters:{id:cartId}});
    return verifiedCartMerchandiseCents(data[0],container);
  }
  return discountedItemCents(cart.item_total, cart.item_tax_total);
}

export async function readShippingQuotes(cartId: string, container: MedusaContainer) {
  const itemCents = await readCartItemCents(cartId, container);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "shipping_option", fields: ["id", "prices.*", "prices.price_rules.*"], filters: { type: { code: snowforceShippingCode } } });
  return Object.fromEntries(z.array(z.object({ id: z.string(), prices: z.array(z.unknown()) })).parse(data).map((option) => [option.id, { policy: readShippingPolicy(option.prices), item_cents: itemCents }]));
}
