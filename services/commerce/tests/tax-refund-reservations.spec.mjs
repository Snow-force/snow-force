import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { refundFixture, operation } from "./fixtures/tax-refund.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { taxSaleFingerprint } = require("../src/lib/tax-sale-contract.ts");
const { reserveTaxRefund, startTaxRefundReservation, cancelTaxRefundReservation, checkedTaxRefundReservation } = require("../src/lib/tax-refund-reservations.ts");
function fixture(options) {
  const f = refundFixture(options), now = Math.floor(Date.now() / 1000), records = [];
  f.context = { case_id: operation(50), case_version: 3, native_return_id: "return_fixture", staff_id: "user_fixture" };
  f.case = { order_id: f.sale.source.order_id, kind: "return", status: "processing", version: 3, native_id: "return_fixture",
    items: f.orderLines.map(line => ({ id: line.id, quantity: line.quantity })), created_at: new Date((now - 2) * 1000) };
  f.return = { id: "return_fixture", order_id: f.sale.source.order_id, exchange_id: null, claim_id: null, canceled_at: null, status: "received", created_at: new Date(now * 1000) };
  f.lines = f.orderLines.map(line => ({ item_id: line.id, quantity: String(line.quantity), raw_quantity: { value: String(line.quantity) }, received_quantity: String(line.quantity), raw_received_quantity: { value: String(line.quantity) } }));
  f.committed = { source: structuredClone(f.sale.source), snapshot: structuredClone(f.sale.snapshot), account_id: f.sale.source.input.account_id, livemode: false, transaction_id: f.sale.snapshot.transaction.id };
  f.records = records; f.reads = []; f.sourceReads = 0; f.orderExists = f.staffExists = f.exchangeExists = f.paymentExists = true; f.nativeRefunds = [];
  const db = { transaction: async action => { const saved = structuredClone(records); try { return await action(db); } catch (error) { records.splice(0, records.length, ...saved); throw error; } }, raw: async (sql, values = []) => {
    f.reads.push(sql); let rows;
    if (sql.startsWith('select id from commerce."order"')) rows = f.orderExists ? [{}] : [];
    else if (sql.startsWith('select id from commerce."user"')) rows = f.staffExists ? [{}] : [];
    else if (sql.startsWith('select id from commerce.payment')) rows = f.paymentExists ? [{}] : [];
    else if (sql.includes("from commerce.snowforce_refund_allocations")) rows = sql.includes("order by sequence") ? [...records].sort((a, b) => a.sequence - b.sequence) : records.filter(row => row.id === values[0] && (!values[1] || row.order_id === values[1]));
    else if (sql.includes("from commerce.snowforce_tax_sale_tasks")) rows = [f.committed];
    else if (sql.startsWith("select id from commerce.refund")) rows = f.nativeRefunds;
    else if (sql.startsWith("select f.native_refund_id")) rows = [];
    else if (sql.includes("from commerce.snowforce_after_sales")) rows = [f.case];
    else if (sql.includes('from commerce."return"')) rows = [f.return];
    else if (sql.includes("from commerce.return_item")) rows = f.lines;
    else if (sql.includes("from commerce.order_exchange")) rows = f.exchangeExists ? [{}] : [];
    else if (sql.startsWith("insert into commerce.snowforce_refund_allocations")) {
      const [id, order_id, sale_task_id, case_id, case_version, native_return_id, staff_id, account_id, livemode, payment_id, total_cents, input, input_fingerprint, source_data, source_fingerprint, allocation, allocation_fingerprint, request, request_fingerprint] = values;
      const row = { id, sequence: records.length + 1, order_id, sale_task_id, case_id, case_version, native_return_id, staff_id, account_id, livemode, payment_id, total_cents,
        input: JSON.parse(input), input_fingerprint, source_data: JSON.parse(source_data), source_fingerprint, allocation: JSON.parse(allocation), allocation_fingerprint, request: JSON.parse(request), request_fingerprint,
        state: "reserved", first_attempt_at: null, cancelled_at: null, cancellation_reason: null };
      records.push(row); rows = [row]; if (f.failAfterInsert) throw Error("Fixture transaction failure");
    } else if (sql.startsWith("update commerce.snowforce_refund_allocations")) {
      const cancelling = sql.includes("state='cancelled'"), row = records.find(row => row.id === values[cancelling ? 1 : 0]); assert.ok(row);
      if (cancelling) Object.assign(row, { state: "cancelled", cancelled_at: now, cancellation_reason: values[0] });
      else Object.assign(row, { state: "started", first_attempt_at: now }); rows = [row];
    } else assert.fail(`Unexpected reservation query: ${sql}`);
    return { rows: structuredClone(rows) };
  } };
  f.scope = { resolve: () => db };
  f.reserve = (id = operation(0), input = f.input, context = f.context) => reserveTaxRefund(f.scope, f.sale.source.order_id, id, input, context, async () => { f.sourceReads++; return { sale: f.sale, order_lines: f.orderLines }; });
  f.start = (id = operation(0), staff = f.context.staff_id) => startTaxRefundReservation(f.scope, f.sale.source.order_id, id, staff);
  f.cancel = (id = operation(0), reason = "Fixture reviewer cancelled", staff = f.context.staff_id) => cancelTaxRefundReservation(f.scope, f.sale.source.order_id, id, staff, reason);
  return f;
}
test("malformed reservation selections and review context fail before private dependencies", async () => {
  const scope = { resolve: () => assert.fail() }, f = fixture();
  for (const args of [["../orders", operation(0), f.input, f.context], [f.sale.source.order_id, "bad", f.input, f.context],
    [f.sale.source.order_id, operation(0), { ...f.input, total_cents: 1 }, f.context], [f.sale.source.order_id, operation(0), f.input, { ...f.context, staff_id: "cus_owner" }]])
    await assert.rejects(() => reserveTaxRefund(scope, ...args));
});
test("reservation saves original amounts, private source, exact reversal and all fingerprints before any provider attempt", async () => {
  const f = fixture({ fee: 28 }), row = await f.reserve();
  assert.equal(row.total_cents, 1052); assert.equal(row.state, "reserved"); assert.equal(row.first_attempt_at, null);
  assert.equal(row.source_fingerprint, taxSaleFingerprint(row.source_data)); assert.equal(row.request.original_transaction, f.sale.snapshot.transaction.id);
  assert.equal(f.records.length, 1); assert.equal(f.sourceReads, 1);
  assert.ok(f.reads[0].includes("for update")); assert.ok(f.reads.some(sql => sql.includes("for share of t,s")));
});
test("a lost response reuses the same reservation after later case edits, without recalculating", async () => {
  const f = fixture(), row = await f.reserve(); f.case.version++; f.case.status = "completed";
  assert.deepEqual(await f.reserve(), row); assert.equal(f.sourceReads, 1); assert.equal(f.records.length, 1);
});
test("reusing an operation with changed quantities, delivery decisions, case or reviewer rejects", async () => {
  const f = fixture(); await f.reserve();
  for (const [input, context] of [[{ ...f.input, items: [{ ...f.input.items[0], quantity: 2 }] }, f.context], [{ ...f.input, refund_shipping: true }, f.context],
    [f.input, { ...f.context, case_version: 4 }], [f.input, { ...f.context, case_id: operation(51) }], [f.input, { ...f.context, native_return_id: "return_other" }], [f.input, { ...f.context, staff_id: "user_other" }]])
    await assert.rejects(() => f.reserve(operation(0), input, context));
  assert.equal(f.records.length, 1);
});
test("selection order does not change a reviewed reservation or its retry fingerprint", async () => {
  const f = fixture({ duplicateSku: true }), input = { ...f.input, items: f.orderLines.map(line => ({ item_id: line.id, quantity: 1 })) };
  const row = await f.reserve(operation(0), input);
  assert.deepEqual(await f.reserve(operation(0), { ...input, items: [...input.items].reverse() }), row);
  assert.equal(f.records.length, 1);
});
test("sequential reservations include untouched and started plans and conserve original rounding cents", async () => {
  const f = fixture(), first = await f.reserve(); await f.start();
  const second = await f.reserve(operation(1)), third = await f.reserve(operation(2));
  assert.deepEqual([first, second, third].map(row => row.total_cents), [1052, 1051, 1050]);
  await assert.rejects(() => f.reserve(operation(3))); assert.equal(f.records.length, 3);
});
test("unknown orders, reviewers, untracked native refunds and changed committed source reject without reservations", async () => {
  for (const change of [f => f.orderExists = false, f => f.staffExists = false, f => f.paymentExists = false, f => f.nativeRefunds = [{}],
    f => f.committed.account_id = "acct_other", f => f.committed.livemode = true, f => f.committed.transaction_id = "tax_other",
    f => f.committed.source.capture_id = "cap_other", f => f.committed.snapshot.transaction.reference = "changed"]) {
    const f = fixture(); change(f); await assert.rejects(f.reserve); assert.equal(f.records.length, 0);
  }
});
test("closed or stale cases and unrelated, cancelled or unreceived returns never reserve funds", async () => {
  for (const change of [f => f.case.status = "approved", f => f.case.version = 4, f => f.case.order_id = "order_other", f => f.case.native_id = "return_other",
    f => f.return.order_id = "order_other", f => f.return.claim_id = "claim_other", f => f.return.exchange_id = "oexc_other", f => f.return.canceled_at = new Date(),
    f => f.return.status = "canceled", f => f.return.created_at = new Date(0), f => { f.lines[0].received_quantity = "0"; f.lines[0].raw_received_quantity.value = "0"; }]) {
    const f = fixture(); change(f); await assert.rejects(f.reserve); assert.equal(f.records.length, 0);
  }
});
test("raw quantity disagreements, fractional values, duplicate or altered reviewed items fail closed", async () => {
  for (const change of [f => f.lines[0].raw_received_quantity.value = "2", f => f.lines[0].raw_quantity.value = "2", f => f.lines[0].received_quantity = "1.5",
    f => f.lines[0].received_quantity = "4", f => f.lines.push(structuredClone(f.lines[0])), f => f.case.items.push(structuredClone(f.case.items[0])),
    f => f.case.items[0].quantity = 2, f => f.input.items[0].item_id = "ordli_other"]) {
    const f = fixture(); change(f); await assert.rejects(f.reserve); assert.equal(f.records.length, 0);
  }
});
test("receipt quantities cap each case even when original purchased units remain", async () => {
  const f = fixture(); f.lines[0].received_quantity = "1"; f.lines[0].raw_received_quantity.value = "1";
  await f.reserve(); await assert.rejects(() => f.reserve(operation(1))); assert.equal(f.records.length, 1);
});
test("exchange returns require the correct uncancelled native exchange link", async () => {
  const f = fixture(); f.case.kind = "exchange"; f.case.native_id = f.return.exchange_id = "oexc_fixture";
  assert.equal((await f.reserve()).total_cents, 1052);
  const bad = fixture(); bad.case.kind = "exchange"; bad.case.native_id = bad.return.exchange_id = "oexc_fixture"; bad.exchangeExists = false;
  await assert.rejects(bad.reserve);
});
test("shipping and reviewed fees can reserve once after receipt and repeated selections cannot spend them twice", async () => {
  const f = fixture({ fee: 28 }), input = { items: [], refund_shipping: true, fee_decisions: [{ state: "CO", refund: true, rationale: "Fixture fee refund approved" }] };
  assert.equal((await f.reserve(operation(0), input)).total_cents, 1060);
  await assert.rejects(() => f.reserve(operation(1), input));
});
test("transaction failure leaves no allocation and a retry starts at the original rounding position", async () => {
  const f = fixture(); f.failAfterInsert = true; await assert.rejects(f.reserve); assert.equal(f.records.length, 0);
  f.failAfterInsert = false; assert.equal((await f.reserve()).total_cents, 1052);
});
test("starting rechecks receipt and review, is idempotent and permanently prevents cancellation", async () => {
  const f = fixture(); await f.reserve(); await assert.rejects(() => f.start(operation(0), "user_other"));
  f.nativeRefunds = [{}]; await assert.rejects(f.start); f.nativeRefunds = [];
  f.case.version++; await assert.rejects(f.start); f.case.version--;
  const started = await f.start(); assert.equal(started.state, "started"); assert.ok(started.first_attempt_at);
  assert.deepEqual(await f.start(), started); await assert.rejects(f.cancel);
});
test("only the latest untouched reservation can cancel; cancellation keeps audit and safely releases its prefix", async () => {
  const f = fixture(); await f.reserve(); await f.reserve(operation(1));
  await assert.rejects(f.cancel); await assert.rejects(() => f.cancel(operation(1), "Fixture reviewer cancelled", "user_other"));
  const cancelled = await f.cancel(operation(1)); assert.equal(cancelled.state, "cancelled"); assert.equal(f.records.length, 2);
  assert.deepEqual(await f.cancel(operation(1)), cancelled); await assert.rejects(() => f.cancel(operation(1), "Changed cancellation reason"));
  await assert.rejects(() => f.reserve(operation(1))); await assert.rejects(() => f.start(operation(1)));
  assert.equal((await f.reserve(operation(2))).total_cents, 1051);
});
test("recorded private evidence is fully revalidated on every replay, history read, start and cancellation", async () => {
  for (const change of [row => row.total_cents++, row => row.request.reference = "changed", row => row.input_fingerprint = "f".repeat(64),
    row => row.source_fingerprint = "f".repeat(64), row => row.allocation_fingerprint = "f".repeat(64), row => row.request_fingerprint = "f".repeat(64),
    row => row.source_data.order_lines[0].variant_id = "variant_other", row => row.input.items[0].quantity = 2,
    row => row.first_attempt_at = 123, row => row.cancelled_at = 123, row => row.cancellation_reason = "Changed reason",
    row => row.state = "started", row => row.state = "cancelled"]) {
    const f = fixture(); await f.reserve(); change(f.records[0]); assert.throws(() => checkedTaxRefundReservation(f.records[0]));
    await assert.rejects(f.reserve); await assert.rejects(f.start); await assert.rejects(f.cancel); await assert.rejects(() => f.reserve(operation(1)));
  }
});
test("reservation migration installs private invoker, immutable evidence, serialized receipt checks and no public policy", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261009052229_shop_refund_allocations.sql", import.meta.url), "utf8");
  for (const fragment of ["security invoker set search_path=''", "enable row level security", "from public,anon,authenticated,service_role", "before insert or update or delete", "for update", "received_quantity", "Later refund reservations", "old.state<>'reserved'"]) assert.ok(sql.includes(fragment));
  assert.ok(!sql.includes("security definer")); assert.ok(!sql.includes("create policy"));
});
