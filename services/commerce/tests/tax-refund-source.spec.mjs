import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { refundFixture } from "./fixtures/tax-refund.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { taxSaleRequest, taxSaleFingerprint } = require("../src/lib/tax-sale-contract.ts");
const { readTaxRefundSource } = require("../src/lib/tax-refund-source.ts");
function fixture() {
  const f = refundFixture({ duplicateSku: true });
  const request = taxSaleRequest(f.sale.source, f.sale.operation_id);
  f.row = { operation_id: f.sale.operation_id, order_id: f.sale.source.order_id, account_id: f.sale.source.input.account_id, livemode: false,
    transaction_id: f.sale.snapshot.transaction.id, source: structuredClone(f.sale.source), source_fingerprint: taxSaleFingerprint(f.sale.source),
    request, request_fingerprint: taxSaleFingerprint(request), snapshot: f.sale.snapshot };
  f.orderLines = f.orderLines.map(line => ({ ...line, raw_unit_price: { value: line.unit_price }, raw_quantity: { value: String(line.quantity) } }));
  f.reads = []; f.rows = [f.row];
  f.scope = { resolve: () => ({ raw: async (sql, values) => {
    assert.ok(sql.startsWith("select ")); f.reads.push({ sql, values });
    if (sql.includes("from commerce.snowforce_tax_sales")) return { rows: f.rows };
    if (sql.includes("from commerce.order_item")) return { rows: f.orderLines };
    assert.fail("Unexpected private query");
  } }) };
  f.run = () => readTaxRefundSource(f.scope, f.sale.source.order_id, async (_scope, id) => { assert.equal(id, f.sale.source.order_id); return f.sale.source; });
  return f;
}
test("refund source uses committed original sale and version-one native marked lines without provider or product reads", async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.sale.source.order_id, f.sale.source.order_id); assert.equal(result.bindings.length, 2);
  assert.equal(f.reads.length, 2); assert.deepEqual(f.reads[1].values, [f.sale.source.order_id, f.sale.source.quote_id]);
  assert.ok(f.reads[0].sql.includes("t.state='ready'")); assert.ok(f.reads[1].sql.includes("oi.version=1"));
  assert.ok(!f.reads.some(value => value.sql.includes("from commerce.product")));
});
test("malformed order IDs reject before native or private reads", async () => {
  await assert.rejects(() => readTaxRefundSource({ resolve: () => assert.fail() }, "../../orders", async () => assert.fail()));
});
test("missing, duplicate, incomplete or changed committed sale evidence cannot authorize refunds", async () => {
  for (const patch of [{ source_fingerprint: "f".repeat(64) }, { source: { changed: true } }, { request_fingerprint: "f".repeat(64) },
    { request: { changed: true } }, { account_id: "acct_foreign" }, { livemode: true }, { transaction_id: "tax_foreign" }, { order_id: "order_foreign" },
    { snapshot: { transaction: { type: "reversal" }, lines: [] } }]) {
    const f = fixture(); Object.assign(f.row, patch); await assert.rejects(f.run); assert.equal(f.reads.length, 1);
  }
  for (const rows of [[], [{}, {}]]) { const f = fixture(); f.rows = rows; await assert.rejects(f.run); }
});
test("changes to the historical native capture are detected against the committed original sale", async () => {
  const f = fixture(); f.sale.source.capture_id = "cap_changed"; await assert.rejects(f.run); assert.equal(f.reads.length, 1);
});
test("native raw price and quantity disagreements or unsupported precision reject rather than using rounded values", async () => {
  for (const patch of [{ raw_unit_price: { value: "9.99" } }, { raw_quantity: { value: "2" } }, { unit_price: "10.001" }, { quantity: "1.5" }]) {
    const f = fixture(); Object.assign(f.orderLines[0], patch); await assert.rejects(f.run);
  }
});
test("missing original markers and duplicate native order bindings remain reconciliation errors", async () => {
  for (const change of [f => { f.orderLines.pop(); }, f => { f.orderLines[0].tax_lines[0].metadata.cart_line_id = "cali_unknown"; },
    f => { f.orderLines.push(structuredClone(f.orderLines[0])); }]) {
    const f = fixture(); change(f); await assert.rejects(f.run);
  }
});
