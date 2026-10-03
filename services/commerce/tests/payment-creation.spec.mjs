import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attachTaxQuote, taxQuoteRows, taxNativeCart } from "./fixtures/tax-quote.mjs";
import { setupReaderFixture } from "./fixtures/tax-setup.mjs";
import { checkoutTaxRows } from "./fixtures/tax-classification.mjs";
import { taxConfigurationRows } from "./fixtures/tax-configuration.mjs";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const Stripe = require("stripe");
const { MathBN } = require("@medusajs/framework/utils");
const service = require("../src/lib/payment-creation.ts");
const { sealPolicyAcceptance, policyAcceptanceKey } = require("../src/lib/policy-consent.ts");
const { initialShopPolicyState, publishedShopPolicy, shopPolicyMetadataKey } = require("../src/lib/shop-policy.ts");
const { checkoutCartSchema } = require("../src/lib/checkout-policy.ts");
process.env.JWT_SECRET = "fixture-payment-creation-secret-at-least-32-characters";
const at = new Date().toISOString();
const md5 = (value) => createHash("md5").update(JSON.stringify(value)).digest("hex");
function policy() {
  const state = initialShopPolicyState();
  state.revision = 1; state.draft.version = 1;
  state.draft.content.seller_name = "Fixture seller"; state.draft.content.customer_service_email = "support@example.test";
  state.draft.content.copy.consumer_rights = { en: "Statutory consumer rights apply.", zh: "消费者法定权利适用。" };
  state.published_version = 1;
  state.publications = [{ version: 1, published_at: at, effective_at: at, published_by: "user_fixture", content: state.draft.content }];
  return publishedShopPolicy({ [shopPolicyMetadataKey]: state }, at);
}
function fixture() {
  const value = checkoutCartSchema.parse({ id: "cart_fixture", customer_id: "cus_fixture", currency_code: "usd", region_id: "reg_fixture", email: "fixture@example.test", completed_at: null, total: 100, subtotal: 100, tax_total: 0, shipping_total: 0, discount_total: 0, item_total: 100, item_tax_total: 0, shipping_address: null, shipping_methods: [], items: [], payment_collection: { id: "paycol_fixture", amount: 100, currency_code: "usd", payment_sessions: [] } });
  value.shipping_address={first_name:"Fixture",last_name:"Rider",address_1:"1 Test Street",address_2:"",city:"Fixture city",province:"ca",postal_code:"92614",country_code:"us",phone:"5551234567"};
  value.items=[{id:"cali_fixture",variant_id:"variant_fixture",title:"Fixture gear",product_handle:"fixture",product_title:"Fixture gear",variant_title:"M",thumbnail:null,quantity:1,unit_price:100,total:100}];
  value.shipping_methods=[{id:"casm_fixture",shipping_option_id:"so_fixture",name:"US standard",amount:0}];
  Object.assign(value,checkoutCartSchema.parse(value));
  value.metadata = { [policyAcceptanceKey]: sealPolicyAcceptance(value, policy(), at) };attachTaxQuote(value,Math.floor(Date.parse(at)/1000));
  let row = null, depth = 0, boundSessionId = null;
  const flags = { has_order: false, has_payment: false, has_authorization: false, updated_at: at };
  const sqls = [], mutations = [];
  const db = { transaction: async (operation) => {
    const saved = structuredClone(row), count = mutations.length, savedBinding=boundSessionId; depth++;
    try { return await operation(db); }
    catch (error) { row = saved; mutations.length = count; boundSessionId=savedBinding;throw error; }
    finally { depth--; }
  }, raw: async (sql, values = []) => {
    sqls.push(sql);
    const proof=taxQuoteRows(sql,value);if(proof){if(boundSessionId&&row){proof[0].payment_session_id=boundSessionId;proof[0].bound_at=proof[0].input.tax_date;proof[0].payment={id:row.id,collection_id:value.payment_collection.id,provider_id:row.provider_id,currency_code:row.currency_code,amount:row.amount,status:row.status,data:row.data,metadata:row.metadata,created_at:Math.floor(Date.parse(row.created_at)/1000)};}return {rows:proof};}
    const classification=checkoutTaxRows(sql,value);if(classification)return {rows:classification};
    const configuration=taxConfigurationRows(sql);if(configuration)return {rows:configuration};
    if(sql.startsWith("update commerce.snowforce_tax_quote_applications")){assert.equal(depth,1);boundSessionId=values[0];return {rows:[{quote_id:values[1]}]};}
    if(sql.startsWith("set local")) { assert.equal(depth,1); return {rows:[]}; }
    if(sql.startsWith("select pc.id,l.id as link_id")) return {rows:[{id:value.payment_collection.id,link_id:"link_fixture",customer_id:value.customer_id,currency_code:value.payment_collection.currency_code,amount:String(value.payment_collection.amount),raw_amount:{value:String(value.payment_collection.amount),precision:20},raw_fingerprint:"a".repeat(32),receipt_signature:value.metadata.snowforce_tax_quote.signature,status:"not_paid",completed:false,authorized_amount:0,captured_amount:0,refunded_amount:0,session_count:row?1:0,collection_count:1,has_order:flags.has_order,has_payment:flags.has_payment,has_authorization:flags.has_authorization}]};
    if (sql.endsWith("for update")) { assert.equal(depth, 1); return { rows: [] }; }
    if (sql.startsWith("select c.id,c.customer_id")) return { rows: [{ id: value.id, customer_id: value.customer_id, currency_code: "usd", completed: false, ...flags, collections: [{ id: value.payment_collection.id, link_id: "link_fixture", currency_code: "usd", amount_cents: String(value.total), status: "not_paid", completed: false, authorized_cents: "0", captured_cents: "0", refunded_cents: "0", sessions: row ? [{ id: row.id, provider_id: row.provider_id, currency_code: row.currency_code, amount_cents: String(row.amount), status: row.status, authorized: false, intent_id: row.data.id ?? null, livemode: row.data.livemode ?? null, data_session_id: row.data.metadata?.session_id ?? null, data_amount_cents: row.data.amount ?? null, data_fingerprint: md5(row.data), raw_amount_fingerprint: md5(row.raw_amount), updated_at: row.updated_at }] : [] }] }] };
    if (sql.startsWith("insert into commerce.payment_session")) {
      assert.equal(depth, 1); assert.equal(row, null); mutations.push(sql);
      row = { id: values[0], provider_id: values[2], currency_code: "usd", amount: values[3] / 100, raw_amount: JSON.parse(values[4]), status: "pending", data: JSON.parse(values[5]), context: JSON.parse(values[6]), metadata: JSON.parse(values[7]), created_at: at, database_now: at, updated_at: at };
      return { rows: [] };
    }
    if (sql.startsWith("select id,amount")) return { rows: row ? [structuredClone(row)] : [] };
    if (sql.startsWith("update commerce.payment_session set data")) {
      assert.equal(depth, 1); assert.equal(row.id, values[2]); assert.equal(row.status, values[5]); assert.equal(MathBN.mult(row.amount, 100).toNumber(), values[6]); assert.deepEqual(row.data, JSON.parse(values[7])); assert.deepEqual(row.metadata, JSON.parse(values[8]));
      mutations.push(sql); row.data = JSON.parse(values[0]); row.status = values[1]; return { rows: [{ id: row.id }] };
    }
    assert.fail("Unexpected SQL statement");
  } };
  const region = { id: value.region_id, currency_code: "usd", countries: [{ iso_2: "us" }], payment_providers: [{ id: "pp_stripe_stripe", is_enabled: true }] };
  const scope = { resolve: (key) => key === "snowforce_tax_setup_reader" ? setupReaderFixture() : key === "__pg_connection__" ? db : key === "query" ? { graph: async ({entity}) => ({ data: [entity === "cart" ? taxNativeCart({...value,payment_collection:{...value.payment_collection,payment_sessions:row?[{id:row.id,provider_id:row.provider_id,currency_code:row.currency_code,amount:row.amount,status:row.status,data:row.data}]:[]}}) : region] }) } : assert.fail("No native create/delete/provider workflow may run") };
  return { value, db, flags, region, scope, sqls, mutations, get row() { return row; }, set row(input) { row = input; }, get depth() { return depth; }, get cart() { return { ...value, payment_collection: { ...value.payment_collection, payment_sessions: row ? [{ id: row.id, provider_id: row.provider_id, currency_code: row.currency_code, amount: row.amount, status: row.status, data: structuredClone(row.data) }] : [] } }; } };
}
function writer(f) {
  let remote; const calls = [];
  return { livemode: false, namespace: "f".repeat(64), calls,
    createIntent: async (parameters, key) => {
      assert.equal(f.depth, 0); assert.ok(f.row); assert.equal(key, f.row.id); assert.equal(f.row.context.idempotency_key, key);
      calls.push({ parameters: structuredClone(parameters), key });
      remote ??= { id: "pi_fixture", amount: parameters.amount, currency: "usd", livemode: false, status: "requires_payment_method", amount_received: 0, amount_capturable: 0, client_secret: "pi_fixture_secret_fixture", metadata: parameters.metadata, private_provider_field: "excluded" };
      return structuredClone(remote);
    }, retrieveIntent: async (id) => { assert.equal(f.depth, 0); assert.equal(id, remote.id); return structuredClone(remote); },
  };
}
const create = (f, remote = writer(f), value = f.cart, signals = []) => service.createDurableCartPayment(value, f.scope, signals, remote);

test("native attempt commits before Stripe; only matching USD data is adopted and no delete/compensation runs", async () => {
  const f = fixture(), remote = writer(f); await create(f, remote);
  assert.match(f.row.id, /^payses_[A-Za-z0-9]+$/); assert.equal(f.row.data.id, "pi_fixture"); assert.equal(f.row.status, "pending");
  assert.equal(f.row.data.private_provider_field, undefined); assert.equal(f.mutations.length, 2);
  assert.equal(remote.calls[0].parameters.amount, 10000); assert.equal(remote.calls[0].parameters.capture_method, "manual"); assert.deepEqual(remote.calls[0].parameters.automatic_payment_methods, { enabled: true });
  assert.equal(remote.calls[0].parameters.confirm, undefined); assert.equal(remote.calls[0].parameters.payment_method_types, undefined); assert.equal(remote.calls[0].parameters.customer, undefined);
  assert.ok(f.sqls.every((sql) => !/\bdelete\s+from|\bset\s+(amount|metadata)\b/i.test(sql)));
  assert.equal(service.paymentCreationInterrupted(f.cart), false);
});

test("a network response lost after Stripe creation retries the same durable session and identical parameters", async () => {
  const f = fixture(), remote = writer(f), original = remote.createIntent;
  remote.createIntent = async (...args) => { const result = await original(...args); if (remote.calls.length === 1) throw new Error("ETIMEDOUT sk_test_private"); return result; };
  await assert.rejects(() => create(f, remote), (error) => /preserved/.test(error.message) && !error.message.includes("sk_test_private"));
  const sessionId = f.row.id; assert.equal(service.paymentCreationInterrupted(f.cart), true); assert.equal(f.mutations.length, 1);
  await create(f, remote); assert.equal(f.row.id, sessionId); assert.deepEqual(remote.calls[0], remote.calls[1]); assert.equal(f.row.data.id, "pi_fixture");
  assert.equal(f.mutations.filter((sql) => sql.startsWith("insert")).length, 1);
});

test("retrieval or database adoption failure preserves the first attempt across retries", async () => {
  for (const mode of ["get", "adopt"]) {
    const f = fixture(), remote = writer(f), get = remote.retrieveIntent, raw = f.db.raw;
    if (mode === "get") remote.retrieveIntent = async () => { throw new Error("private_secret"); };
    else f.db.raw = async (sql, values) => sql.startsWith("update commerce.payment_session set data") ? { rows: [] } : raw(sql, values);
    await assert.rejects(() => create(f, remote)); const reservedId = f.row.id;
    assert.equal(f.row.data.id, undefined); assert.equal(f.mutations.length, 1);
    remote.retrieveIntent = get; f.db.raw = raw; await create(f, remote); assert.equal(f.row.id, reservedId);
  }
});

test("same-mode credentials changed or an aged ambiguous attempt never create another intent", async () => {
  for (const mutate of [
    (f, remote) => { remote.namespace = "a".repeat(64); }, (f, remote) => { remote.livemode = true; },
    (f) => { f.row.database_now = new Date(Date.parse(at)+22*60*60*1000).toISOString(); }, (f) => { f.row.database_now = new Date(Date.parse(at)-1).toISOString(); },
    (f) => { f.row.created_at = "invalid"; },
  ]) {
    const f = fixture(), remote = writer(f); remote.retrieveIntent = async () => { throw new Error("network"); };
    await assert.rejects(() => create(f, remote)); mutate(f, remote);
    await assert.rejects(() => create(f, remote)); assert.equal(remote.calls.length, 1); assert.equal(f.mutations.length, 1);
  }
});

test("provider disabled, missing signed consent, changed owner/quote and foreign collection reject before Stripe", async () => {
  for (const mutate of [
    (f) => { f.region.payment_providers[0].is_enabled = false; }, (f) => { f.region.payment_providers = []; },
    (f) => { f.region.currency_code = "eur"; }, (f) => { f.value.metadata = null; },
    (f) => { f.value.customer_id = "cus_other"; }, (f) => { f.value.total = 100.01; },
    (f) => { f.value.payment_collection = null; }, (f) => { f.value.payment_collection.currency_code = "eur"; },
    (f) => { f.flags.has_order = true; }, (f) => { f.flags.has_payment = true; },
  ]) { const f = fixture(), remote = writer(f); mutate(f); await assert.rejects(() => create(f, remote)); assert.equal(remote.calls.length, 0); assert.equal(f.row, null); }
});
test("valid consent cannot initialize a native session or call Stripe without private tax application proof",async()=>{
  const f=fixture(),remote=writer(f);delete f.value.metadata.snowforce_tax_quote;
  await assert.rejects(()=>create(f,remote),/verified, current tax quote/);assert.equal(remote.calls.length,0);assert.equal(f.row,null);
});

test("foreign provider results, money, metadata, mode and secrets cannot be adopted", async () => {
  for (const delta of [{ currency: "eur" }, { amount: 9999 }, { metadata: { session_id: "payses_foreign" } }, { livemode: true }, { client_secret: "pi_other_secret_fixture" }, { amount_received: 10001 }, { amount_received: 1, amount_capturable: 10000 }]) {
    const f = fixture(), remote = writer(f), original = remote.createIntent;
    remote.createIntent = async (...args) => ({ ...(await original(...args)), ...delta });
    await assert.rejects(() => create(f, remote)); assert.equal(f.row.data.id, undefined); assert.equal(f.mutations.length, 1);
  }
  const f = fixture(), remote = writer(f), original = remote.retrieveIntent; remote.retrieveIntent = async (id) => ({ ...(await original(id)), id: "pi_foreign", client_secret: "pi_foreign_secret_fixture" });
  await assert.rejects(() => create(f, remote)); assert.equal(f.row.data.id, undefined);
});

test("read fresh Stripe status instead of cached creation status, including async and authorized states", async () => {
  for (const [status, native] of [["requires_confirmation", "pending"], ["requires_action", "requires_more"], ["processing", "pending_authorization"], ["requires_capture", "authorized"], ["succeeded", "authorized"], ["canceled", "canceled"]]) {
    const f = fixture(), remote = writer(f), original = remote.retrieveIntent;
    remote.retrieveIntent = async (id) => ({ ...(await original(id)), status, amount_received: status === "succeeded" ? 10000 : 0, amount_capturable: status === "requires_capture" ? 10000 : 0 });
    await create(f, remote); assert.equal(f.row.status, native); assert.equal(f.row.data.status, status);
  }
});

test("ownership, authorization and native state races during Stripe calls prevent adoption", async () => {
  for (const mutate of [
    (f) => { f.flags.updated_at = "2026-10-01T02:00:00.000Z"; },
    (f) => { f.flags.has_payment = true; }, (f) => { f.flags.has_authorization = true; },
    (f) => { f.row.status = "authorized"; }, (f) => { f.value.customer_id = "cus_other"; },
  ]) {
    const f = fixture(), remote = writer(f), original = remote.retrieveIntent;
    remote.retrieveIntent = async (id) => { const result = await original(id); mutate(f); return result; };
    await assert.rejects(() => create(f, remote)); assert.equal(f.row.data.id, undefined); assert.equal(f.mutations.length, 1);
  }
});

test("lost leases before creation, after remote responses and during adoption preserve durable evidence", async () => {
  const early = fixture(), stopped = new AbortController(); stopped.abort(); await assert.rejects(() => create(early, writer(early), early.cart, [stopped.signal])); assert.equal(early.sqls.length, 0);
  for (const phase of ["create", "get", "adopt"]) {
    const f = fixture(), remote = writer(f), controller = new AbortController();
    if (phase === "adopt") { const raw = f.db.raw; f.db.raw = async (sql, values) => { const result = await raw(sql, values); if (sql.startsWith("update commerce.payment_session set data")) controller.abort(); return result; }; }
    else { const key = phase === "create" ? "createIntent" : "retrieveIntent", original = remote[key]; remote[key] = async (...args) => { const result = await original(...args); controller.abort(); return result; }; }
    await assert.rejects(() => create(f, remote, f.cart, [controller.signal])); assert.ok(f.row); assert.equal(f.row.data.id, undefined); assert.equal(f.mutations.length, 1);
  }
});

test("an existing intent or canceled native session cannot create a replacement", async () => {
  for (const mode of ["existing", "canceled", "missing_marker", "foreign_attempt"]) {
    const f = fixture(), remote = writer(f), originalGet = remote.retrieveIntent;
    remote.retrieveIntent = async () => { throw new Error("network"); };
    await assert.rejects(() => create(f, remote)); remote.retrieveIntent = originalGet;
    if (mode === "existing") { f.row.data = { id: "pi_existing", livemode: false }; }
    if (mode === "canceled") f.row.status = "canceled";
    if (mode === "missing_marker") f.row.data = {};
    if (mode === "foreign_attempt") f.row.metadata.snowforce_payment_creation.cart_id = "cart_foreign";
    await assert.rejects(() => create(f, remote)); assert.equal(remote.calls.length, 1);
  }
});

test("contradictory remote status and fund amounts stay preserved for review", async () => {
  for (const delta of [{ status: "requires_capture", amount_capturable: 1 }, { status: "succeeded", amount_received: 0 }, { status: "canceled", amount_received: 1 }, { status: "processing", amount_capturable: 1 }]) {
    const f = fixture(), remote = writer(f), original = remote.retrieveIntent;
    remote.retrieveIntent = async (id) => ({ ...(await original(id)), ...delta });
    await assert.rejects(() => create(f, remote)); assert.equal(f.row.data.id, undefined); assert.equal(f.mutations.length, 1);
  }
});

test("exact decimal cents survive binary floating point; fractional cents reject", async () => {
  for (const total of [0.29, 100.01, 100.001]) {
    const f = fixture(); f.value.total = total; f.value.payment_collection.amount = total;
    f.value.items[0].unit_price=total;f.value.items[0].total=total;f.value.item_total=total;f.value.subtotal=total;
    f.value.metadata = { [policyAcceptanceKey]: sealPolicyAcceptance(f.value, policy(), at) };if(total!==100.001)attachTaxQuote(f.value,Math.floor(Date.parse(at)/1000)); const remote = writer(f);
    if (total === 100.001) { await assert.rejects(() => create(f, remote)); assert.equal(remote.calls.length, 0); }
    else { await create(f, remote); assert.equal(remote.calls[0].parameters.amount, total === 0.29 ? 29 : 10001); }
  }
});

test("actual Stripe SDK passes durable keys, correct version, bounded retries and no implicit confirm", async () => {
  const previous = process.env.COMMERCE_STRIPE_API_KEY;
  const proto = new Stripe("sk_test_fixture").paymentIntents.constructor.prototype, originalCreate = proto.create, originalRetrieve = proto.retrieve;
  const calls = [];
  proto.create = async function (params, options) { assert.equal(this._stripe._api.timeout, 15000); assert.equal(this._stripe._api.maxNetworkRetries, 1); calls.push([params, options]); return {}; };
  proto.retrieve = async (id) => { calls.push(id); return {}; };
  try {
    process.env.COMMERCE_STRIPE_API_KEY = "sk_test_fixture"; const remote = service.createStripePaymentCreator();
    assert.equal(remote.livemode, false); await remote.createIntent({ amount: 100, currency: "usd" }, "payses_durable"); await remote.retrieveIntent("pi_fixture");
    assert.deepEqual(calls[0][1], { idempotencyKey: "payses_durable" }); assert.equal(calls[1], "pi_fixture"); assert.throws(() => remote.retrieveIntent("pi_foreign/../private"));
    process.env.COMMERCE_STRIPE_API_KEY = "rk_live_fixture"; assert.equal(service.createStripePaymentCreator().livemode, true);
    delete process.env.COMMERCE_STRIPE_API_KEY; assert.throws(() => service.createStripePaymentCreator());
  } finally { proto.create = originalCreate; proto.retrieve = originalRetrieve; if (previous === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = previous; }
});
