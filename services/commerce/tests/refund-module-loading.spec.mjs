import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const contracts = require("../src/lib/tax-refund-funds-contract.ts");

for (const entry of ["tax-refund-funds", "tax-refund-worker", "refund-execution", "tax-refund-reservations", "tax-refund-ledger", "tracked-refund-balance", "native-refund-reconciliation", "refund-admin", "after-sales-refund-completion", "../modules/snowforce-stripe/service"]) {
  test(`refund startup loads ${entry} first without relying on an existing module cache`, () => {
    const target = require.resolve(`../src/lib/${entry}.ts`);
    const child = spawnSync(process.execPath, ["--require", require.resolve("ts-node/register/transpile-only"), "--eval", `require(${JSON.stringify(target)})`], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
    assert.equal(child.stderr, "");
  });
}

test("shared refund contracts retain strict identifiers and successful USD funds validation", () => {
  assert.equal(contracts.nativeRefundId.parse("ref_valid"), "ref_valid");
  assert.equal(contracts.stripeRefundId.parse("re_valid"), "re_valid");
  for (const invalid of ["re_wrong", "ref_bad-id", `ref_${"a".repeat(117)}`]) assert.throws(() => contracts.nativeRefundId.parse(invalid));
  for (const invalid of ["ref_wrong", "re_bad-id", `re_${"a".repeat(118)}`]) assert.throws(() => contracts.stripeRefundId.parse(invalid));
  const value = { id: "re_valid", object: "refund", amount: 1078, currency: "usd", status: "succeeded", created: 1791622507, payment_intent: "pi_valid", metadata: { snowforce_operation: "123e4567-e89b-42d3-a456-426614174001", snowforce_allocation: "verified", snowforce_order: "order_valid", snowforce_payment: "pay_valid" } };
  assert.equal(contracts.verifiedStripeRefundSchema.parse(value).payment_intent, "pi_valid");
  assert.equal(contracts.verifiedStripeRefundSchema.parse({ ...value, payment_intent: { id: "pi_valid" } }).payment_intent, "pi_valid");
  for (const patch of [{ status: "pending" }, { currency: "eur" }, { amount: 0 }, { amount: 1.5 }, { amount: 100_000_000 }, { payment_intent: "bad" }]) assert.throws(() => contracts.verifiedStripeRefundSchema.parse({ ...value, ...patch }));
  assert.equal(require("../src/lib/tax-refund-funds.ts").verifiedStripeRefundSchema, contracts.verifiedStripeRefundSchema);
});
