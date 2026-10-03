import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import type { CalculateShippingOptionPriceDTO } from "@medusajs/framework/types";
import { z } from "zod";
import { calculatedShippingCents, shippingPolicySchema, snowforceShippingCode } from "../../lib/shipping-policy";

const optionSchema = z.object({ id: z.literal(snowforceShippingCode), snowforce_option_id: z.string().regex(/^so_[a-zA-Z0-9]+$/).optional() });
export default class SnowforceFulfillment extends AbstractFulfillmentProviderService {
  static identifier = "snowforce_us";
  async getFulfillmentOptions() { return [{ id: snowforceShippingCode }]; }
  async validateOption(data: Record<string, unknown>) { return optionSchema.safeParse(data).success; }
  async canCalculate() { return true; }
  async validateFulfillmentData(_optionData: Record<string, unknown>, _data: Record<string, unknown>) { return {}; }
  async calculatePrice(optionData: CalculateShippingOptionPriceDTO["optionData"], _data: CalculateShippingOptionPriceDTO["data"], context: CalculateShippingOptionPriceDTO["context"]) {
    const option = optionSchema.extend({ snowforce_option_id: z.string().regex(/^so_[a-zA-Z0-9]+$/) }).parse(optionData);
    const quotes = z.record(z.string(), z.object({ policy: shippingPolicySchema, item_cents: z.number().int().nonnegative() })).parse(context.snowforce_shipping_quotes);
    const quote = quotes[option.snowforce_option_id];
    if (!quote) throw new Error("Shipping pricing is unavailable. Review the database policy.");
    return { calculated_amount: calculatedShippingCents(quote.policy, quote.item_cents) / 100, is_calculated_price_tax_inclusive: false };
  }
  // Self fulfillment uses native Admin tracking, without purchasing labels or contacting carriers.
  async createFulfillment() { return { data: {}, labels: [] }; }
  async cancelFulfillment() { return {}; }
  async createReturnFulfillment() { return { data: {}, labels: [] }; }
}
