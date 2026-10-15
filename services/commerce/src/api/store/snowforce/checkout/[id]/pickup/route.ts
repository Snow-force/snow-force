import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { addShippingMethodToCartWorkflow, updateCartWorkflow } from "@medusajs/medusa/core-flows";
import { checkoutCartSchema, checkoutFields, paymentStarted, type CheckoutCart } from "../../../../../../lib/checkout-policy";
import { pickupContactSchema, pickupAddress, pickupConfirmationKey, readPickupOffer, sealPickupConfirmation, verifyPickupConfirmation, type PickupOffer } from "../../../../../../lib/local-pickup";
import { withdrawCartTaxQuote } from "../../../../../../lib/tax-quote-withdrawal";

const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Review the pickup appointment and current cart before continuing.");
type PickupFlows = { save(scope: MedusaContainer, cart: CheckoutCart, offer: PickupOffer, contact: ReturnType<typeof pickupContactSchema.parse>): Promise<void> };
const nativeFlows: PickupFlows = {
  async save(scope, cart, offer, contact) {
    await updateCartWorkflow(scope).run({ input: { id: cart.id, shipping_address: pickupAddress(offer, contact), billing_address: null, metadata: { ...cart.metadata, [pickupConfirmationKey]: sealPickupConfirmation(cart, offer, contact) } } });
    await addShippingMethodToCartWorkflow(scope).run({ input: { cart_id: cart.id, options: [{ id: offer.id }] } });
  },
};
export function createPickupPost(flows: PickupFlows = nativeFlows, withdraw = withdrawCartTaxQuote) {
  return async function pickupPost(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
    const input = pickupContactSchema.safeParse(req.body);
    if (!input.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Confirm the appointment and provide a pickup name and phone.");
    if (req.auth_context?.actor_type !== "customer" || !/^cus_[A-Za-z0-9]+$/.test(req.auth_context.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    async function owned() {
      const { data } = await query.graph({ entity: "cart", fields: checkoutFields, filters: { id: req.params.id } });
      if (!data[0] || data[0].customer_id !== req.auth_context.actor_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
      const cart = checkoutCartSchema.parse(data[0]);
      if (cart.completed_at || paymentStarted(cart)) throw conflict();
      return cart;
    }
    await owned();
    // Withdrawal owns the same checkout lock; complete it before acquiring that
    // lock for native mutations, which acquire their own cart lock internally.
    await withdraw(req.scope, req.auth_context, req.params.id);
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING);
    await locking.execute(`snowforce-checkout:${req.params.id}`, async signal => {
      if (signal?.aborted) throw conflict();
      const cart = await owned(), offer = await readPickupOffer(req.scope);
      if (!offer) throw conflict();
      await flows.save(req.scope, cart, offer, input.data);
      if (signal?.aborted) throw conflict();
      const current = await owned(), freshOffer = await readPickupOffer(req.scope);
      if (!freshOffer) throw conflict();
      verifyPickupConfirmation(current, freshOffer);
    }, { timeout: 15, expire: 120 });
    res.json({ status: "pickup-saved" });
  };
}
export const POST = createPickupPost();
