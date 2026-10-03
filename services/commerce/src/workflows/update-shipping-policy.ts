import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { setShippingOptionsPricesStep, updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { shippingPriceRecords, snowforceShippingCode, snowforceShippingProviderId, type ShippingPolicy } from "../lib/shipping-policy";

export const updateSnowforceShippingPolicyWorkflow = createWorkflow("snowforce-update-shipping-policy", (input: { id: string; policy: ShippingPolicy }) => {
  const prices = transform(input, (value) => [{ id: value.id, prices: shippingPriceRecords(value.policy) }]);
  setShippingOptionsPricesStep(prices);
  return new WorkflowResponse({ success: true });
});

// The native transition to calculated pricing clears flat prices. Restore the
// reviewed values in the same compensating workflow, rather than losing them.
export const configureSnowforceShippingWorkflow = createWorkflow("snowforce-configure-shipping-calculation", (input: { id: string; policy: ShippingPolicy; data?: Record<string, unknown> | null }) => {
  const update = transform(input, ({ id, data }) => [{ id, provider_id: snowforceShippingProviderId, price_type: "calculated" as const, data: { ...data, id: snowforceShippingCode, snowforce_option_id: id } }]);
  const updated = updateShippingOptionsWorkflow.runAsStep({ input: update });
  const prices = transform({ input, updated }, ({ input: value }) => [{ id: value.id, prices: shippingPriceRecords(value.policy) }]);
  setShippingOptionsPricesStep(prices);
  return new WorkflowResponse({ success: true });
});
