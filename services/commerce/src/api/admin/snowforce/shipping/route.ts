import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { updateSnowforceShippingPolicyWorkflow } from "../../../../workflows/update-shipping-policy";
import { z } from "zod";
import { readShippingPolicy, shippingPolicySchema, snowforceShippingCode } from "../../../../lib/shipping-policy";

const optionSchema = z.object({ id: z.string(), type: z.object({ code: z.string() }), prices: z.array(z.unknown()) });
async function shippingOptions(req: AuthenticatedMedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "shipping_option", fields: ["id", "type.code", "prices.*", "prices.price_rules.*"], filters: { type: { code: snowforceShippingCode } } });
  return z.array(optionSchema).parse(data);
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const options = await shippingOptions(req);
  res.json({ options: options.map((option) => ({ id: option.id, policy: readShippingPolicy(option.prices) })) });
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = z.object({ id: z.string().regex(/^so_[a-zA-Z0-9]+$/), policy: shippingPolicySchema }).strict().safeParse(req.body);
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter valid dollar amounts for the shipping policy.");
  const options = await shippingOptions(req);
  if (!options.some((option) => option.id === parsed.data.id)) throw new MedusaError(MedusaError.Types.NOT_FOUND, "SnowForce shipping option not found.");
  await updateSnowforceShippingPolicyWorkflow(req.scope).run({ input: parsed.data });
  res.json({ success: true });
}
