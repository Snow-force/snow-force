import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { test } from "node:test";
import { refundFixture, reversalFixture, operation } from "./fixtures/tax-refund.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { bindRefundOrderLines, buildTaxRefundAllocation, taxRefundReversalRequest, assertTaxRefundReversal } = require("../src/lib/tax-refund-contract.ts");
const Stripe = require("stripe");
const clone = structuredClone;
const plan = (f, history = [], input = f.input, id = operation(0)) => buildTaxRefundAllocation(f.sale, f.orderLines, history, input, id);

test("successive actual sale allocations conserve original discounted merchandise and tax cents", () => {
  const f = refundFixture(), history = [];
  for (let i = 0; i < 3; i++) history.push(plan(f, history, f.input, operation(i)));
  assert.deepEqual(history.map(value => value.total_cents), [1052, 1051, 1050]);
  assert.equal(history.reduce((sum, value) => sum + value.lines[0].net_cents, 0), 2999);
  assert.equal(history.reduce((sum, value) => sum + value.lines[0].sales_tax_cents, 0), 154);
  assert.throws(() => plan(f, history, f.input, operation(3)));
  assert.equal(plan(f, [], { ...f.input, items: [{ item_id: "ordli_0", quantity: 3 }] }).total_cents, 3153);
});
test("explicit native tax-line markers disambiguate duplicate SKUs and reject missing or reassigned bindings", () => {
  const f = refundFixture({ duplicateSku: true });
  assert.deepEqual(bindRefundOrderLines(f.sale, f.orderLines), [{ item_id: "ordli_0", cart_line_id: "cali_sale" }, { item_id: "ordli_1", cart_line_id: "cali_second" }]);
  assert.equal(plan(f, [], { ...f.input, items: [{ item_id: "ordli_1", quantity: 1 }] }).total_cents, 1051);
  for (const mutate of [lines => lines.pop(), lines => lines.push(clone(lines[0])), lines => { lines[0].tax_lines = []; },
    lines => { lines[0].tax_lines[0].metadata.cart_line_id = "cali_second"; }, lines => { lines[0].tax_lines[0].metadata.quote_id = operation(9); },
    lines => { lines[0].variant_id = "variant_foreign"; }, lines => { lines[0].quantity = 2; }, lines => { lines[0].unit_price = "9.99"; }]) {
    const lines = clone(f.orderLines); mutate(lines); assert.throws(() => buildTaxRefundAllocation(f.sale, lines, [], f.input, operation(0)));
  }
});
test("refund input cannot supply cents, prices, duplicate items or unsupported quantities", () => {
  const f = refundFixture();
  for (const patch of [{ amount: 100 }, { price: "1.00" }, { items: [{ item_id: "ordli_0", quantity: 0 }] },
    { items: [{ item_id: "ordli_0", quantity: 1.5 }] }, { items: [{ item_id: "ordli_0", quantity: 4 }] },
    { items: [{ item_id: "ordli_unknown", quantity: 1 }] }, { items: [f.input.items[0], f.input.items[0]] }, { items: [] }])
    assert.throws(() => plan(f, [], { ...f.input, ...patch }));
});
test("pending reservations and immutable history prevent repeated units, operations and altered money", () => {
  const f = refundFixture(), first = plan(f);
  assert.throws(() => plan(f, [first], f.input, first.operation_id));
  for (const patch of [{ order_id: "order_foreign" }, { sale_transaction_id: "tax_foreign" }, { sale_fingerprint: "f".repeat(64) },
    { total_cents: first.total_cents + 1 }, { lines: [{ ...first.lines[0], already_returned: 1 }] },
    { lines: [{ ...first.lines[0], net_cents: first.lines[0].net_cents + 1 }], total_cents: first.total_cents + 1 },
    { lines: [{ ...first.lines[0], original_line_item: "tax_li_foreign" }] }, { lines: [first.lines[0], first.lines[0]] }])
    assert.throws(() => plan(f, [{ ...first, ...patch }], f.input, operation(1)));
  assert.throws(() => plan(f, [first, first], f.input, operation(1)));
});
test("shipping refunds use the original net and sales tax once, independent of returned items", () => {
  const f = refundFixture(), first = plan(f, [], { ...f.input, items: [], refund_shipping: true });
  assert.equal(first.shipping_cents, 995); assert.equal(first.shipping_tax_cents, 37); assert.equal(first.total_cents, 1032);
  assert.throws(() => plan(f, [first], { ...f.input, refund_shipping: true }, operation(1)));
  assert.equal(plan(f, [first], f.input, operation(1)).total_cents, 1052);
});
test("government delivery fees require explicit review, can be retained or refunded separately, and cannot repeat", () => {
  const f = refundFixture({ fee: 28, freeShipping: true });
  assert.throws(() => plan(f, [], { ...f.input, fee_decisions: [] }));
  assert.throws(() => plan(f, [], { ...f.input, fee_decisions: [{ state: "MN", refund: true, rationale: "Reviewed" }] }));
  assert.throws(() => plan(f, [], { ...f.input, fee_decisions: [{ state: "CO", refund: true, rationale: "no" }] }));
  const retained = plan(f); assert.equal(retained.fees.length, 0); assert.equal(retained.total_cents, 1052);
  const refunded = plan(f, [retained], { items: [], refund_shipping: false, fee_decisions: [{ state: "CO", refund: true, rationale: "Fixture approved fee refund" }] }, operation(1));
  assert.equal(refunded.total_cents, 28); assert.deepEqual(taxRefundReversalRequest(f.sale, refunded).shipping_cost, { amount: -0, amount_tax: -28 });
  assert.throws(() => plan(f, [retained, refunded], { ...f.input, fee_decisions: [{ state: "CO", refund: true, rationale: "Reviewed again" }] }, operation(2)));
});
test("specific-line reversal uses committed transaction IDs and original exact amounts, without flat proration", () => {
  const f = refundFixture(), allocation = plan(f), request = taxRefundReversalRequest(f.sale, allocation);
  assert.equal(request.mode, "partial"); assert.equal(request.original_transaction, "tax_sale");
  assert.equal(request.reference, `snowforce-refund:${allocation.operation_id}`); assert.ok(!("flat_amount" in request));
  assert.deepEqual(request.line_items, [{ original_line_item: "tax_li_sale0", reference: `${allocation.operation_id}:cali_sale`, quantity: 1, amount: -1000, amount_tax: -52 }]);
  const remote = reversalFixture(f.sale, allocation, request);
  assert.equal(assertTaxRefundReversal(f.sale, allocation, remote.transaction, remote.lines).total_cents, 1052);
});
test("tax-exempt merchandise reverses its original net cents and a zero tax amount", () => {
  const f = refundFixture({ taxCents: 0 }), allocation = plan(f), request = taxRefundReversalRequest(f.sale, allocation);
  assert.equal(allocation.total_cents, 1000); assert.equal(request.line_items[0].amount_tax, -0);
  const remote = reversalFixture(f.sale, allocation, request);
  assert.equal(assertTaxRefundReversal(f.sale, allocation, remote.transaction, remote.lines).total_cents, 1000);
});
test("a reversal request cannot be built from altered allocation cents, shipping decisions or another committed sale", () => {
  const f = refundFixture(), allocation = plan(f);
  for (const patch of [{ order_id: "order_foreign" }, { sale_transaction_id: "tax_foreign" }, { sale_fingerprint: "f".repeat(64) },
    { total_cents: 1051 }, { lines: [{ ...allocation.lines[0], net_cents: 999 }], total_cents: 1051 }, { refund_shipping: true },
    { fees: [{ state: "CO", amount_cents: 28, rationale: "Unreviewed fee refund" }], total_cents: allocation.total_cents + 28 }])
    assert.throws(() => taxRefundReversalRequest(f.sale, { ...allocation, ...patch }));
});
test("reversal evidence rejects a foreign sale, mode, currency, environment, tax code, quantity or cent discrepancy", () => {
  const f = refundFixture(), allocation = plan(f), remote = reversalFixture(f.sale, allocation, taxRefundReversalRequest(f.sale, allocation));
  for (const patch of [{ id: "tax_sale" }, { type: "transaction" }, { currency: "eur" }, { livemode: true },
    { reference: "foreign" }, { reversal: { original_transaction: "tax_foreign" } }, { metadata: {} }, { posted_at: f.sale.source.captured_at - 1 },
    { posted_at: remote.transaction.created + 1 }, { tax_date: remote.transaction.tax_date + 1 },
    { shipping_cost: { amount: -1, amount_tax: 0, tax_behavior: "exclusive", tax_code: "txcd_92010001" } }])
    assert.throws(() => assertTaxRefundReversal(f.sale, allocation, { ...remote.transaction, ...patch }, remote.lines));
  for (const patch of [{ id: "tax_li_sale0" }, { quantity: 2 }, { amount: -999 }, { amount_tax: -51 }, { livemode: true }, { tax_code: "txcd_foreign" },
    { reference: "foreign" }, { type: "transaction" }, { reversal: { original_line_item: "tax_li_foreign" } }])
    assert.throws(() => assertTaxRefundReversal(f.sale, allocation, remote.transaction, [{ ...remote.lines[0], ...patch }]));
  assert.throws(() => assertTaxRefundReversal(f.sale, allocation, remote.transaction, []));
  assert.throws(() => assertTaxRefundReversal(f.sale, allocation, remote.transaction, [remote.lines[0], remote.lines[0]]));
});
test("shipping and reviewed delivery fee reversals validate each original component even when totals match", () => {
  const f = refundFixture({ fee: 28 }), allocation = plan(f, [], { ...f.input, refund_shipping: true, fee_decisions: [{ state: "CO", refund: true, rationale: "Fixture delivery decision reviewed" }] });
  const request = taxRefundReversalRequest(f.sale, allocation), remote = reversalFixture(f.sale, allocation, request);
  assert.deepEqual(request.shipping_cost, { amount: -995, amount_tax: -65 });
  assert.equal(assertTaxRefundReversal(f.sale, allocation, remote.transaction, remote.lines).total_cents, 2112);
  for (const shipping_cost of [null, { ...remote.transaction.shipping_cost, amount: -996, amount_tax: -64 }, { ...remote.transaction.shipping_cost, tax_code: "txcd_foreign" }])
    assert.throws(() => assertTaxRefundReversal(f.sale, allocation, { ...remote.transaction, shipping_cost }, remote.lines));
});
test("installed Stripe SDK serializes the specific-line reversal and idempotency key to a local HTTP fixture", async () => {
  const f = refundFixture(), allocation = plan(f), request = taxRefundReversalRequest(f.sale, allocation), remote = reversalFixture(f.sale, allocation, request);
  const calls = [], server = createServer(async (req, res) => { let body = ""; for await (const chunk of req) body += chunk; calls.push({ url: req.url, method: req.method, key: req.headers["idempotency-key"], body: new URLSearchParams(body) }); res.setHeader("content-type", "application/json"); res.end(JSON.stringify(remote.transaction)); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const stripe = new Stripe("sk_test_localfixture", { host: "127.0.0.1", port: server.address().port, protocol: "http", apiVersion: "2026-09-30.endive", maxNetworkRetries: 0 });
    await stripe.tax.transactions.createReversal(request, { idempotencyKey: `snowforce-tax-refund:${allocation.operation_id}` });
    assert.equal(calls.length, 1); const call = calls[0];
    assert.equal(call.url, "/v1/tax/transactions/create_reversal"); assert.equal(call.method, "POST"); assert.equal(call.key, `snowforce-tax-refund:${allocation.operation_id}`);
    assert.equal(call.body.get("line_items[0][amount]"), "-1000"); assert.equal(call.body.get("line_items[0][amount_tax]"), "-52");
    assert.equal(call.body.get("line_items[0][original_line_item]"), "tax_li_sale0"); assert.equal(call.body.get("mode"), "partial");
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
