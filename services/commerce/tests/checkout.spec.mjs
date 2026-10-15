import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupReaderFixture, registrationFixture } from "./fixtures/tax-setup.mjs";
import { checkoutTaxRows } from "./fixtures/tax-classification.mjs";
import { attachTaxQuote, taxQuoteRows, taxNativeCart } from "./fixtures/tax-quote.mjs";
import { taxConfigurationRows } from "./fixtures/tax-configuration.mjs";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { checkoutCartSchema, checkoutFingerprint, assertCheckoutReady, assertPaymentMatches, assertUsCheckoutRegion, paymentStarted } = require("../src/lib/checkout-policy.ts");
const { requireOwnedCart, useCheckoutBoundary } = require("../src/api/cart-ownership.ts");
const { GET, POST, createCheckoutPost } = require("../src/api/store/snowforce/checkout/[id]/route.ts");
const { assertEditableCart, validateCheckoutCart } = require("../src/workflows/hooks/validate-checkout.ts");
const policy = require("../src/lib/shop-policy.ts");
const consent = require("../src/lib/policy-consent.ts");
process.env.JWT_SECRET = "fixture-policy-signing-key-32-characters-or-longer";
const acceptedAt = "2026-01-01T00:00:00.000Z";
function policyMetadata() {
  const state = policy.initialShopPolicyState(); state.revision = 1; state.draft.version = 1; state.published_version = 1;
  const content = state.draft.content; content.seller_name = "Fixture seller"; content.customer_service_email = "support@example.test";
  content.copy.consumer_rights = { en: "Your statutory rights apply.", zh: "保留法定消费者权利。" };
  state.publications = [{ version: 1, published_at: acceptedAt, effective_at: acceptedAt, published_by: "user_fixture", content }];
  return { [policy.shopPolicyMetadataKey]: state, unrelated_private_store: "never expose" };
}
const fixturePolicy = () => policy.publishedShopPolicy(policyMetadata(), acceptedAt);
const preparation = (value) => ({ kind: "prepare", fingerprint: consent.policyReviewFingerprint(value, fixturePolicy()), policyVersion: 1, agreed: true });
function rawCart() { return checkoutCartSchema.parse({ id: "cart_fixture", customer_id: "cus_fixture", currency_code: "usd", region_id: "reg_us", email: "fixture@example.com", completed_at: null, total: 89.9, subtotal: 79.95, tax_total: 0, item_total: 79.95, item_tax_total: 0, discount_total: 0, shipping_total: 9.95, shipping_address: { first_name: "Fixture", last_name: "Rider", address_1: "Test street", address_2: "", city: "Test city", province: "ca", postal_code: "90001", country_code: "us", phone: "5551234567" }, shipping_methods: [{ id: "casm_fixture", shipping_option_id: "so_fixture", name: "US standard", amount: 9.95 }], items: [{ id: "cali_fixture", variant_id: "variant_fixture", product_handle: "test-gear", product_title: "Test gear", title: "Test gear", variant_title: "M", thumbnail: null, quantity: 1, unit_price: 79.95, total: 79.95 }], payment_collection: { id: "paycol_fixture", amount: 89.9, currency_code: "usd", payment_sessions: [{ id: "payses_fixture", amount: 89.9, currency_code: "usd", provider_id: "pp_stripe_stripe", status: "pending", data: { id: "pi_fixture", amount: 8990, currency: "usd", livemode: false, metadata: { session_id: "payses_fixture" }, client_secret: "pi_fixture_secret_fixture" } }] } }); }
function cart() { const value = rawCart(); value.metadata = { [consent.policyAcceptanceKey]: consent.sealPolicyAcceptance(value, fixturePolicy(), acceptedAt) }; attachTaxQuote(value); return value; }

test("accepts native graph's unlinked collection but still requires a payment for checkout", async () => {
  const { payment_collection: _collection, ...unlinked } = rawCart();
  const parsed = checkoutCartSchema.parse(unlinked);
  assert.equal(parsed.payment_collection, null);
  assert.equal(paymentStarted(parsed), false);
  assert.throws(() => assertPaymentMatches(parsed));
  const scope = value => ({ resolve: () => ({ graph: async () => ({ data: [value] }) }) });
  await assertEditableCart(unlinked.id, scope(unlinked));
  await assert.rejects(() => assertEditableCart(unlinked.id, scope({ ...unlinked, completed_at: new Date() })));
  await assert.rejects(() => assertEditableCart(unlinked.id, scope({ ...unlinked, metadata: { snowforce_tax_quote: {} } })));
  for (const malformed of [{}, { payment_sessions: undefined }, { payment_sessions: [{}] }]) {
    assert.throws(() => checkoutCartSchema.parse({ ...unlinked, payment_collection: malformed }));
    await assert.rejects(() => assertEditableCart(unlinked.id, scope({ ...unlinked, payment_collection: malformed })));
  }
});
test("binds the quote to items, totals, identity and address while excluding payment secrets", () => {
  const original = cart(); const expected = checkoutFingerprint(original);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(checkoutFingerprint({ ...original, payment_collection: null }), expected);
  for (const changed of [{ ...original, total: 90 }, { ...original, customer_id: "cus_other" }, { ...original, shipping_address: { ...original.shipping_address, postal_code: "10001" } }, { ...original, items: [{ ...original.items[0], quantity: 2 }] }]) assert.notEqual(checkoutFingerprint(changed), expected);
});
test("requires confirmed tax configuration, full US address, real items, shipping and positive total", () => {
  assert.doesNotThrow(() => assertCheckoutReady(cart(), true));
  assert.throws(() => assertCheckoutReady(cart(), false));
  for (const changed of [{ ...cart(), shipping_address: null }, { ...cart(), items: [] }, { ...cart(), shipping_methods: [] }, { ...cart(), total: 0 }, { ...cart(), shipping_address: { ...cart().shipping_address, postal_code: "bad" } }]) assert.throws(() => assertCheckoutReady(changed, true));
  assert.throws(() => checkoutCartSchema.parse({ ...cart(), currency_code: "eur" }));
});
test("omitted native shipping address means no address and cannot authorize checkout", () => {
  const value=cart();delete value.shipping_address;
  const parsed=checkoutCartSchema.parse(value);
  assert.equal(parsed.shipping_address,null);
  assert.throws(()=>assertCheckoutReady(parsed,true));
  const countryOnly=checkoutCartSchema.parse({...value,shipping_address:{country_code:"us"}});
  assert.equal(countryOnly.shipping_address,null);
  assert.throws(()=>assertCheckoutReady(countryOnly,true));
});

test("a native default country-only address is unfilled and cannot authorize payment", () => {
  const address={country_code:"us",first_name:null,last_name:null,address_1:null,address_2:null,city:null,province:null,postal_code:null,phone:null};
  const parsed=checkoutCartSchema.parse({...cart(),shipping_address:address});
  assert.equal(parsed.shipping_address,null);
  assert.throws(()=>assertCheckoutReady(parsed,true));
  for(const invalid of [{...address,country_code:"ca"},{...address,first_name:"Partially entered"},{...address,address_1:123}])assert.throws(()=>checkoutCartSchema.parse({...cart(),shipping_address:invalid}));
});

test("rejects foreign currencies or another region's tax context", () => {
  assert.doesNotThrow(() => assertUsCheckoutRegion({ currency_code: "usd", countries: [{ iso_2: "us" }] }));
  for (const region of [{ currency_code: "eur", countries: [{ iso_2: "us" }] }, { currency_code: "usd", countries: [{ iso_2: "ca" }] }, { currency_code: "usd", countries: [{ iso_2: "us" }, { iso_2: "ca" }] }]) assert.throws(() => assertUsCheckoutRegion(region));
});
test("rejects stale collections, underpayment, foreign currency, manual providers and duplicate active sessions", () => {
  assert.equal(assertPaymentMatches(cart()).id, "payses_fixture");
  const collection = cart().payment_collection;
  for (const changed of [null, { ...collection, amount: 1 }, { ...collection, currency_code: "eur" }, { ...collection, payment_sessions: [{ ...collection.payment_sessions[0], amount: 1 }] }, { ...collection, payment_sessions: [{ ...collection.payment_sessions[0], provider_id: "pp_system_default" }] }, { ...collection, payment_sessions: [...collection.payment_sessions, { ...collection.payment_sessions[0], id: "payses_duplicate" }] }]) assert.throws(() => assertPaymentMatches({ ...cart(), payment_collection: changed }));
});
test("all existing sessions stay locked until verified retirement; local cancellation is insufficient", () => {
  assert.equal(paymentStarted(cart()), true);
  for (const status of ["error", "pending", "requires_more", "authorized", "captured", "unknown"]) assert.equal(paymentStarted({ payment_collection: { ...cart().payment_collection, payment_sessions: [{ ...cart().payment_collection.payment_sessions[0], status }] } }), true);
  assert.equal(paymentStarted({ payment_collection: { ...cart().payment_collection, payment_sessions: [{ ...cart().payment_collection.payment_sessions[0], status: "canceled" }] } }), true);
  assert.equal(paymentStarted({ payment_collection: { ...cart().payment_collection, payment_sessions: [] } }), false);
  assert.equal(paymentStarted({ payment_collection: null }), false);
});
const request = (value, overrides = {}) => ({ auth_context: { actor_id: "cus_fixture" }, method: "POST", path: "/store/carts/cart_fixture/line-items", params: { id: "cart_fixture" }, scope: { resolve: () => ({ graph: async () => ({ data: value ? [value] : [] }) }) }, ...overrides });
test("native cart endpoints reject anonymous, missing and foreign owners before continuing", async () => {
  for (const req of [request(null), request({ ...cart(), customer_id: "cus_other" }), request(cart(), { auth_context: undefined })]) await assert.rejects(() => requireOwnedCart(req, {}, () => assert.fail("must not continue")));
});
test("freezes paid carts across native mutations while allowing owned reads and completion retries", async () => {
  await assert.rejects(() => requireOwnedCart(request(cart()), {}, () => assert.fail("must not mutate")));
  let passed = 0;
  await requireOwnedCart(request(cart(), { method: "GET" }), {}, () => passed++);
  await requireOwnedCart(request(cart(), { path: "/store/carts/cart_fixture/complete" }), {}, () => passed++);
  await assert.rejects(() => requireOwnedCart(request({ ...cart(), payment_collection: null }), {}, () => assert.fail("Quote must be cleared before edits")));
  await requireOwnedCart(request({ ...cart(), metadata: null, payment_collection: null }), {}, () => passed++);
  assert.equal(passed, 3);
  assert.throws(() => useCheckoutBoundary({}, {}, () => assert.fail("must not create a second payment")));
});
test("rechecks payment state inside the native workflow's locked validation boundary", async () => {
  const scope = (value) => ({ resolve: () => ({ graph: async () => ({ data: [value] }) }) });
  await assert.rejects(() => assertEditableCart("cart_fixture", scope(cart())));
  await assert.rejects(() => assertEditableCart("cart_fixture", scope({ ...cart(), payment_collection: null })));
  await assertEditableCart("cart_fixture", scope({ ...cart(), metadata: null, payment_collection: null }));
  const errored = cart(); errored.payment_collection.payment_sessions[0].status = "error";
  await assert.rejects(() => assertEditableCart("cart_fixture", scope(errored)));
  await assert.rejects(() => requireOwnedCart(request(errored), {}, () => assert.fail("an error alone must not unlock native edits")));
});
function checkoutRequest(value, body, metadata = policyMetadata()) {
  return { ...request(value), body, scope: { resolve: (key) => {
    if (key === "snowforce_tax_setup_reader") return setupReaderFixture();
    if (key === "__pg_connection__") return { raw: async sql => ({ rows: taxQuoteRows(sql,value) ?? taxConfigurationRows(sql,metadata) ?? checkoutTaxRows(sql,value) ?? [{ id: "store_fixture", metadata }] }) };
    if (key === "cart") return { updateCarts: async (_id, data) => { value.metadata = data.metadata; } };
    if (key === "query") return { graph: async ({ entity }) => ({ data: [entity === "region" ? { currency_code: "usd", countries: [{ iso_2: "us" }] } : entity === "shipping_option" ? { id: "so_fixture", provider_id: "snowforce_us_snowforce", type: { code: "snowforce-us-standard" }, price_type: "calculated", prices: [{ currency_code: "usd", amount: 9.95, price_rules: [] }, { currency_code: "usd", amount: 0, price_rules: [{ attribute: "item_total", operator: "gte", value: 100 }] }], service_zone: { geo_zones: [{ type: "province", country_code: "us", province_code: "ca" }] } } : taxNativeCart(value)] }) };
    if (key === "locking") return { execute: async (_key, callback) => callback() };
    assert.fail("Existing sessions must not start another provider workflow.");
  } } };
}

test("an environment flag cannot bypass missing Stripe tax registration or failed verification", async () => {
  const saved = Object.fromEntries(["COMMERCE_TAX_POLICY_CONFIRMED", "COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET"].map(key => [key,process.env[key]]));
  Object.assign(process.env,{COMMERCE_TAX_POLICY_CONFIRMED:"true",COMMERCE_STRIPE_API_KEY:"sk_test_fixture",COMMERCE_STRIPE_WEBHOOK_SECRET:"whsec_fixture"});
  try {
    for (const reader of [setupReaderFixture([]), {...setupReaderFixture(),registrations:async()=>{throw new Error("provider private detail");}}]) {
      const value={...cart(),payment_collection:null}, req=checkoutRequest(value,preparation(value)), resolve=req.scope.resolve;
      req.scope.resolve=key=>key==="snowforce_tax_setup_reader"?reader:resolve(key);
      const handler=createCheckoutPost({createCollection:async()=>assert.fail("No collection"),createSession:async()=>assert.fail("No payment")});
      await assert.rejects(()=>handler(req,{json:()=>assert.fail("No payment secret")}));
      req.body={kind:"complete"};await assert.rejects(()=>handler(req,{json:()=>assert.fail("No order")}));
      let review;await GET(req,{json:body=>{review=body;}});assert.equal(review.configured,false);assert.ok(!JSON.stringify(review).includes("acct_fixture"));
      await assert.rejects(()=>validateCheckoutCart({id:value.id},value,req.scope),/current shipping, tax and payment review/);
    }
  } finally {for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("active Stripe settings and an environment flag cannot bypass absent private tax proof",async()=>{
  const names=["COMMERCE_TAX_POLICY_CONFIRMED","COMMERCE_STRIPE_API_KEY","COMMERCE_STRIPE_WEBHOOK_SECRET"],old=Object.fromEntries(names.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{COMMERCE_TAX_POLICY_CONFIRMED:"true",COMMERCE_STRIPE_API_KEY:"sk_test_fixture",COMMERCE_STRIPE_WEBHOOK_SECRET:"whsec_fixture"});
  try{const value=cart();delete value.metadata.snowforce_tax_quote;const req=checkoutRequest(value,preparation(value));let review;
    await GET(req,{json:body=>{review=body;}});assert.equal(review.configured,true);assert.equal(review.taxQuote,null);assert.equal(review.paymentStarted,true);
    const handler=createCheckoutPost({createCollection:async()=>assert.fail("No collection without tax proof"),createSession:async()=>assert.fail("No payment without tax proof")});
    await assert.rejects(()=>handler(req,{json:()=>assert.fail("No payment")}),/verified, current tax quote/);
    req.body={kind:"complete"};await assert.rejects(()=>handler(req,{json:()=>assert.fail("No order")}),/verified, current tax quote/);
    await assert.rejects(()=>validateCheckoutCart({id:value.id},{...value,customer:{id:value.customer_id},region:{id:value.region_id}},req.scope));
  }finally{for(const[key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test("tax settings changing during collection creation stop the locked payment path", async () => {
  const saved = Object.fromEntries(["COMMERCE_TAX_POLICY_CONFIRMED", "COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET"].map(key => [key,process.env[key]]));
  Object.assign(process.env,{COMMERCE_TAX_POLICY_CONFIRMED:"true",COMMERCE_STRIPE_API_KEY:"sk_test_fixture",COMMERCE_STRIPE_WEBHOOK_SECRET:"whsec_fixture"});
  try {
    let rows=[registrationFixture()];const reader={...setupReaderFixture(),registrations:async()=>({object:"list",has_more:false,data:rows})};
    const value={...cart(),payment_collection:null};delete value.metadata[consent.policyAcceptanceKey];const req=checkoutRequest(value,preparation(value)),resolve=req.scope.resolve;
    req.scope.resolve=key=>key==="snowforce_tax_setup_reader"?reader:resolve(key);
    const handler=createCheckoutPost({createCollection:async()=>{value.payment_collection={...rawCart().payment_collection,payment_sessions:[]};rows=[...rows,registrationFixture({id:"taxreg_ny",country_options:{us:{state:"NY",type:"state_sales_tax"}}})];},createSession:async()=>assert.fail("Tax snapshot changed before payment")});
    await assert.rejects(()=>handler(req,{json:()=>assert.fail("No payment")}),/tax setup changed/);assert.equal(value.metadata[consent.policyAcceptanceKey],undefined);
  } finally {for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("review returns quote and cart from one read without payment secrets or email", async () => {
  let value; await GET(checkoutRequest(cart()), { json: (result) => { value = result; } });
  assert.equal(value.cart.total, 89.9); assert.equal(value.fingerprint, consent.policyReviewFingerprint(cart(), fixturePolicy()));
  assert.ok(!JSON.stringify(value).includes("client_secret") && !JSON.stringify(value).includes("fixture@example.com"));
  await assert.rejects(() => GET(checkoutRequest({ ...cart(), customer_id: "cus_other" }), { json: () => assert.fail("must not expose foreign quote") }));
});
test("native payment and completion endpoints reject addresses outside current database coverage", async () => {
  const previous = process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  process.env.COMMERCE_TAX_POLICY_CONFIRMED = "true";
  try {
    for (const province of ["ak", "hi", "pr", "ny"]) {
      const value = { ...cart(), shipping_address: { ...cart().shipping_address, province } };
      for (const body of [preparation(value), { kind: "complete" }]) await assert.rejects(() => POST(checkoutRequest(value, body), { json: () => assert.fail("must not pay or complete outside the native zone") }), /does not cover/);
    }
  } finally { if (previous === undefined) delete process.env.COMMERCE_TAX_POLICY_CONFIRMED; else process.env.COMMERCE_TAX_POLICY_CONFIRMED = previous; }
});
test("resuming the same reviewed checkout reuses one existing native payment session", async () => {
  const saved = Object.fromEntries(["COMMERCE_TAX_POLICY_CONFIRMED", "COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET"].map((name) => [name, process.env[name]]));
  Object.assign(process.env, { COMMERCE_TAX_POLICY_CONFIRMED: "true", COMMERCE_STRIPE_API_KEY: "sk_test_fixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
  try {
    const values = [];
    for (let i = 0; i < 2; i++) await POST(checkoutRequest(cart(), preparation(cart())), { json: (value) => values.push(value) });
    assert.deepEqual(values, Array(2).fill({ status: "payment", clientSecret: "pi_fixture_secret_fixture", totalCents: 8990, currency: "usd" }));
    await assert.rejects(() => POST(checkoutRequest(cart(), { ...preparation(cart()), fingerprint: "a".repeat(64) }), { json: () => assert.fail("must not prepare stale quote") }));
  } finally { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});

test("missing product tax review disables checkout and native completion, including a change inside the cart lock", async () => {
  const names=["COMMERCE_TAX_POLICY_CONFIRMED","COMMERCE_STRIPE_API_KEY","COMMERCE_STRIPE_WEBHOOK_SECRET"], saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{COMMERCE_TAX_POLICY_CONFIRMED:"true",COMMERCE_STRIPE_API_KEY:"sk_test_fixture",COMMERCE_STRIPE_WEBHOOK_SECRET:"whsec_fixture"});
  function noReview(value,body,late=false) {
    const req=checkoutRequest(value,body), resolve=req.scope.resolve;let reads=0;
    req.scope.resolve=key=>key==="__pg_connection__"?{raw:async sql=>{
      const result=await resolve(key).raw(sql);
      if(sql.includes("as settings")&&++reads >= (late?2:1))return {rows:result.rows.map(row=>({...row,settings:null}))};
      return result;
    }}:resolve(key);return req;
  }
  try {
    const value=cart();let review;await GET(noReview(value),{json:result=>{review=result;}});assert.equal(review.configured,false);assert.ok(!JSON.stringify(review).includes("reviewed_by"));
    for(const late of [false,true])await assert.rejects(()=>POST(noReview(value,preparation(value),late),{json:()=>assert.fail("No client secret or completed order")}),/current tax classification/);
    await assert.rejects(()=>validateCheckoutCart({id:value.id},value,noReview(value).scope),/current shipping, tax and payment review/);
  } finally {for(const [name,value] of Object.entries(saved)){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});

test("unpublished policies and absent explicit agreement cannot reach payment setup", async () => {
  const value = { ...cart(), payment_collection: null, metadata: { preserved: "cart information" } };
  let response;
  await GET(checkoutRequest(value, undefined, {}), { json: (result) => { response = result; } });
  assert.equal(response.policy, null); assert.equal(response.configured, false);
  const scope = checkoutRequest(value, undefined, {}).scope;
  await assert.rejects(() => consent.acceptCheckoutPolicy(value, scope, preparation(value)));
  for (const input of [{ ...preparation(value), agreed: false }, { ...preparation(value), policyVersion: 2 }, { ...preparation(value), fingerprint: "f".repeat(64) }]) await assert.rejects(() => consent.acceptCheckoutPolicy(value, checkoutRequest(value).scope, input));
  assert.deepEqual(value.metadata, { preserved: "cart information" });
  for (const body of [{ kind: "prepare", fingerprint: preparation(value).fingerprint }, { ...preparation(value), agreed: false }]) await assert.rejects(() => POST(checkoutRequest(value, body), { json: () => assert.fail("must not prepare") }), /Invalid checkout request/);
});

test("trusted acceptance is saved before payment and preserves unrelated cart metadata", async () => {
  const value = { ...cart(), payment_collection: null, metadata: { preserved: { safe: true } } };
  const receipt = await consent.acceptCheckoutPolicy(value, checkoutRequest(value).scope, preparation(value));
  assert.deepEqual(value.metadata.preserved, { safe: true });
  assert.equal(receipt.policy.version, 1); assert.equal(receipt.cart_id, value.id);
  assert.equal(consent.verifyPolicyAcceptance(value).signature, receipt.signature);
  assert.ok(!JSON.stringify(receipt).includes("published_by"));
  assert.ok(!JSON.stringify(receipt).includes("unrelated_private_store"));
  assert.ok(!JSON.stringify(receipt).includes(process.env.JWT_SECRET));
});

test("receipt forgery, removal, identity transfers and quote edits all fail verification", () => {
  const original = cart();
  const receipt = original.metadata[consent.policyAcceptanceKey];
  for (const changed of [
    { ...original, metadata: null }, { ...original, id: "cart_other" }, { ...original, customer_id: "cus_other" },
    { ...original, total: 100 }, { ...original, shipping_address: { ...original.shipping_address, postal_code: "10001" } },
    { ...original, metadata: { [consent.policyAcceptanceKey]: { ...receipt, signature: "0".repeat(64) } } },
    { ...original, metadata: { [consent.policyAcceptanceKey]: { ...receipt, signature: "invalid" } } },
    { ...original, metadata: { [consent.policyAcceptanceKey]: { ...receipt, policy: { ...receipt.policy, content: { ...receipt.policy.content, seller_name: "Forged seller" } } } } },
  ]) assert.throws(() => consent.verifyPolicyAcceptance(changed));
  const reversed = (value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reversed(child)])) : value;
  assert.doesNotThrow(() => consent.verifyPolicyAcceptance({ ...original, metadata: reversed(original.metadata) }));
});

test("signature setup and time boundaries fail closed", () => {
  const saved = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.equal(consent.policySigningConfigured(), false);
    assert.throws(() => consent.sealPolicyAcceptance(rawCart(), fixturePolicy(), acceptedAt));
    process.env.JWT_SECRET = "short";
    assert.throws(() => consent.verifyPolicyAcceptance(rawCart()));
  } finally { process.env.JWT_SECRET = saved; }
  const value = rawCart();
  value.metadata = { [consent.policyAcceptanceKey]: consent.sealPolicyAcceptance(value, fixturePolicy(), "2099-01-01T00:00:00.000Z") };
  assert.throws(() => consent.verifyPolicyAcceptance(value));
  value.metadata = { [consent.policyAcceptanceKey]: consent.sealPolicyAcceptance(value, { ...fixturePolicy(), effective_at: "2026-02-01T00:00:00.000Z" }, acceptedAt) };
  assert.throws(() => consent.verifyPolicyAcceptance(value));
});

test("new publication changes an unpaid review but does not rewrite an already accepted payment", async () => {
  const metadata = policyMetadata(); const state = metadata[policy.shopPolicyMetadataKey];
  state.revision = 2; state.draft.version = 2; state.published_version = 2;
  const content = structuredClone(state.publications[0].content); content.terms.return_window_days = 60;
  state.publications.push({ version: 2, effective_at: "2026-02-01T00:00:00.000Z", published_at: "2026-02-01T00:00:00.000Z", published_by: "user_new", content });
  const active = cart(); const scope = checkoutRequest(active, undefined, metadata).scope;
  const review = await consent.checkoutPolicyReview(active, scope);
  assert.equal(review.policy.version, 1); assert.equal(review.policyAccepted, true);
  assert.equal((await consent.acceptCheckoutPolicy(active, scope, preparation(active))).signature, active.metadata[consent.policyAcceptanceKey].signature);
  const unpaid = { ...active, payment_collection: null };
  const newReview = await consent.checkoutPolicyReview(unpaid, scope);
  assert.equal(newReview.policy.version, 2); assert.equal(newReview.policyAccepted, false);
  assert.notEqual(newReview.fingerprint, review.fingerprint);
  await assert.rejects(() => consent.acceptCheckoutPolicy(unpaid, scope, preparation(unpaid)));
});

test("workflow validates the original metadata copied to the order as well as the current quote", async () => {
  const value = cart(); const scope = checkoutRequest(value).scope;
  const initial = { ...value, customer: { id: value.customer_id }, region: { id: value.region_id } };
  await consent.assertWorkflowPolicySnapshot(initial, value, scope);
  await assert.rejects(() => consent.assertWorkflowPolicySnapshot({ ...initial, metadata: {} }, value, scope));
  await assert.rejects(() => consent.assertWorkflowPolicySnapshot({ ...initial, total: 99 }, value, scope));
  const otherAt = "2026-01-02T00:00:00.000Z";
  const changed = { ...value, metadata: { [consent.policyAcceptanceKey]: consent.sealPolicyAcceptance(value, fixturePolicy(), otherAt) } };
  await assert.rejects(() => consent.assertWorkflowPolicySnapshot(initial, changed, scope));
  const missingHistory = policyMetadata(); missingHistory[policy.shopPolicyMetadataKey] = policy.initialShopPolicyState();
  await assert.rejects(() => consent.assertAcceptedShopPolicy(value, checkoutRequest(value, undefined, missingHistory).scope));
});

test("a later-committing publication with an earlier timestamp cannot strand a signed payment", async () => {
  const value = cart();
  const acceptedLater = "2026-03-01T00:00:00.000Z";
  value.metadata = { [consent.policyAcceptanceKey]: consent.sealPolicyAcceptance(value, fixturePolicy(), acceptedLater) };
  const metadata = policyMetadata(); const state = metadata[policy.shopPolicyMetadataKey];
  state.revision = 2; state.draft.version = 2; state.published_version = 2;
  const replacement = structuredClone(state.publications[0].content); replacement.terms.return_window_days = 60;
  state.publications.push({ version: 2, effective_at: "2026-02-28T23:59:59.999Z", published_at: "2026-02-28T23:59:59.999Z", published_by: "user_later_commit", content: replacement });
  const scope = checkoutRequest(value, undefined, metadata).scope;
  assert.equal((await consent.assertAcceptedShopPolicy(value, scope)).policy.version, 1);
  assert.equal((await consent.checkoutPolicyReview(value, scope)).policy.version, 1);
  assert.equal(policy.publishedShopPolicy(metadata, acceptedLater).version, 2);
});

test("the native completion validator enforces the same snapshot without browser request parameters", async () => {
  const saved = process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  process.env.COMMERCE_TAX_POLICY_CONFIRMED = "true";
  try {
    const value = cart(); const scope = checkoutRequest(value).scope;
    const native = { ...value, customer: { id: value.customer_id }, region: { id: value.region_id } };
    await validateCheckoutCart({ id: value.id }, native, scope);
    for (const initial of [{ ...native, metadata: {} }, { ...native, total: 1 }, { ...native, customer: { id: "cus_other" } }]) await assert.rejects(() => validateCheckoutCart({ id: value.id }, initial, scope), /current shipping, tax and payment review/);
    const missing = { ...value, metadata: null };
    await assert.rejects(() => validateCheckoutCart({ id: value.id }, native, checkoutRequest(missing).scope), /current shipping, tax and payment review/);
    process.env.COMMERCE_TAX_POLICY_CONFIRMED = "false";
    await assert.rejects(() => validateCheckoutCart({ id: value.id }, native, scope), /current shipping, tax and payment review/);
  } finally { if (saved === undefined) delete process.env.COMMERCE_TAX_POLICY_CONFIRMED; else process.env.COMMERCE_TAX_POLICY_CONFIRMED = saved; }
});

test("new payment creation follows durable consent, rechecks native quote and does not duplicate on retry", async () => {
  const saved = Object.fromEntries(["COMMERCE_TAX_POLICY_CONFIRMED", "COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { COMMERCE_TAX_POLICY_CONFIRMED: "true", COMMERCE_STRIPE_API_KEY: "sk_test_fixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
  try {
    const value = { ...cart(), payment_collection: null };delete value.metadata[consent.policyAcceptanceKey];value.metadata.unrelated=true;
    const originalSession = rawCart().payment_collection.payment_sessions[0];
    const calls = [];
    const handler = createCheckoutPost({
      createCollection: async (_scope, id) => { calls.push("collection"); assert.equal(id, value.id); value.payment_collection = { ...rawCart().payment_collection, payment_sessions: [] }; },
      createSession: async (scope, owned, signals) => {
        calls.push("session"); assert.equal(owned.payment_collection.id, value.payment_collection.id); assert.equal(owned.customer_id, value.customer_id); assert.equal(signals.length, 2);
        await consent.assertAcceptedShopPolicy(value, scope);
        value.payment_collection.payment_sessions = [structuredClone(originalSession)];
      },
    });
    let result; await handler(checkoutRequest(value, preparation(value)), { json: (body) => { result = body; } });
    assert.deepEqual(result, { status: "payment", clientSecret: "pi_fixture_secret_fixture", totalCents: 8990, currency: "usd" });
    assert.deepEqual(calls, ["collection", "session"]); assert.equal(value.metadata.unrelated, true);
    const signature = value.metadata[consent.policyAcceptanceKey].signature;
    await handler(checkoutRequest(value, preparation(value)), { json: () => {} });
    assert.deepEqual(calls, ["collection", "session"]); assert.equal(value.metadata[consent.policyAcceptanceKey].signature, signature);
    const fresh = { ...cart(), payment_collection: null };
    const invalid = createCheckoutPost({ createCollection: async () => assert.fail("must not create a collection"), createSession: async () => assert.fail("must not create payment") });
    await assert.rejects(() => invalid(checkoutRequest(fresh, { ...preparation(fresh), policyVersion: 9 }), { json: () => assert.fail("must reject policy change") }));
    const raced = createCheckoutPost({ createCollection: async () => { fresh.payment_collection = { ...rawCart().payment_collection, payment_sessions: [] }; fresh.total = 100; }, createSession: async () => assert.fail("must not create payment on changed quote") });
    await assert.rejects(() => raced(checkoutRequest(fresh, preparation(fresh)), { json: () => assert.fail("must reject changed quote") }));
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test("losing either checkout lease stops provider calls after asynchronous consent or collection creation", async () => {
  const saved = Object.fromEntries(["COMMERCE_TAX_POLICY_CONFIRMED", "COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { COMMERCE_TAX_POLICY_CONFIRMED: "true", COMMERCE_STRIPE_API_KEY: "sk_test_fixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
  try {
    for (const abortAt of ["collection", "consent"]) {
      const value = { ...cart(), payment_collection: null };delete value.metadata[consent.policyAcceptanceKey];
      const req = checkoutRequest(value, preparation(value));
      const resolve = req.scope.resolve; const controller = new AbortController();
      req.scope.resolve = (key) => {
        if (key === "locking") return { execute: async (_key, operation) => operation(controller.signal) };
        if (key === "cart") return { updateCarts: async (_id, update) => { value.metadata = update.metadata; if (abortAt === "consent") controller.abort(); } };
        return resolve(key);
      };
      const handler = createCheckoutPost({ createCollection: async () => { value.payment_collection = { ...rawCart().payment_collection, payment_sessions: [] }; if (abortAt === "collection") controller.abort(); }, createSession: async () => assert.fail("an expired lease must not start payment") });
      await assert.rejects(() => handler(req, { json: () => assert.fail("must not return payment") }), /Retry checkout/);
      assert.equal(value.payment_collection.payment_sessions.length, 0);
    }
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test("interrupted initialization can resume its existing attempt; asynchronous authorization returns processing", async () => {
  const names = ["COMMERCE_TAX_POLICY_CONFIRMED", "COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET"], saved = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { COMMERCE_TAX_POLICY_CONFIRMED: "true", COMMERCE_STRIPE_API_KEY: "sk_test_fixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
  try {
    const value = cart(); value.payment_collection.payment_sessions[0].data = { snowforce_payment_creation_pending: true };
    let resumed = 0, result;
    const handler = createCheckoutPost({ createCollection: async () => assert.fail("must retain collection"), createSession: async (_scope, owned, signals) => { assert.equal(owned.payment_collection.payment_sessions[0].id, "payses_fixture"); assert.equal(signals.length, 2); resumed++; value.payment_collection.payment_sessions[0].data = structuredClone(rawCart().payment_collection.payment_sessions[0].data); value.payment_collection.payment_sessions[0].status = "pending_authorization"; } });
    await handler(checkoutRequest(value, preparation(value)), { json: (body) => { result = body; } });
    assert.equal(resumed, 1); assert.deepEqual(result, { status: "processing" });
    const canceled = cart(); canceled.payment_collection.payment_sessions[0].status = "canceled";
    await assert.rejects(() => assertEditableCart(canceled.id, checkoutRequest(canceled).scope));
    await assert.rejects(() => requireOwnedCart(request(canceled), {}, () => assert.fail("native refresh must not delete canceled history")));
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test("explicit recovery holds both cart locks and bypasses launch gates without creating payment", async () => {
  const value = cart(); value.metadata = null; value.shipping_address = null;
  const req = checkoutRequest(value, { kind: "recover" }, {});
  const previous = process.env.COMMERCE_TAX_POLICY_CONFIRMED; delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  const locks = []; const controller = new AbortController(); const original = req.scope.resolve;
  req.scope.resolve = (key) => key === "locking" ? { execute: async (id, operation) => { locks.push(id); try { return await operation(controller.signal); } finally { locks.pop(); } } } : original(key);
  const never = { createCollection: async () => assert.fail("recovery must not create a collection"), createSession: async () => assert.fail("recovery must not create a session") };
  const handler = createCheckoutPost(never, async (owned, scope, signals) => {
    assert.equal(owned.id, value.id); assert.equal(scope, req.scope);
    assert.deepEqual(locks, [`snowforce-checkout:${value.id}`, value.id]); assert.equal(signals.length, 2);
    value.payment_collection = null;
    return { unlocked: true };
  });
  try {
    let result; await handler(req, { json: (body) => { result = body; } });
    assert.deepEqual(result, { status: "recovered", unlocked: true }); assert.equal(value.metadata, null);
    const active = createCheckoutPost(never, async () => ({ unlocked: true }));
    value.payment_collection = structuredClone(rawCart().payment_collection);
    await active(req, { json: (body) => { result = body; } });
    assert.deepEqual(result, { status: "recovered", unlocked: false }); // Return the reread, not a helper assertion.
  } finally { if (previous !== undefined) process.env.COMMERCE_TAX_POLICY_CONFIRMED = previous; }
});

test("recovery refuses client payment claims, foreign owners, lost leases and identity races", async () => {
  const flows = { createCollection: async () => assert.fail("must not create"), createSession: async () => assert.fail("must not create") };
  const never = createCheckoutPost(flows, async () => assert.fail("must not reach recovery"));
  for (const body of [{ kind: "recover", status: "canceled" }, { kind: "recover", intentId: "pi_other" }, { kind: "recover", customerId: "cus_other" }]) await assert.rejects(() => never(checkoutRequest(cart(), body), { json: () => assert.fail("must reject injected input") }), /Invalid checkout request/);
  await assert.rejects(() => never(checkoutRequest({ ...cart(), customer_id: "cus_other" }, { kind: "recover" }), { json: () => assert.fail("must not expose") }), /Cart not found/);
  const raced = cart(), req = checkoutRequest(raced, { kind: "recover" }); const resolve = req.scope.resolve;
  req.scope.resolve = (key) => key === "locking" ? { execute: async (id, operation) => { if (id === raced.id) raced.customer_id = "cus_other"; return operation(); } } : resolve(key);
  await assert.rejects(() => never(req, { json: () => assert.fail("must not expose") }), /Cart not found/);
  const expired = checkoutRequest(cart(), { kind: "recover" }), controller = new AbortController(), original = expired.scope.resolve;
  expired.scope.resolve = (key) => key === "locking" ? { execute: async (_id, operation) => operation(controller.signal) } : original(key);
  const handler = createCheckoutPost(flows, async () => { controller.abort(); return { unlocked: true }; });
  await assert.rejects(() => handler(expired, { json: () => assert.fail("must not claim recovery under expired lease") }), /Retry checkout/);
});

test("recovery of an already completed cart returns its owned order without touching payments", async () => {
  const value = { ...cart(), completed_at: "2026-10-01T00:00:00Z" };
  const req = checkoutRequest(value, { kind: "recover" }); const original = req.scope.resolve;
  req.scope.resolve = (key) => key === "query" ? { graph: async ({ entity }) => ({ data: entity === "order_cart" ? [{ order: { id: "order_fixture", display_id: 1, customer_id: value.customer_id, currency_code: "usd", total: value.total } }] : [value] }) } : original(key);
  const handler = createCheckoutPost(undefined, async () => assert.fail("completed carts must not recover"));
  let result; await handler(req, { json: (body) => { result = body; } });
  assert.deepEqual(result, { status: "complete", order: { id: "order_fixture", number: "1", total: value.total } });
});
