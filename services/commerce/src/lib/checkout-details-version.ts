import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { checkoutCartSchema, checkoutFields, type CheckoutCart } from "./checkout-policy";

export const detailsVersionRegistration = "snowforce_checkout_details_version";
export const detailsVersionSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** Content revision for receiving details. Quote withdrawal changes money, not this revision. */
export function checkoutDetailsVersion(cart: CheckoutCart) {
  return createHash("sha256").update(JSON.stringify({ id: cart.id, customer: cart.customer_id, region: cart.region_id,
    address: cart.shipping_address, pickup: cart.metadata?.snowforce_pickup_confirmation ?? null })).digest("hex");
}
const guardSchema = z.object({ cartId: z.string(), customerId: z.string(), version: detailsVersionSchema }).strict();
export async function assertVersionedDetailsEdit(id: string, scope: MedusaContainer) {
  const raw = scope.resolve<unknown>(detailsVersionRegistration, { allowUnregistered: true });
  if (raw === undefined) return;
  const expected = guardSchema.parse(raw);
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields: checkoutFields, filters: { id } });
  const cart = checkoutCartSchema.parse(z.array(z.unknown()).length(1).parse(data)[0]);
  if (expected.cartId !== id || cart.customer_id !== expected.customerId || checkoutDetailsVersion(cart) !== expected.version)
    throw new MedusaError(MedusaError.Types.CONFLICT, "Receiving details changed. Refresh checkout before saving.");
}
