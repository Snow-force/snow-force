import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { getLineItemTotals } = require("@medusajs/framework/utils");
const { calculatedShippingCents, discountedItemCents, shippingPriceRecords } = require("../src/lib/shipping-policy.ts");
const { readShippingQuotes } = require("../src/lib/shipping-quotes.ts");
const Service = require("../src/modules/snowforce-fulfillment/service.ts").default;
const policy = { fee_cents: 995, free_threshold_cents: 10000 };
test("actual Medusa taxed/discounted line totals use USD 99.99/100.00 merchandise boundaries", () => {
  for (const [price, discount, expectedCents, expectedShipping] of [[99.99, 0, 9999, 995], [100, 0, 10000, 0], [110, 10.01, 9999, 995], [110, 10, 10000, 0]]) {
    const item = getLineItemTotals({ id: "cali_fixture", quantity: 1, unit_price: price, is_tax_inclusive: false, tax_lines: [{ rate: 8.25 }], adjustments: discount ? [{ amount: discount }] : [] }, { currency_code: "usd" });
    const cents = discountedItemCents(item.total, item.tax_total);
    assert.equal(cents, expectedCents); assert.equal(calculatedShippingCents(policy, cents), expectedShipping);
  }
  assert.throws(() => discountedItemCents(1, 2)); assert.throws(() => discountedItemCents(undefined, 0));
  assert.throws(() => calculatedShippingCents(policy, -1));
});
test("the calculated provider reads current database values and ignores submitted client prices", async () => {
  let saved = policy;
  const container = { resolve: () => ({ graph: async ({ entity }) => ({ data: entity === "cart" ? [{ id: "cart_fixture", currency_code: "usd", item_total: 108.24, item_tax_total: 8.25 }] : [{ id: "so_fixture", prices: shippingPriceRecords(saved).map(({ rules, ...record }) => ({ ...record, price_rules: rules })) }] }) }) };
  const service = new Service(); const option = { id: "snowforce-us-standard", snowforce_option_id: "so_fixture" };
  const calculate = async () => service.calculatePrice(option, { amount: 0, policy: { fee_cents: 0 } }, { snowforce_shipping_quotes: await readShippingQuotes("cart_fixture", container) });
  assert.deepEqual(await calculate(), { calculated_amount: 9.95, is_calculated_price_tax_inclusive: false });
  saved = { fee_cents: 1250, free_threshold_cents: 15000 };
  assert.equal((await calculate()).calculated_amount, 12.5);
  saved = { fee_cents: 1250, free_threshold_cents: 9900 };
  assert.equal((await calculate()).calculated_amount, 0);
  await assert.rejects(() => service.calculatePrice(option, {}, {}));
  await assert.rejects(() => service.calculatePrice({ ...option, snowforce_option_id: "so_missing" }, {}, { snowforce_shipping_quotes: {} }));
  assert.equal(await service.validateOption({ id: "invalid" }), false);
  assert.equal(await service.validateOption(option), true); assert.equal(await service.canCalculate(), true);
  assert.deepEqual(await service.getFulfillmentOptions(), [{ id: "snowforce-us-standard" }]);
  assert.deepEqual(await service.validateFulfillmentData(option, { amount: 0 }), {});
  assert.deepEqual(await service.createFulfillment(), { data: {}, labels: [] });
  assert.deepEqual(await service.createReturnFulfillment(), { data: {}, labels: [] });
  assert.deepEqual(await service.cancelFulfillment(), {});
});
