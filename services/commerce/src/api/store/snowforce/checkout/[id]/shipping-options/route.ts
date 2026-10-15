import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { listShippingOptionsForCartWorkflow, listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { requireOwnedCart } from "../../../../../cart-ownership";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { snowforceShippingCode } from "../../../../../../lib/shipping-policy";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireOwnedCart(req, res, () => undefined);
  const { result: listed } = await listShippingOptionsForCartWorkflow(req.scope).run({ input: { cart_id: req.params.id, is_return: false } });
  const { data: deliveryOptions } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "shipping_option", fields: ["id"], filters: { type: { code: snowforceShippingCode } } });
  const deliveryIds = z.array(z.object({ id: z.string() })).parse(deliveryOptions).map(option => option.id);
  const eligible = z.array(z.object({ id: z.string(), insufficient_inventory: z.boolean() })).parse(listed).filter((option) => !option.insufficient_inventory && deliveryIds.includes(option.id));
  if (!eligible.length) return res.json({ shipping_options: [] });
  const { result } = await listShippingOptionsForCartWithPricingWorkflow(req.scope).run({ input: { cart_id: req.params.id, options: eligible.map(({ id }) => ({ id })) } });
  const priced = z.array(z.object({ id: z.string(), name: z.string(), calculated_price: z.object({ calculated_amount: z.number().nonnegative() }) })).parse(result);
  res.json({ shipping_options: priced.filter((option) => eligible.some(({ id }) => id === option.id)).map((option) => ({ id: option.id, name: option.name, calculated_price: { currency_code: "usd", calculated_amount: option.calculated_price.calculated_amount } })) });
}
