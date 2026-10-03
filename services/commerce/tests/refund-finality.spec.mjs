import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const Stripe = require("stripe");
const { ContainerRegistrationKeys, PaymentWebhookEvents, PaymentEvents } = require("@medusajs/framework/utils");
const service = require("../src/lib/refund-finality.ts");
const handler = require("../src/subscribers/refund-finality.ts");
const at = () => new Date().toISOString();
const raw = () => ({ id: "order_fixture", currency_code: "usd", payments: [{ id: "pay_fixture", provider_id: "pp_stripe_stripe", currency_code: "usd", amount_cents: "100", intent_id: "pi_fixture", livemode: false, canceled: false, captures: [{ id: "cap_fixture", amount_cents: "100" }], refunds: [{ id: "ref_fixture", amount_cents: "35" }] }] });
const refund = (changes = {}) => ({ id: "re_fixture", payment_intent: "pi_fixture", currency: "usd", amount: 3500, status: "succeeded", created: 1790880000, ...changes });
function reader(refunds = [refund()], intent = {}) {
  const calls = [];
  return { livemode: false, calls, retrieveIntent: async (id) => { calls.push(["intent", id]); return { id, currency: "usd", livemode: false, status: "succeeded", amount: 10000, amount_received: 10000, ...intent }; }, listRefunds: async (id, cursor) => { calls.push(["refunds", id, cursor]); return { has_more: false, data: refunds }; } };
}
function dbFixture() {
  let source = raw();
  const sqls = [], writes = [], events = [];
  let depth = 0;
  const db = { transaction: async (callback) => { depth++; try { return await callback(db); } finally { depth--; } }, raw: async (sql, values = []) => {
    sqls.push(sql);
    if (sql.startsWith("select o.id")) return { rows: [structuredClone(source)] };
    if (sql.startsWith("select p.id")) { assert.equal(depth, 1); return { rows: source.payments.map(({ id }) => ({ id })) }; }
    if (sql.startsWith("insert into")) { assert.equal(depth, 1); writes.push([sql, values]); return { rows: [{ order_id: source.id }] }; }
    if (sql.startsWith("select distinct")) return { rows: events };
    throw new Error("Unexpected DB access");
  } };
  return { db, sqls, writes, events, get source() { return source; }, set source(value) { source = value; }, get depth() { return depth; }, scope: { resolve: (name) => { assert.equal(name, ContainerRegistrationKeys.PG_CONNECTION); return db; } } };
}
test("native money requires exact nonnegative USD cents and unique payment/refund identities", async () => {
  for (const changed of [{ amount_cents: "0.001" }, { amount_cents: "-1" }, { currency_code: "eur" }, { refunds: [{ id: "ref_fixture", amount_cents: "NaN" }] }, { captures: [{ id: "ref_fixture", amount_cents: "100" }] }]) {
    const c = dbFixture(); c.source.payments[0] = { ...c.source.payments[0], ...changed };
    await assert.rejects(() => service.readNativeRefundFunds(c.db, "order_fixture"));
  }
  const c = dbFixture(); const value = await service.readNativeRefundFunds(c.db, "order_fixture");
  assert.equal(value.payments[0].amount_cents, 10000); assert.equal(value.payments[0].refunds[0].amount_cents, 3500);
  const original = service.refundFundsFingerprint(value);
  value.payments[0].refunds[0].amount_cents++;
  assert.notEqual(service.refundFundsFingerprint(value), original);
});
test("reads Stripe outside DB transactions and verifies every native capture and refund cent", async () => {
  const c = dbFixture(), r = reader();
  const check = await service.verifyOrderRefundFunds(c.scope, "order_fixture", { ...r, retrieveIntent: async (id) => { assert.equal(c.depth, 0); return r.retrieveIntent(id); } });
  assert.equal(check.state, "verified"); assert.equal(check.payments[0].succeeded_refund_cents, 3500);
  assert.doesNotThrow(() => service.assertRefundFundsSucceeded(check));
  await c.db.transaction((db) => service.saveRefundFundsCheck(db, check, { source: "staff", staff_id: "user_fixture", request_id: "22222222-2222-4222-8222-222222222222" }));
  assert.equal(c.writes.length, 2);
  assert.equal(JSON.parse(c.writes[0][1][4]).payments[0].refunds[0].id, "re_fixture");
  assert.ok(c.sqls.every((sql) => !sql.includes("set metadata")));
});
test("pending and action-required refunds block completion even when native balances are settled", async () => {
  for (const status of ["pending", "requires_action"]) {
    const c = dbFixture(); const check = await service.verifyOrderRefundFunds(c.scope, "order_fixture", reader([refund({ status })]));
    assert.equal(check.state, "pending"); assert.throws(() => service.assertRefundFundsSucceeded(check));
    await c.db.transaction((db) => service.saveRefundFundsCheck(db, check, { source: "stripe_webhook", event_id: "evt_fixture" }));
    assert.equal(JSON.parse(c.writes[0][1][4]).payments[0].refunds[0].status, status);
  }
});
test("failed/canceled, uncaptured payments, native/Stripe differences and out-of-band refunds are exceptions", async () => {
  const scenarios = [reader([refund({ status: "failed" })]), reader([refund({ status: "canceled" })]), reader([], { status: "requires_capture", amount_received: 0 }), reader([refund({ amount: 3501 })]), reader([refund(), refund({ id: "re_extra", amount: 1 })]), reader([refund()], { amount_received: 9999 }), reader([refund()], { amount: 10001 })];
  for (const r of scenarios) { const c = dbFixture(), check = await service.verifyOrderRefundFunds(c.scope, "order_fixture", r); assert.equal(check.state, "exception"); assert.throws(() => service.assertRefundFundsSucceeded(check)); }
  // A failed historical attempt doesn't prevent a later, fully reconciled replacement refund.
  const c = dbFixture(); assert.equal((await service.verifyOrderRefundFunds(c.scope, "order_fixture", reader([refund(), refund({ id: "re_oldfailed", status: "failed" })]))).state, "verified");
});
test("rejects foreign currency, intent/environment identities, unsupported providers and malformed statuses", async () => {
  for (const r of [reader([refund({ currency: "eur" })]), reader([refund({ payment_intent: "pi_foreign" })]), reader([refund({ status: "unknown" })]), reader([refund()], { livemode: true }), reader([refund()], { id: "pi_other" })]) {
    const c = dbFixture(); await assert.rejects(() => service.verifyOrderRefundFunds(c.scope, "order_fixture", r)); assert.equal(c.writes.length, 0);
  }
  for (const changed of [{ provider_id: "pp_system_default" }, { intent_id: null }, { canceled: true }]) { const c = dbFixture(); Object.assign(c.source.payments[0], changed); await assert.rejects(() => service.verifyOrderRefundFunds(c.scope, "order_fixture", reader())); }
});
test("fully paginates refunds and rejects empty, duplicate or cyclic pages", async () => {
  const c = dbFixture(); c.source.payments[0].refunds[0].amount_cents = "1.01";
  const calls = []; const r = { ...reader(), listRefunds: async (_id, cursor) => { calls.push(cursor); return cursor ? { has_more: false, data: [refund({ id: "re_last", amount: 1 })] } : { has_more: true, data: Array.from({ length: 100 }, (_, index) => refund({ id: `re_page${index}`, amount: 1 })) }; } };
  assert.equal((await service.verifyOrderRefundFunds(c.scope, "order_fixture", r)).state, "verified"); assert.deepEqual(calls, [undefined, "re_page99"]);
  for (const listRefunds of [async () => ({ has_more: true, data: [] }), async () => ({ has_more: true, data: [refund()] }), async () => ({ has_more: false, data: [refund(), refund()] })]) await assert.rejects(() => service.verifyOrderRefundFunds(c.scope, "order_fixture", { ...reader(), listRefunds }));
});
test("payment changes, stale observations and newer checks cannot be overwritten", async () => {
  const c = dbFixture(), check = await service.verifyOrderRefundFunds(c.scope, "order_fixture", reader());
  c.source.payments[0].refunds[0].amount_cents = "34.99";
  await assert.rejects(() => c.db.transaction((db) => service.saveRefundFundsCheck(db, check, { source: "native_payment", payment_id: "pay_fixture" }))); assert.equal(c.writes.length, 0);
  const fresh = dbFixture(), second = await service.verifyOrderRefundFunds(fresh.scope, "order_fixture", reader());
  await assert.rejects(() => fresh.db.transaction((db) => service.saveRefundFundsCheck(db, second, { source: "native_payment", payment_id: "pay_fixture" }, Date.parse(second.observed_at) + 120001)));
  const originalRaw = fresh.db.raw;
  fresh.db.raw = (sql, values) => sql.startsWith("insert into commerce.snowforce_refund_verifications(") ? Promise.resolve({ rows: [] }) : originalRaw(sql, values);
  await assert.rejects(() => fresh.db.transaction((db) => service.saveRefundFundsCheck(db, second, { source: "native_payment", payment_id: "pay_fixture" }))); assert.equal(fresh.writes.length, 0);
});
test("sanitizes transport errors and never stores raw provider secrets", async () => {
  const c = dbFixture(); await assert.rejects(() => service.verifyOrderRefundFunds(c.scope, "order_fixture", { ...reader(), retrieveIntent: async () => { throw new Error("sk_test_do_not_log"); } }), (error) => !error.message.includes("do_not_log"));
  const check = await service.verifyOrderRefundFunds(c.scope, "order_fixture", { ...reader(), retrieveIntent: async (id) => ({ ...(await reader().retrieveIntent(id)), client_secret: "not_for_audit" }) });
  assert.ok(!JSON.stringify(check).includes("not_for_audit"));
});
test("actual SDK verifies signed raw bytes including queued Buffers; rejects tampering and environment mismatch", () => {
  const previous = { key: process.env.COMMERCE_STRIPE_API_KEY, secret: process.env.COMMERCE_STRIPE_WEBHOOK_SECRET };
  process.env.COMMERCE_STRIPE_API_KEY = "sk_test_fixture"; process.env.COMMERCE_STRIPE_WEBHOOK_SECRET = "whsec_fixture";
  try {
    const client = new Stripe("sk_test_fixture");
    const payload = JSON.stringify({ id: "evt_fixture", type: "refund.updated", livemode: false, data: { object: { payment_intent: "pi_fixture" } } });
    const signature = client.webhooks.generateTestHeaderString({ payload, secret: "whsec_fixture" });
    const event = (rawData, header = signature) => ({ provider: "stripe_stripe", payload: { rawData, data: { payment_intent: "pi_foreign" }, headers: { "stripe-signature": header } } });
    for (const value of [payload, Buffer.from(payload), Buffer.from(payload).toJSON()]) assert.deepEqual(service.refundWebhookIntent(event(value)), { intent_id: "pi_fixture", event_id: "evt_fixture" });
    assert.throws(() => service.refundWebhookIntent(event(payload + " "))); assert.throws(() => service.refundWebhookIntent(event(payload, "invalid")));
    process.env.COMMERCE_STRIPE_API_KEY = "sk_live_fixture"; assert.throws(() => service.refundWebhookIntent(event(payload)));
    assert.equal(service.refundWebhookIntent({ ...event(payload), provider: "other_provider" }), null);
  } finally { for (const [name, value] of [["COMMERCE_STRIPE_API_KEY", previous.key], ["COMMERCE_STRIPE_WEBHOOK_SECRET", previous.secret]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});
test("subscriber ignores foreign payments and declares both native-refund and verified webhook observers", async () => {
  assert.ok(handler.config.event.includes(PaymentWebhookEvents.WebhookReceived)); assert.ok(handler.config.event.includes(PaymentEvents.REFUNDED));
  const c = dbFixture(); await handler.default({ event: { name: PaymentEvents.REFUNDED, data: { id: "pay_foreign" } }, container: c.scope }); assert.equal(c.writes.length, 0);
  assert.ok(c.sqls[0].includes("pp_stripe_stripe"));
});
test("a matched native event persists real refund status and signed old events reread current funds", async () => {
  const c = dbFixture(); c.events.push({ order_id: "order_fixture" });
  await handler.default({ event: { name: PaymentEvents.REFUNDED, data: { id: "pay_fixture" } }, container: c.scope }, reader([refund({ status: "pending" })]));
  assert.equal(JSON.parse(c.writes[0][1][4]).state, "pending");
  const previous = [process.env.COMMERCE_STRIPE_API_KEY, process.env.COMMERCE_STRIPE_WEBHOOK_SECRET];
  process.env.COMMERCE_STRIPE_API_KEY = "sk_test_fixture"; process.env.COMMERCE_STRIPE_WEBHOOK_SECRET = "whsec_fixture";
  try {
    const client = new Stripe("sk_test_fixture");
    const rawData = JSON.stringify({ id: "evt_oldfailure", type: "refund.failed", livemode: false, data: { object: refund({ status: "failed" }) } });
    const payload = { rawData, headers: { "stripe-signature": client.webhooks.generateTestHeaderString({ payload: rawData, secret: "whsec_fixture" }) } };
    await handler.default({ event: { name: PaymentWebhookEvents.WebhookReceived, data: { provider: "stripe_stripe", payload } }, container: c.scope }, reader());
    assert.equal(JSON.parse(c.writes[2][1][4]).state, "verified");
    assert.equal(JSON.parse(c.writes[2][1][5]).event_id, "evt_oldfailure");
    await handler.default({ event: { name: PaymentWebhookEvents.WebhookReceived, data: { provider: "stripe_stripe", payload } }, container: c.scope }, reader([refund({ status: "failed" })]));
    assert.equal(JSON.parse(c.writes[4][1][4]).state, "exception");
  } finally { for (const [index, name] of ["COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET"].entries()) { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; } }
});
