import { listShippingOptionsForCartWorkflow, listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { readCartItemCents, readShippingQuotes } from "../../lib/shipping-quotes";

listShippingOptionsForCartWithPricingWorkflow.hooks.setCalculatedShippingPricingContext(async ({ input }, { container }) =>
  new StepResponse({ snowforce_shipping_quotes: await readShippingQuotes(input.cart_id, container) })
);

// The native Store list endpoint prices these same records through the Pricing
// Module. Give it the identical net merchandise context used by our provider.
listShippingOptionsForCartWorkflow.hooks.setPricingContext(async ({ cart }, { container }) =>
  new StepResponse({ item_total: await readCartItemCents(cart.id, container) / 100 })
);
