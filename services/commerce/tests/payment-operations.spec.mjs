import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const service = require("../src/lib/payment-operations.ts");
const consent = require("../src/lib/policy-consent.ts"), policy = require("../src/lib/shop-policy.ts");
const { checkoutCartSchema, checkoutFingerprint } = require("../src/lib/checkout-policy.ts");
const { GET: listRoute } = require("../src/api/admin/snowforce/payments/route.ts");
const { GET: detailRoute, POST: changeRoute } = require("../src/api/admin/snowforce/payments/[id]/route.ts");
const at = "2026-10-01T00:00:00.000Z", now = "2026-10-02T00:00:00.000Z";
const auth = { actor_id: "user_fixture", actor_type: "user", auth_identity_id: "auth_fixture", app_metadata: {} };
const requestId = "11111111-1111-4111-8111-111111111111";
const md5 = value => createHash("md5").update(JSON.stringify(value)).digest("hex");
process.env.JWT_SECRET = "fixture-payment-operations-secret-more-than-32-characters";
function fixture() {
  const state = policy.initialShopPolicyState(); state.revision = 1; state.draft.version = 1; state.published_version = 1;
  state.draft.content.seller_name = "Fixture seller"; state.draft.content.customer_service_email = "support@example.test";
  state.draft.content.copy.consumer_rights = { en: "Statutory rights apply.", zh: "法定消费者权利适用。" };
  state.publications = [{ version: 1, published_at: at, effective_at: at, published_by: "user_fixture", content: state.draft.content }];
  const policyMetadata = { [policy.shopPolicyMetadataKey]: state };
  const cart = checkoutCartSchema.parse({ id: "cart_fixture", customer_id: "cus_fixture", currency_code: "usd", region_id: "reg_fixture", email: "fixture@example.test", completed_at: null, total: 100, subtotal: 100, tax_total: 0, shipping_total: 0, discount_total: 0, item_total: 100, item_tax_total: 0, shipping_address: null, shipping_methods: [], items: [], payment_collection: { id: "paycol_fixture", amount: 100, currency_code: "usd", payment_sessions: [] } });
  cart.metadata = { [consent.policyAcceptanceKey]: consent.sealPolicyAcceptance(cart, policy.publishedShopPolicy(policyMetadata, at), at) };
  let data = { snowforce_payment_creation_pending: true }, depth = 0;
  let row = { id: "payses_fixture", collection_id: "paycol_fixture", provider_id: "pp_stripe_stripe", currency_code: "usd", amount_cents: "100", status: "pending", created_at: at, updated_at: at, database_now: now, authorized: false, pending: true, intent_id: null, attempt: { version: 1, cart_id: cart.id, customer_id: cart.customer_id, quote: checkoutFingerprint(cart), livemode: false, namespace: "f".repeat(64) }, data_hash: md5(data), metadata_hash: "b".repeat(32), raw_hash: "c".repeat(32), association: null, links: [{ cart_id: cart.id, customer_id: cart.customer_id, retired: false, cart_completed: false, cart_deleted: false, has_order: false, has_payment: false }] };
  const sqls = [], writes = [], locks = [], controller = new AbortController();
  const nativeFlags = { has_order: false, has_payment: false, has_authorization: false, updated_at: at };
  const db = { transaction: async operation => {
    const oldRow = structuredClone(row), oldData = structuredClone(data), count = writes.length; depth++;
    try { return await operation(db); }
    catch (error) { row = oldRow; data = oldData; writes.length = count; throw error; }
    finally { depth--; }
  }, raw: async (sql, values = []) => {
    sqls.push({ sql, values });
    if (sql.startsWith("with attempts as")) return { rows: [{ records: row ? [structuredClone(row)] : [], count: row ? "1" : "0" }] };
    if (sql.startsWith("select s.id,s.payment_collection_id")) return { rows: row && values[1] === row.id ? [structuredClone(row)] : [] };
    if (sql.startsWith("select c.id,c.customer_id")) return { rows: [{ id: cart.id, customer_id: cart.customer_id, currency_code: "usd", completed: false, ...nativeFlags, collections: [{ id: row.collection_id, link_id: "link_fixture", currency_code: "usd", amount_cents: row.amount_cents, status: "not_paid", completed: false, authorized_cents: "0", captured_cents: "0", refunded_cents: "0", sessions: [{ id: row.id, provider_id: row.provider_id, currency_code: row.currency_code, amount_cents: row.amount_cents, status: row.status, authorized: row.authorized, intent_id: row.intent_id, livemode: data.livemode ?? null, data_session_id: data.metadata?.session_id ?? null, data_amount_cents: data.amount ?? null, data_fingerprint: row.data_hash, raw_amount_fingerprint: row.raw_hash, updated_at: row.updated_at }] }] }] };
    if (sql.startsWith("select id") && sql.endsWith("for update")) { assert.equal(depth, 1); return { rows: [] }; }
    if (sql.startsWith("update commerce.payment_session set data")) {
      assert.equal(depth, 1); assert.equal(values[3], row.id); assert.equal(values[6], 10000); assert.equal(values[7], row.status); assert.equal(values[8], row.data_hash); assert.equal(values[9], row.metadata_hash); assert.equal(values[10], row.raw_hash);
      writes.push({ sql, values }); data = JSON.parse(values[0]); row.intent_id = data.id; row.pending = false; row.status = values[1]; row.association = JSON.parse(values[2]); row.data_hash = md5(data); row.metadata_hash = "d".repeat(32); row.updated_at = now;
      return { rows: [{ id: row.id }] };
    }
    if (sql.startsWith("select id,metadata from commerce.store")) return { rows: [{ id: "store_fixture", metadata: policyMetadata }] };
    assert.fail(`Unexpected SQL: ${sql.slice(0,60)}`);
  } };
  const scope = { resolve: key => key === "__pg_connection__" ? db : key === "query" ? { graph: async () => ({ data: [{ ...cart, payment_collection: { ...cart.payment_collection, payment_sessions: [{ id: row.id, provider_id: row.provider_id, currency_code: row.currency_code, amount: Number(row.amount_cents), status: row.status, data }] } }] }) } : key === "locking" ? { execute: async (key, operation) => { locks.push(key); return operation(controller.signal); } } : assert.fail("Unexpected service") };
  return { scope, db, cart, sqls, writes, locks, controller, nativeFlags, get row() { return row; }, set row(value) { row = value; }, get depth() { return depth; }, get data() { return data; } };
}
function reader(f, delta = {}) {
  const calls = [];
  return { livemode: false, namespace: "f".repeat(64), calls, retrieveIntent: async id => { assert.equal(f.depth, 0); calls.push(id); return { id, amount: 10000, currency: "usd", livemode: false, status: "requires_payment_method", amount_received: 0, amount_capturable: 0, metadata: { session_id: "payses_fixture" }, client_secret: `${id}_secret_private`, ...delta }; } };
}
const detail = f => service.paymentOperationDetail(f.scope, auth, "payses_fixture");
const inspect = async (f, remote = reader(f)) => { const current = await detail(f); return service.changePaymentOperation(f.scope, auth, "payses_fixture", { command: "inspect", intentId: "pi_fixture", fingerprint: current.record.fingerprint }, remote); };
const association = value => ({ command: "associate", intentId: "pi_fixture", fingerprint: value.record.fingerprint, verifiedFingerprint: value.preview.verifiedFingerprint, requestId, confirmed: true });
const save = (f, input, remote = reader(f)) => service.changePaymentOperation(f.scope, auth, "payses_fixture", input, remote);

test("native admin auth rejects anonymous/customer identities before data access on every route", async () => {
  const never = { resolve: () => assert.fail("must not touch data") };
  for (const identity of [undefined, { ...auth, actor_type: "customer" }, { ...auth, actor_id: "cus_fixture" }]) {
    const req = { scope: never, auth_context: identity, params: { id: "payses_fixture" }, query: {}, body: {} };
    for (const route of [listRoute, detailRoute, changeRoute]) await assert.rejects(() => route(req, { json: () => assert.fail("must not return data") }), /Sign in/);
  }
});
test("paginated USD queue and detail whitelist exclude secrets, provider data and private key hashes", async () => {
  const f = fixture(), result = await service.listPaymentOperations(f.scope, auth, "interrupted", 50);
  assert.equal(result.records[0].amountCents, 10000); assert.equal(result.records[0].expired, true); assert.equal(result.records[0].eligible, true); assert.equal(result.count, 1); assert.equal(result.offset, 50);
  assert.ok(!JSON.stringify(result).includes("namespace") && !JSON.stringify(result).includes("data_hash") && !JSON.stringify(result).includes("client_secret"));
  assert.deepEqual(f.sqls[0].values, ["pp_stripe_stripe", 50]); assert.match(f.sqls[0].sql, /limit 50 offset \?/);
  const req = { scope: f.scope, auth_context: auth, query: { filter: "all", offset: 0 }, params: { id: "payses_fixture" } }; let response;
  await listRoute(req, { json: value => { response = value; } }); assert.equal(response.count, 1);
  await detailRoute(req, { json: value => { response = value; } }); assert.equal(response.record.id, "payses_fixture");
});
test("strict identifiers/filter/offset/input refuse injection and missing records", async () => {
  const f = fixture();
  for (const [filter, offset] of [["' OR true", 0], ["all", -1], ["all", 1.1], ["all", [0]], ["all", 1000001]]) await assert.rejects(() => service.listPaymentOperations(f.scope, auth, filter, offset));
  await assert.rejects(() => service.paymentOperationDetail(f.scope, auth, "../../private"));
  await assert.rejects(() => service.paymentOperationDetail(f.scope, auth, "payses_missing"), /not found/);
  for (const input of [{ command: "inspect", intentId: "pi_fixture", fingerprint: "a".repeat(64), actorId: "user_other" }, { command: "associate", confirmed: false }]) await assert.rejects(() => save(f, input));
});
test("inspection performs only bound Stripe GET and returns sanitized live facts without mutation", async () => {
  const f = fixture(), remote = reader(f); const value = await inspect(f, remote);
  assert.deepEqual(remote.calls, ["pi_fixture"]); assert.equal(value.preview.amountCents, 10000); assert.equal(value.associated, false); assert.equal(f.writes.length, 0);
  assert.ok(!JSON.stringify(value).includes("private") && !JSON.stringify(value).includes("client_secret"));
});
test("the configured SDK reader only retrieves the intent and rejects missing or rotated credentials", async () => {
  const previous = process.env.COMMERCE_STRIPE_API_KEY, Stripe = require("stripe");
  const prototype = new Stripe("sk_test_fixture").paymentIntents.constructor.prototype;
  const originalRetrieve = prototype.retrieve, originalCreate = prototype.create;
  const f = fixture(), remote = reader(f);
  f.row.attempt.namespace = createHash("sha256").update("sk_test_fixture").digest("hex");
  prototype.create = () => assert.fail("Admin review must never create a payment");
  prototype.retrieve = async id => remote.retrieveIntent(id);
  const request = async () => service.changePaymentOperation(f.scope, auth, f.row.id, { command: "inspect", intentId: "pi_fixture", fingerprint: (await detail(f)).record.fingerprint });
  try {
    process.env.COMMERCE_STRIPE_API_KEY = "sk_test_fixture";
    assert.equal((await request()).preview.intentId, "pi_fixture"); assert.deepEqual(remote.calls, ["pi_fixture"]); assert.equal(f.writes.length, 0);
    process.env.COMMERCE_STRIPE_API_KEY = "sk_test_rotated"; await assert.rejects(request, /changed|match/); assert.equal(remote.calls.length, 1);
    delete process.env.COMMERCE_STRIPE_API_KEY; await assert.rejects(request, error => !error.message.includes("fixture"));
  } finally { prototype.retrieve = originalRetrieve; prototype.create = originalCreate; if (previous === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = previous; }
});
test("matching aged intent associates under both cart leases and short transaction with staff audit", async () => {
  const f = fixture(), remote = reader(f), preview = await inspect(f, remote), result = await save(f, association(preview), remote);
  assert.equal(result.associated, true); assert.equal(result.replayed, false); assert.equal(f.row.intent_id, "pi_fixture"); assert.equal(f.row.status, "pending");
  assert.equal(result.record.association.actorId, auth.actor_id); assert.deepEqual(f.locks, ["snowforce-checkout:cart_fixture", "cart_fixture"]); assert.equal(f.writes.length, 1);
  assert.equal(f.row.attempt.version, 1); assert.equal(f.row.association.original_fingerprint, preview.record.fingerprint);
  assert.equal(f.data.client_secret, "pi_fixture_secret_private"); assert.ok(!JSON.stringify(result).includes("secret_private"));
});
test("lost-response replay of the same association is idempotent without another Stripe call or SQL write", async () => {
  const f = fixture(), remote = reader(f), input = association(await inspect(f, remote)); await save(f, input, remote);
  const result = await save(f, input, { ...remote, retrieveIntent: async () => assert.fail("replay must not query provider") });
  assert.equal(result.replayed, true); assert.equal(f.writes.length, 1);
  for (const change of [{ intentId: "pi_foreign" }, { fingerprint: "a".repeat(64) }, { verifiedFingerprint: "a".repeat(64) }]) await assert.rejects(() => save(f, { ...input, ...change }, remote));
  await assert.rejects(() => service.changePaymentOperation(f.scope, { ...auth, actor_id: "user_other" }, "payses_fixture", input, remote));
});
test("a changed current PI status must be re-reviewed before association", async () => {
  const f = fixture(), input = association(await inspect(f));
  await assert.rejects(() => save(f, input, reader(f, { status: "processing" })), /changed/); assert.equal(f.writes.length, 0);
});
test("foreign PI/session/amount/currency/mode, credential changes and contradictory funds refuse adoption", async () => {
  for (const delta of [{ id: "pi_other" }, { metadata: { session_id: "payses_other" } }, { amount: 9999 }, { currency: "eur" }, { livemode: true }, { status: "requires_capture", amount_capturable: 1 }, { client_secret: "pi_other_secret_private" }]) {
    const f = fixture(); await assert.rejects(() => inspect(f, reader(f, delta))); assert.equal(f.writes.length, 0);
  }
  for (const delta of [{ namespace: "a".repeat(64) }, { livemode: true }]) { const f = fixture(), remote = { ...reader(f), ...delta }; await assert.rejects(() => inspect(f, remote)); assert.equal(remote.calls.length, 0); }
});
test("retired, completed, foreign, authorized, paid and multiply linked attempts cannot be associated", async () => {
  for (const mutate of [
    f => { f.row.links[0].retired = true; }, f => { f.row.links[0].cart_completed = true; }, f => { f.row.links[0].cart_deleted = true; },
    f => { f.row.links[0].has_order = true; }, f => { f.row.links[0].has_payment = true; }, f => { f.row.authorized = true; },
    f => { f.row.links.push({ ...f.row.links[0], cart_id: "cart_other" }); }, f => { f.row.attempt.customer_id = "cus_other"; },
    f => { f.row.attempt.quote = "a".repeat(64); }, f => { f.cart.metadata = null; }, f => { f.nativeFlags.has_payment = true; },
  ]) { const f = fixture(); mutate(f); const remote = reader(f), value = await inspect(f, remote); await assert.rejects(() => save(f, association(value), remote)); assert.equal(f.writes.length, 0); assert.equal(remote.calls.length, 1); }
});
test("native data, ownership, cart time and financial races during GET prevent conditional association", async () => {
  for (const mutate of [
    f => { f.row.updated_at = now; }, f => { f.row.data_hash = "d".repeat(32); }, f => { f.nativeFlags.updated_at = now; },
    f => { f.nativeFlags.has_payment = true; }, f => { f.row.links[0].customer_id = "cus_other"; }, f => { f.row.raw_hash = "d".repeat(32); },
  ]) { const f = fixture(), input = association(await inspect(f)), remote = reader(f), original = remote.retrieveIntent; remote.retrieveIntent = async id => { const result = await original(id); mutate(f); return result; }; await assert.rejects(() => save(f, input, remote)); assert.equal(f.writes.length, 0); }
});
test("expired leases and failed CAS roll back local association and audit", async () => {
  for (const phase of ["early", "get", "cas", "after_cas"]) {
    const f = fixture(), input = association(await inspect(f)), remote = reader(f), raw = f.db.raw;
    if (phase === "early") f.controller.abort();
    if (phase === "get") { const get = remote.retrieveIntent; remote.retrieveIntent = async id => { const result = await get(id); f.controller.abort(); return result; }; }
    if (phase === "cas") f.db.raw = (sql, values) => sql.startsWith("update commerce.payment_session") ? Promise.resolve({ rows: [] }) : raw(sql, values);
    if (phase === "after_cas") f.db.raw = async (sql, values) => { const result = await raw(sql, values); if (sql.startsWith("update commerce.payment_session")) f.controller.abort(); return result; };
    await assert.rejects(() => save(f, input, remote)); assert.equal(f.writes.length, 0); assert.equal(f.row.intent_id, null); assert.equal(f.row.association, null);
  }
});
test("errors from database or Stripe are sanitized and never leak credentials or client secrets", async () => {
  const f = fixture(), remote = reader(f); remote.retrieveIntent = async () => { throw new Error("sk_test_private pi_private_secret_private"); };
  await assert.rejects(() => inspect(f, remote), error => /unavailable/.test(error.message) && !error.message.includes("private"));
  const broken = fixture(); broken.db.raw = async () => { throw new Error("postgres://password_private"); };
  await assert.rejects(() => detail(broken), error => /unavailable/.test(error.message) && !error.message.includes("private"));
  await assert.rejects(() => service.listPaymentOperations(broken.scope, auth, "all", 0), /unavailable/);
});
