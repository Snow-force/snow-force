import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { asValue } from "@medusajs/framework/awilix";
import { addShippingMethodToCartWorkflow, updateCartWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { checkoutCartSchema, paymentStarted, type CheckoutCart } from "../../../../../../lib/checkout-policy";
import { OwnedTaxCartSnapshotMissingError, readOwnedTaxCartSnapshot } from "../../../../../../lib/tax-cart-sql";
import { checkoutDetailsVersion, detailsVersionRegistration, detailsVersionSchema } from "../../../../../../lib/checkout-details-version";
import { pickupAddress, pickupConfirmationKey, pickupContactSchema, readPickupOffer, sealPickupConfirmation } from "../../../../../../lib/local-pickup";
import { withdrawCartTaxQuote } from "../../../../../../lib/tax-quote-withdrawal";

const address = z.object({ first_name: z.string().trim().min(1).max(100), last_name: z.string().max(100), phone: z.string().trim().min(1).max(30),
  address_1: z.string().trim().min(1).max(200), address_2: z.string().max(200), city: z.string().trim().min(1).max(100),
  province: z.string().regex(/^[a-z]{2}$/), postal_code: z.string().regex(/^\d{5}(?:-\d{4})?$/), country_code: z.literal("us") }).strict();
const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("delivery"), version: detailsVersionSchema, address }).strict(),
  z.object({ kind: z.literal("pickup"), version: detailsVersionSchema, contact: pickupContactSchema }).strict(),
]);
type Input = z.infer<typeof inputSchema>;
type Flows = { save(scope: MedusaContainer, cart: CheckoutCart, input: Input): Promise<void> };
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Receiving details changed. Refresh checkout before saving.");
const nativeFlows: Flows = { async save(scope, cart, input) {
  if (input.kind === "delivery") {
    // Contact email and identity come from the authenticated owned cart.
    await updateCartWorkflow(scope).run({ input: { id: cart.id, email: cart.email ?? undefined, shipping_address: input.address, billing_address: input.address,
      metadata: { ...cart.metadata, [pickupConfirmationKey]: null } } });
  } else {
    const offer = await readPickupOffer(scope); if (!offer) throw conflict();
    await updateCartWorkflow(scope).run({ input: { id: cart.id, shipping_address: pickupAddress(offer, input.contact), billing_address: null,
      metadata: { ...cart.metadata, [pickupConfirmationKey]: sealPickupConfirmation(cart, offer, input.contact) } } });
    await addShippingMethodToCartWorkflow(scope).run({ input: { cart_id: cart.id, options: [{ id: offer.id }] } });
  }
} };
export function createDetailsPost(flows: Flows = nativeFlows, withdraw = withdrawCartTaxQuote) {
  return async function detailsPost(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Provide complete receiving details and the current revision.");
    if (req.auth_context?.actor_type !== "customer" || !/^cus_[A-Za-z0-9]+$/.test(req.auth_context.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
    async function owned() {
      const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields: ["id", "customer_id"], filters: { id: req.params.id } });
      if (data.length !== 1 || data[0].customer_id !== req.auth_context.actor_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
      const snapshot = await readOwnedTaxCartSnapshot(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION),req.params.id,req.auth_context.actor_id).catch(error => {
        if (error instanceof OwnedTaxCartSnapshotMissingError) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
        throw error;
      });
      const cart = checkoutCartSchema.parse(snapshot);
      if (cart.completed_at || paymentStarted(cart)) throw conflict();
      return cart;
    }
    await owned();
    try {
      const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING);
      await locking.execute(`snowforce-details:${req.params.id}`, async serial => {
        if (serial?.aborted) throw conflict();
        // Version validation and quote withdrawal share the checkout/native leases.
        await withdraw(req.scope, req.auth_context, req.params.id, [serial], parsed.data.version);
        await locking.execute(`snowforce-checkout:${req.params.id}`, async checkout => {
          const cart = await owned();
          if (serial?.aborted || checkout?.aborted || checkoutDetailsVersion(cart) !== parsed.data.version) throw conflict();
          // This request-scoped value is checked again by the native workflow
          // validate hook after it acquires cart.id. Browser metadata cannot set it.
          req.scope.register({ [detailsVersionRegistration]: asValue({ cartId: cart.id, customerId: req.auth_context.actor_id, version: parsed.data.version }) });
          await flows.save(req.scope, cart, parsed.data);
          if (serial?.aborted || checkout?.aborted) throw conflict();
        }, { timeout: 15, expire: 120 });
      }, { timeout: 15, expire: 120 });
      return res.json({ status: "details-saved" });
    } catch (error) {
      if (error instanceof MedusaError && error.type === MedusaError.Types.CONFLICT)
        return res.status(409).json({ type: "conflict", code: "checkout_details_changed", message: "Refresh receiving details before saving again." });
      throw error;
    }
  };
}
export const POST = createDetailsPost();
