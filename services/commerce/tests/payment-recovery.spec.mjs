import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const Stripe = require("stripe");
const { ContainerRegistrationKeys } = require("@medusajs/framework/utils");
const service = require("../src/lib/payment-recovery.ts");
const { checkoutCartSchema } = require("../src/lib/checkout-policy.ts");
const at = "2026-10-01T00:00:00.000Z";
function raw() {
  return { id: "cart_fixture", customer_id: "cus_fixture", currency_code: "usd", completed: false, updated_at: at, has_order: false, has_payment: false, has_authorization: false,
    collections: [{ id: "paycol_fixture", link_id: "capaycol_fixture", currency_code: "usd", amount_cents: "100", status: "not_paid", completed: false, authorized_cents: "0", captured_cents: "0", refunded_cents: "0",
      sessions: [{ id: "payses_fixture", provider_id: "pp_stripe_stripe", currency_code: "usd", amount_cents: "100", status: "pending", authorized: false, intent_id: "pi_fixture", livemode: false, data_session_id: "payses_fixture", data_amount_cents: 10000, data_fingerprint: "a".repeat(32), raw_amount_fingerprint: "b".repeat(32), updated_at: at }] }] };
}
function cart() {
  return checkoutCartSchema.parse({ id: "cart_fixture", customer_id: "cus_fixture", currency_code: "usd", region_id: "reg_fixture", email: "fixture@example.test", completed_at: null,
    total: 100, subtotal: 100, tax_total: 0, shipping_total: 0, discount_total: 0, item_total: 100, item_tax_total: 0, shipping_address: null, shipping_methods: [], items: [],
    payment_collection: { id: "paycol_fixture", amount: 100, currency_code: "usd", payment_sessions: [{ id: "payses_fixture", amount: 100, currency_code: "usd", provider_id: "pp_stripe_stripe", status: "pending", data: { id: "pi_fixture", livemode: false, amount: 10000, client_secret: "pi_fixture_secret_do_not_store" } }] } });
}
function reader(changes = {}) {
  const calls = [];
  return { livemode: false, calls, retrieveIntent: async (id) => { calls.push(id); return { id, amount: 10000, currency: "usd", livemode: false, status: "canceled", amount_received: 0, amount_capturable: 0, metadata: { session_id: "payses_fixture" }, ...changes }; } };
}
function fixture() {
    let source = raw(), depth = 0, retired = false;
  const sqls = [], writes = [], locks = [], retirements = [];
  const db = { transaction: async (callback) => {
    const before = structuredClone(source), writeCount = writes.length, wasRetired = retired, retirementCount = retirements.length;
    depth++;
    try { return await callback(db); }
    catch (error) { source = before; writes.length = writeCount; retired = wasRetired; retirements.length = retirementCount; throw error; }
    finally { depth--; }
  }, raw: async (sql, values = []) => {
    sqls.push(sql);
    if (sql.startsWith("select c.id,c.customer_id")) return { rows: [{ ...structuredClone(source), collections: retired ? [] : structuredClone(source.collections) }] };
    if (sql.endsWith("for update")) { assert.equal(depth, 1); locks.push([sql, values]); return { rows: [{ id: values[0] }] }; }
    if (sql.startsWith("update commerce.payment_session")) {
      assert.equal(depth, 1);
      assert.equal(source.collections[0].sessions[0].status, values[1]);
      writes.push([sql, values]); source.collections[0].sessions[0].status = "canceled";
      source.collections[0].sessions[0].updated_at = new Date().toISOString();
      return { rows: [{ id: values[0] }] };
    }
    if (sql.startsWith("update commerce.cart_payment_collection")) { assert.equal(depth, 1); retirements.push([sql, values]); retired = true; return { rows: [{ id: values[0] }] }; }
    throw new Error("Unexpected database access");
  } };
  return { db, sqls, writes, locks, retirements, scope: { resolve: (key) => { assert.equal(key, ContainerRegistrationKeys.PG_CONNECTION); return db; } }, get source() { return source; }, set source(value) { source = value; }, get depth() { return depth; }, get retired() { return retired; } };
}
const recover = (f, r = reader(), value = cart(), signals = []) => service.recoverCanceledCartPayment(value, f.scope, signals, r);
test("confirmed remote cancellation synchronizes only local status under native locks", async () => {
  const f = fixture(), r = reader();
  const before = structuredClone(f.source);
  const guarded = { ...r, retrieveIntent: async (id) => { assert.equal(f.depth, 0); return r.retrieveIntent(id); } };
  assert.deepEqual(await recover(f, guarded), { unlocked: true });
  assert.equal(f.source.collections[0].sessions[0].status, "canceled");
  assert.deepEqual(r.calls, ["pi_fixture"]); assert.equal(f.writes.length, 1); assert.equal(f.locks.length, 3);
  assert.equal(f.retirements.length, 1); assert.equal(f.retired, true);
  const [sql, values] = f.writes[0];
  assert.equal(values[1], "pending"); assert.equal(values[4], 10000);
  assert.ok(!sql.includes("set data") && !sql.includes("set metadata") && !sql.includes("set amount"));
  assert.deepEqual({ ...f.source.collections[0].sessions[0], status: "pending", updated_at: at }, before.collections[0].sessions[0]);
  assert.ok(!JSON.stringify(f.writes).includes("secret_do_not_store"));
});
test("pending, requires_more and error require the same confirmed terminal cancellation", async () => {
  for (const status of ["pending", "requires_more", "error"]) {
    const f = fixture(), value = cart(); f.source.collections[0].sessions[0].status = status; value.payment_collection.payment_sessions[0].status = status;
    assert.deepEqual(await recover(f, reader(), value), { unlocked: true }); assert.equal(f.writes[0][1][1], status);
  }
});
test("every noncanceled remote state remains frozen without native writes", async () => {
  for (const status of ["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "succeeded"]) {
    const f = fixture(); assert.deepEqual(await recover(f, reader({ status })), { unlocked: false }); assert.equal(f.writes.length, 0); assert.equal(f.locks.length, 0);
  }
});
test("authorized, captured and asynchronous native sessions never unlock or call Stripe", async () => {
  for (const status of ["authorized", "captured", "pending_authorization"]) {
    const f = fixture(), value = cart(), r = reader(); f.source.collections[0].sessions[0].status = status; value.payment_collection.payment_sessions[0].status = status;
    assert.deepEqual(await recover(f, r, value), { unlocked: false }); assert.equal(r.calls.length, 0); assert.equal(f.writes.length, 0);
  }
});
test("completed carts, orders and historical authorization/payment evidence fail closed", async () => {
  for (const changed of [{ completed: true }, { has_order: true }, { has_payment: true }, { has_authorization: true }]) {
    const f = fixture(), r = reader(); Object.assign(f.source, changed);
    await assert.rejects(() => recover(f, r)); assert.equal(f.writes.length, 0); assert.equal(r.calls.length, 0);
  }
  const f = fixture(); f.source.collections[0].sessions[0].authorized = true;
  await assert.rejects(() => recover(f));
  // These history predicates intentionally do not filter soft-deleted payments/order links.
  assert.match(f.sqls[0], /from commerce\.order_cart oc where oc\.cart_id=c\.id\)/);
  assert.match(f.sqls[0], /exists\(select 1 from commerce\.payment p where/);
  assert.ok(!f.sqls[0].includes("p.deleted_at") && !f.sqls[0].includes("oc.deleted_at"));
});
test("collection settlement amounts, completion and paid statuses prevent recovery", async () => {
  for (const changed of [{ completed: true }, { authorized_cents: "0.01" }, { captured_cents: "1" }, { refunded_cents: "1" }, { status: "authorized" }, { status: "completed" }, { status: "partially_captured" }]) {
    const f = fixture(), r = reader(); Object.assign(f.source.collections[0], changed);
    await assert.rejects(() => recover(f, r)); assert.equal(r.calls.length, 0); assert.equal(f.writes.length, 0);
  }
});
test("ownership, collection, session and provider bindings never accept foreign client identifiers", async () => {
  for (const mutate of [
    (value) => { value.customer_id = "cus_foreign"; }, (value) => { value.id = "cart_foreign"; },
    (value) => { value.payment_collection.id = "paycol_foreign"; },
    (value) => { value.payment_collection.payment_sessions[0].id = "payses_foreign"; },
    (value) => { value.payment_collection.payment_sessions[0].data.id = "pi_foreign"; },
    (value) => { value.payment_collection.payment_sessions[0].data.livemode = true; },
  ]) {
    const f = fixture(), r = reader(), value = cart(); mutate(value); await assert.rejects(() => recover(f, r, value)); assert.equal(r.calls.length, 0); assert.equal(f.writes.length, 0);
  }
});
test("unknown, unsupported or multiple active native sessions cannot be unlocked", async () => {
  for (const change of [{ status: "unknown" }, { provider_id: "pp_system_default" }, { intent_id: null }, { livemode: null }, { data_session_id: "payses_foreign" }, { data_amount_cents: 9999 }]) {
    const f = fixture(); Object.assign(f.source.collections[0].sessions[0], change); await assert.rejects(() => recover(f)); assert.equal(f.writes.length, 0);
  }
  const f = fixture(), value = cart();
  f.source.collections[0].sessions.push({ ...f.source.collections[0].sessions[0], id: "payses_extra" });
  value.payment_collection.payment_sessions.push({ ...value.payment_collection.payment_sessions[0], id: "payses_extra" });
  await assert.rejects(() => recover(f, reader(), value));
  const duplicate = fixture(); duplicate.source.collections.push(structuredClone(duplicate.source.collections[0])); await assert.rejects(() => recover(duplicate));
});
test("remote identities, metadata, currency, mode and money mismatches never mutate state", async () => {
  for (const changed of [{ id: "pi_foreign" }, { metadata: { session_id: "payses_foreign" } }, { metadata: {} }, { currency: "eur" }, { livemode: true }, { amount: 10001 }, { amount_received: 1 }, { amount_capturable: 1 }, { status: "unknown" }]) {
    const f = fixture(); await assert.rejects(() => recover(f, reader(changed))); assert.equal(f.writes.length, 0);
  }
  const f = fixture(), r = reader(); r.livemode = true; await assert.rejects(() => recover(f, r)); assert.equal(r.calls.length, 0);
});
test("money must match exact USD cents; fractional cents cannot be rounded into permission", async () => {
  for (const mutate of [
    (f) => { f.source.collections[0].sessions[0].amount_cents = "0.001"; },
    (f) => { f.source.collections[0].amount_cents = "100.001"; },
    (f) => { f.source.collections[0].sessions[0].amount_cents = "99.99"; },
  ]) { const f = fixture(); mutate(f); await assert.rejects(() => recover(f)); assert.equal(f.writes.length, 0); }
  const f = fixture(), value = cart(); value.total = 100.001; await assert.rejects(() => recover(f, reader(), value));
});
test("empty payments need no network; canceled records are verified then retained behind a retired link", async () => {
  for (const mode of ["no_collection", "empty"]) {
    const f = fixture(), value = cart(), r = reader();
    if (mode === "no_collection") { f.source.collections = []; value.payment_collection = null; }
    if (mode === "empty") { f.source.collections[0].sessions = []; value.payment_collection.payment_sessions = []; }
    assert.deepEqual(await recover(f, r, value), { unlocked: true }); assert.equal(r.calls.length, 0); assert.equal(f.writes.length, 0);
    f.source.has_payment = true; await assert.rejects(() => recover(f, r, value));
  }
  const f = fixture(), value = cart(), r = reader();
  f.source.collections[0].sessions[0].status = "canceled"; value.payment_collection.payment_sessions[0].status = "canceled";
  await recover(f, r, value); value.payment_collection = null;
  assert.deepEqual(await recover(f, r, value), { unlocked: true }); assert.equal(f.writes.length, 0); assert.equal(r.calls.length, 1); assert.equal(f.retirements.length, 1);
  assert.equal(f.source.collections[0].sessions[0].status, "canceled");
});
test("a canceled historic session remains intact while one current session is recovered", async () => {
  const f = fixture(), value = cart();
  const historic = { ...f.source.collections[0].sessions[0], id: "payses_history", status: "canceled", intent_id: "pi_history", data_session_id: "payses_history" };
  f.source.collections[0].sessions.push(historic);
  value.payment_collection.payment_sessions.push({ ...value.payment_collection.payment_sessions[0], id: "payses_history", status: "canceled", data: { id: "pi_history", livemode: false } });
  const remote = reader(); remote.retrieveIntent = async (id) => ({ id, amount: 10000, currency: "usd", livemode: false, status: "canceled", amount_received: 0, amount_capturable: 0, metadata: { session_id: id === "pi_history" ? "payses_history" : "payses_fixture" } });
  assert.deepEqual(await recover(f, remote, value), { unlocked: true });
  assert.deepEqual(f.source.collections[0].sessions[1], historic); assert.equal(f.source.collections[0].sessions.length, 2);
});
test("native binding and quote changes during the remote GET are detected before any write", async () => {
  for (const mutate of [
    (f) => { f.source.updated_at = "2026-10-02T00:00:00.000Z"; },
    (f) => { f.source.collections[0].link_id = "capaycol_changed"; },
    (f) => { f.source.collections[0].sessions[0].data_fingerprint = "c".repeat(32); },
    (f) => { f.source.collections[0].sessions[0].raw_amount_fingerprint = "c".repeat(32); },
    (f) => { f.source.collections[0].sessions[0].status = "authorized"; },
    (f) => { f.source.has_payment = true; },
  ]) {
    const f = fixture(), r = reader(); const changed = { ...r, retrieveIntent: async (id) => { mutate(f); return r.retrieveIntent(id); } };
    await assert.rejects(() => recover(f, changed)); assert.equal(f.writes.length, 0);
  }
  const f = fixture(), originalRaw = f.db.raw;
  f.db.raw = (sql, values) => sql.startsWith("update commerce.payment_session") ? Promise.resolve({ rows: [] }) : originalRaw(sql, values);
  await assert.rejects(() => recover(f)); assert.equal(f.writes.length, 0);
});

test("a locally canceled session still requires a real terminal cancellation and zero funds before retirement", async () => {
  for (const delta of [{ status: "processing" }, { status: "succeeded", amount_received: 10000 }, { status: "canceled", amount_capturable: 1 }]) {
    const f = fixture(), value = cart(); f.source.collections[0].sessions[0].status = "canceled"; value.payment_collection.payment_sessions[0].status = "canceled";
    if (delta.status === "canceled") await assert.rejects(() => recover(f, reader(delta), value));
    else assert.deepEqual(await recover(f, reader(delta), value), { unlocked: false });
    assert.equal(f.retirements.length, 0); assert.equal(f.retired, false);
  }
});

test("retirement failure and lease loss atomically roll back cancellation without deleting historical rows", async () => {
  for (const mode of ["miss", "lease"]) {
    const f = fixture(), controller = new AbortController(), raw = f.db.raw;
    f.db.raw = async (sql, values) => {
      if (sql.startsWith("update commerce.cart_payment_collection") && mode === "miss") return { rows: [] };
      const result = await raw(sql, values); if (sql.startsWith("update commerce.cart_payment_collection")) controller.abort(); return result;
    };
    await assert.rejects(() => recover(f, reader(), cart(), [controller.signal]));
    assert.equal(f.writes.length, 0); assert.equal(f.retirements.length, 0); assert.equal(f.retired, false); assert.equal(f.source.collections[0].sessions[0].status, "pending");
  }
});
test("expired locks and cancellation signals stop verification or roll back local synchronization", async () => {
  const early = fixture(), before = new AbortController(); before.abort(); await assert.rejects(() => recover(early, reader(), cart(), [before.signal])); assert.equal(early.sqls.length, 0);
  const network = fixture(), controller = new AbortController(), r = reader();
  await assert.rejects(() => recover(network, { ...r, retrieveIntent: async (id) => { controller.abort(); return r.retrieveIntent(id); } }, cart(), [controller.signal])); assert.equal(network.writes.length, 0);
  const f = fixture(), late = new AbortController(), originalRaw = f.db.raw;
  f.db.raw = async (sql, values) => { const result = await originalRaw(sql, values); if (sql.startsWith("update commerce.payment_session")) late.abort(); return result; };
  await assert.rejects(() => recover(f, reader(), cart(), [undefined, late.signal])); assert.equal(f.writes.length, 0); assert.equal(f.source.collections[0].sessions[0].status, "pending");
});
test("transport/timeouts and malformed responses are sanitized without leaking provider secrets", async () => {
  for (const response of [async () => { throw new Error("ETIMEDOUT sk_test_do_not_log pi_secret_do_not_log"); }, async () => ({ client_secret: "do_not_log" })]) {
    const f = fixture(); await assert.rejects(() => recover(f, { ...reader(), retrieveIntent: response }), (error) => /verification is unavailable/.test(error.message) && !error.message.includes("do_not_log")); assert.equal(f.writes.length, 0);
  }
});
test("actual Stripe SDK recovery reader exposes only GET and preserves timeout/mode configuration", async () => {
  const oldKey = process.env.COMMERCE_STRIPE_API_KEY;
  const proto = new Stripe("sk_test_fixture").paymentIntents.constructor.prototype;
  const oldRetrieve = proto.retrieve, calls = [];
  proto.retrieve = async function (id) { calls.push(id); assert.equal(this._stripe._api.timeout, 15000); assert.equal(this._stripe._api.maxNetworkRetries, 1); return { id, client_secret: "not_a_recovery_response" }; };
  try {
    process.env.COMMERCE_STRIPE_API_KEY = "sk_test_fixture";
    const r = service.createStripePaymentRecoveryReader(); assert.deepEqual(Object.keys(r).sort(), ["livemode", "retrieveIntent"]);
    assert.equal(r.livemode, false); await r.retrieveIntent("pi_fixture"); assert.deepEqual(calls, ["pi_fixture"]);
    assert.throws(() => r.retrieveIntent("pi_foreign/../secrets")); assert.deepEqual(calls, ["pi_fixture"]);
    process.env.COMMERCE_STRIPE_API_KEY = "sk_live_fixture"; assert.equal(service.createStripePaymentRecoveryReader().livemode, true);
    delete process.env.COMMERCE_STRIPE_API_KEY; assert.throws(() => service.createStripePaymentRecoveryReader());
  } finally { proto.retrieve = oldRetrieve; if (oldKey === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = oldKey; }
});
test("native observation parsing and database transport failures do not expose credentials", async () => {
  const missing = fixture(), originalRaw = missing.db.raw;
  missing.db.raw = (sql, values) => sql.startsWith("select c.id,c.customer_id") ? Promise.resolve({ rows: [] }) : originalRaw(sql, values);
  await assert.rejects(() => recover(missing), /verification is unavailable/);
  const broken = fixture(); broken.db.raw = async () => { throw new Error("postgres://private_password_do_not_log"); };
  await assert.rejects(() => recover(broken), (error) => /verification is unavailable/.test(error.message) && !error.message.includes("do_not_log"));
  const f = fixture(), r = reader(), controller = new AbortController();
  await assert.rejects(() => recover(f, { ...r, retrieveIntent: async (id) => { controller.abort(); return { ...(await r.retrieveIntent(id)), status: "processing" }; } }, cart(), [controller.signal]), /Retry payment verification/);
});
