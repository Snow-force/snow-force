import { addShippingMethodToCartWorkflow, addToCartWorkflow, completeCartWorkflow, refreshPaymentCollectionForCartWorkflow, updateCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { assertCheckoutReady, assertPaymentMatches, assertUsCheckoutRegion, checkoutCartSchema, checkoutFields } from "../../lib/checkout-policy";
import { assertCartShippingCoverage } from "../../lib/shipping-coverage";
import { assertWorkflowPolicySnapshot } from "../../lib/policy-consent";
import { assertCartProductTaxClassifications } from "../../lib/tax-classification";
import { assertActiveStripeTaxSetup } from "../../lib/tax-setup";
import { assertPersistedCartTaxQuote, assertWorkflowTaxQuoteSnapshot } from "../../lib/tax-quote-ledger";

// Also runs for webhook completion and native API calls, before order creation/payment authorization.
export async function validateCheckoutCart(input: { id: string }, initialCart: unknown, container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: checkoutFields, filters: { id: input.id } });
  try {
    const cart = checkoutCartSchema.parse(data[0]);
    assertCheckoutReady(cart, process.env.COMMERCE_TAX_POLICY_CONFIRMED === "true");
    const { data: regions } = await query.graph({ entity: "region", fields: ["currency_code", "countries.iso_2"], filters: { id: cart.region_id } });
    assertUsCheckoutRegion(regions[0]);
    await assertCartShippingCoverage(cart, container);
    await assertCartProductTaxClassifications(cart, container);
    const setup = await assertActiveStripeTaxSetup(container);
    const quote = await assertPersistedCartTaxQuote(cart, container, setup, "complete");
    assertWorkflowTaxQuoteSnapshot(initialCart, cart);
    assertPaymentMatches(cart, quote.receipt.total_cents);
    await assertWorkflowPolicySnapshot(initialCart, cart, container);
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Checkout needs a current shipping, tax and payment review.");
  }
}
completeCartWorkflow.hooks.validate(async ({ input, cart: initialCart }, { container }) => validateCheckoutCart(input, initialCart, container));

export async function assertEditableCart(id: string, container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: ["id", "completed_at", "metadata", "payment_collection.payment_sessions.status"], filters: { id } });
  const cart = z.object({ completed_at: z.unknown().nullable(), metadata:z.record(z.string(),z.unknown()).nullable().optional(), payment_collection: z.object({ payment_sessions: z.array(z.object({ status: z.string() })) }).nullable() }).parse(data[0]);
  if (cart.completed_at || cart.payment_collection?.payment_sessions.length || (cart.metadata&&Object.hasOwn(cart.metadata,"snowforce_tax_quote"))) throw new MedusaError(MedusaError.Types.CONFLICT, "Check the existing quote and payment before changing this cart.");
}
// Native workflows hold the cart lock before these hooks. Rechecking here closes the read/mutate race in HTTP middleware.
updateCartWorkflow.hooks.validate(async ({ input }, { container }) => assertEditableCart(input.id, container));
addToCartWorkflow.hooks.validate(async ({ input }, { container }) => assertEditableCart(input.cart_id, container));
updateLineItemInCartWorkflow.hooks.validate(async ({ input }, { container }) => assertEditableCart(input.cart_id, container));
addShippingMethodToCartWorkflow.hooks.validate(async ({ input }, { container }) => assertEditableCart(input.cart_id, container));
refreshPaymentCollectionForCartWorkflow.hooks.validate(async ({ cart }, { container }) => assertEditableCart(cart.id, container));
