import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { listShippingOptionsForCartWorkflow, listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { requireOwnedCart } from "../../../../../cart-ownership";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { snowforceShippingCode, snowforceShippingProviderId } from "../../../../../../lib/shipping-policy";
import { timeCheckoutPhase, withCheckoutTiming } from "../../../../../../lib/checkout-timing";

type ShippingFlows = {
  list(scope: MedusaContainer, cartId: string): Promise<unknown>;
  price(scope: MedusaContainer, cartId: string, ids: string[]): Promise<unknown>;
};
const nativeFlows: ShippingFlows = {
  async list(scope, cartId) { return (await listShippingOptionsForCartWorkflow(scope).run({ input: { cart_id: cartId, is_return: false } })).result; },
  async price(scope, cartId, ids) { return (await listShippingOptionsForCartWithPricingWorkflow(scope).run({ input: { cart_id: cartId, options: ids.map(id => ({ id })) } })).result; },
};
const observe = <T>(work: Promise<T>) => work.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));

export function createShippingOptionsGet(flows: ShippingFlows = nativeFlows) {
return async function shippingOptionsGet(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  return withCheckoutTiming("checkout.shipping", async () => {
  await timeCheckoutPhase("shipping.owner",()=>requireOwnedCart(req, res, () => undefined));
  // Observe both outcomes immediately. Only the built-in self-fulfillment
  // provider can be priced speculatively: its price calculation reads our DB
  // and never contacts a carrier. Unknown providers keep the serial path.
  const listingRead = observe(timeCheckoutPhase("shipping.inventory",()=>flows.list(req.scope,req.params.id)));
  const { data: deliveryOptions } = await timeCheckoutPhase("shipping.delivery-types",()=>req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "shipping_option", fields: ["id", "provider_id"], filters: { type: { code: snowforceShippingCode } } }));
  const delivery = z.array(z.object({ id: z.string(), provider_id: z.string().nullable().optional() })).parse(deliveryOptions);
  const deliveryIds = delivery.map(option => option.id);
  const parallel = process.env.COMMERCE_SHIPPING_PARALLEL_READS === "true" && delivery.length > 0 && delivery.every(option => option.provider_id === snowforceShippingProviderId);
  const pricingRead = parallel ? observe(timeCheckoutPhase("shipping.pricing",()=>flows.price(req.scope,req.params.id,deliveryIds))) : null;
  const [listing, pricing] = await Promise.all([listingRead,pricingRead]);
  if (!listing.ok) throw listing.error;
  const eligible = z.array(z.object({ id: z.string(), insufficient_inventory: z.boolean() })).parse(listing.value).filter((option) => !option.insufficient_inventory && deliveryIds.includes(option.id));
  if (!eligible.length) return res.json({ shipping_options: [] });
  if (pricing && !pricing.ok) throw pricing.error;
  const result = pricing?.ok ? pricing.value : await timeCheckoutPhase("shipping.pricing",()=>flows.price(req.scope,req.params.id,eligible.map(({ id }) => id)));
  const priced = z.array(z.object({ id: z.string(), name: z.string(), calculated_price: z.object({ calculated_amount: z.number().nonnegative() }) })).parse(result);
  res.json({ shipping_options: priced.filter((option) => eligible.some(({ id }) => id === option.id)).map((option) => ({ id: option.id, name: option.name, calculated_price: { currency_code: "usd", calculated_amount: option.calculated_price.calculated_amount } })) });
  });
};
}
export const GET = createShippingOptionsGet();
