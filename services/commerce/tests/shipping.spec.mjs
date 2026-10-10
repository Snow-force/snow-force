import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { initialShippingPolicy, shippingPriceRecords, readShippingPolicy, shippingPolicySchema } = require("../src/lib/shipping-policy.ts");
const { shippingStoreRuleUpdates } = require("../src/lib/shipping-store-rules.ts");
test("upgrades the legacy native context key while preserving operator visibility and return rules", () => {
  const returned = { id: "sorul_return", attribute: "is_return", operator: "eq", value: "false" };
  for (const value of ["true", "false"]) {
    const legacy = { id: "sorul_visible", attribute: "is_enabled_in_store", operator: "eq", value };
    const updates = shippingStoreRuleUpdates([legacy, returned]);
    assert.deepEqual(updates, [{ ...legacy, attribute: "enabled_in_store" }]);
    assert.deepEqual(shippingStoreRuleUpdates([...updates, returned]), []);
    assert.throws(() => shippingStoreRuleUpdates([legacy, ...updates]));
    assert.throws(() => shippingStoreRuleUpdates([legacy, { ...legacy, id: "sorul_duplicate" }]));
  }
  assert.throws(() => shippingStoreRuleUpdates([{ attribute: "is_enabled_in_store" }]));
});
test("stores the confirmed USD 9.95 fee and inclusive USD 100 threshold in Medusa units", () => {
  const prices = shippingPriceRecords(initialShippingPolicy);
  assert.equal(prices[0].amount, 9.95);
  assert.equal(prices[1].amount, 0);
  assert.deepEqual(prices[1].rules, [{ attribute: "item_total", operator: "gte", value: 100 }]);
});
test("reads operator changes from database prices rather than seed values", () => {
  const records = shippingPriceRecords({ fee_cents: 1200, free_threshold_cents: 15000 });
  const saved = records.map(({ rules, ...price }) => ({ ...price, price_rules: rules }));
  assert.deepEqual(readShippingPolicy(saved), { fee_cents: 1200, free_threshold_cents: 15000 });
});
test("rejects negative, fractional-cent, excessive or non-USD pricing", () => {
  assert.equal(shippingPolicySchema.safeParse({ fee_cents: -1, free_threshold_cents: 10000 }).success, false);
  assert.equal(shippingPolicySchema.safeParse({ fee_cents: 995.5, free_threshold_cents: 10000 }).success, false);
  assert.throws(() => readShippingPolicy([{ currency_code: "cny", amount: 9.95, price_rules: [] }, { currency_code: "usd", amount: 0, price_rules: [{ attribute: "item_total", operator: "gte", value: 100 }] }]));
});

test("native shipping prices and thresholds must be exact cents rather than silently rounded", () => {
  const base={currency_code:"usd",amount:"9.95",price_rules:[]};
  const free={currency_code:"usd",amount:"0.00",price_rules:[{attribute:"item_total",operator:"gte",value:"100.00"}]};
  assert.deepEqual(readShippingPolicy([base,free]),{fee_cents:995,free_threshold_cents:10000});
  for(const amount of ["9.955",9.955,true,null])assert.throws(()=>readShippingPolicy([{...base,amount},free]));
  for(const value of ["99.999",99.999,true,null])assert.throws(()=>readShippingPolicy([base,{...free,price_rules:[{...free.price_rules[0],value}]}]));
});
