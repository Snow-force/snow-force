import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { actorFixture as auth, productFixture, codeFixture, commandFixture, stateFixture } from "./fixtures/tax-classification.mjs";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const tax = require("../src/lib/tax-classification.ts");
const contract = require("../src/lib/tax-classification-contract.ts");
function fixture() {
  const source = productFixture(), store = { id: "store_fixture", settings: null, database_now: "2026-10-02T18:00:00.000Z" };
  const calls = []; const untouched = { stock_location_id: "sloc_fixture", private_other: "retained" };
  let transactions = 0;
  const db = {
    async raw(sql, bindings) {
      calls.push({ sql, bindings });
      if (sql.startsWith("select id,metadata")) return { rows: [structuredClone(store)] };
      if (sql.startsWith("with products")) return { rows: [{ products: [structuredClone(source)], count: "1" }] };
      if (sql.includes("from commerce.cart_line_item li left join")) return { rows: [{ id: "cali_fixture", variant_id: "variant_fixture", product_id: source.id }] };
      if (sql.startsWith("select p.id")) return { rows: [structuredClone(source)] };
      if (sql.startsWith("update commerce.store")) { store.settings = { ...store.settings, [bindings[0]]: JSON.parse(bindings[1]) }; return { rows: [{ id: store.id }] }; }
      assert.fail(`Unexpected SQL: ${sql}`);
    },
    async transaction(action) { transactions++; const before = structuredClone(store); try { return await action(db); } catch (error) { Object.assign(store,before); throw error; } },
  };
  const scope = { resolve: key => { assert.equal(key,"__pg_connection__"); return db; } };
  const reader = { async retrieve(id) { assert.equal(id,codeFixture().id); return { ...codeFixture(), object: "tax_code", secret_unwanted: "strip me" }; }, async list() { return { data: [codeFixture()], has_more: false }; } };
  return { source, store, calls, untouched, db, scope, reader, get transactions() { return transactions; } };
}
test("native admin actor is required before any database or Stripe access", async () => {
  const scope = { resolve() { assert.fail("Must authenticate first"); } }, reader = { retrieve() { assert.fail("No network"); }, list() { assert.fail("No network"); } };
  for (const actor of [undefined, { actor_type: "customer", actor_id: "user_fixture" }, { actor_type: "user", actor_id: "cus_fixture" }]) {
    await assert.rejects(() => tax.adminTaxProducts(scope,actor), /Sign in/);
    await assert.rejects(() => tax.saveTaxClassification(scope,actor,"prod_fixture",commandFixture(),reader), /Sign in/);
    await assert.rejects(() => tax.adminTaxCodes(actor,reader), /Sign in/);
  }
});
test("official code pagination is complete, strips unrelated fields and never performs writes", async () => {
  const calls = [], second = { ...codeFixture(), id: "txcd_30011000", name: "Clothing & Footwear" };
  const result = await tax.adminTaxCodes(auth,{ list: async cursor => { calls.push(cursor); return cursor ? { data: [second], has_more: false } : { data: [{ ...codeFixture(), api_key: "must strip" }], has_more: true }; } });
  assert.deepEqual(calls,[undefined,codeFixture().id]); assert.equal(result.codes.length,2); assert.ok(!JSON.stringify(result).includes("api_key"));
  const requests = [];
  const api = tax.createTaxCodeReader({ taxCodes: { list: async input => { requests.push(["list",input]); return {}; }, retrieve: async id => { requests.push(["retrieve",id]); return {}; }, create() { assert.fail("Never writes Stripe"); } } });
  await api.list(); await api.list(second.id); await api.retrieve(second.id);
  assert.deepEqual(requests,[["list",{ limit: 100 }],["list",{ limit: 100, starting_after: second.id }],["retrieve",second.id]]);
});
test("tax code reader uses protected commerce credentials only and validates exact ids before network", async () => {
  const previous=process.env.COMMERCE_STRIPE_API_KEY;
  try {
    for (const key of [undefined,"invalid","pk_test_fixture"]) { if(key===undefined)delete process.env.COMMERCE_STRIPE_API_KEY;else process.env.COMMERCE_STRIPE_API_KEY=key;assert.throws(()=>tax.createTaxCodeReader(),/unavailable/); }
    process.env.COMMERCE_STRIPE_API_KEY="sk_test_fixture_only_not_a_real_key";const reader=tax.createTaxCodeReader();assert.throws(()=>reader.retrieve("invalid"));assert.throws(()=>reader.list("not_a_tax_code"));
  } finally { if(previous===undefined)delete process.env.COMMERCE_STRIPE_API_KEY;else process.env.COMMERCE_STRIPE_API_KEY=previous; }
  const f=fixture();f.db.raw=async()=>({rows:[]});await assert.rejects(()=>tax.saveTaxClassification(f.scope,auth,f.source.id,commandFixture(),f.reader),/Product not found/);
});
test("invalid, duplicate, stuck or overlong catalog pages fail safely instead of showing a partial list", async () => {
  for (const page of [{ data: [], has_more: true }, { data: [codeFixture(),codeFixture()], has_more: false }, { data: [{ ...codeFixture(), id: "invented" }], has_more: false }]) await assert.rejects(() => tax.adminTaxCodes(auth,{ list: async () => page }), /unavailable/);
  let count = 0;
  await assert.rejects(() => tax.adminTaxCodes(auth,{ list: async () => ({ data: [{ ...codeFixture(), id: `txcd_fixture${count++}` }], has_more: true }) }), /unavailable/);
  assert.equal(count,20);
  await assert.rejects(() => tax.adminTaxCodes(auth,{ list: async () => { throw new Error("secret-provider-details"); } }), error => !error.message.includes("secret-provider"));
});
test("classification fingerprint changes for product content and variants, but survives publication and ordering", () => {
  const source = productFixture(), base = tax.taxProductFingerprint(source);
  assert.equal(tax.taxProductFingerprint({ ...source, status: "draft" }),base);
  for (const patch of [{ title: "Different product" }, { description: "Different material" }, { material: "wool" }, { hs_code: "different" }, { type_id: "ptyp_new" }, { is_giftcard: true }, { variants: [] }, { variants: [{ ...source.variants[0], title: "Different model" }] }]) assert.notEqual(tax.taxProductFingerprint({ ...source,...patch }),base);
  const two = { ...source, variants: [...source.variants,{ ...source.variants[0], id: "variant_other" }] };
  assert.equal(tax.taxProductFingerprint(two),tax.taxProductFingerprint({ ...two, variants: [...two.variants].reverse() }));
});
test("review persists exact verified category, exclusive prices and append-only actor audit", async () => {
  const f = fixture(); f.store.settings = { prod_other: { unrelated: "retain other product exactly" } };
  const result = await tax.saveTaxClassification(f.scope,auth,f.source.id,commandFixture(),f.reader);
  assert.equal(result.product.ready,true); assert.equal(result.product.state.revision,1); assert.equal(result.product.state.history[0].tax_behavior,"exclusive");
  assert.equal(result.product.state.history[0].reviewed_by,auth.actor_id); assert.equal(result.product.state.history[0].reviewed_at,f.store.database_now);
  assert.equal(result.product.state.history[0].code.id,codeFixture().id); assert.ok(!JSON.stringify(result).includes("secret_unwanted"));
  assert.deepEqual(f.store.settings.prod_other,{ unrelated: "retain other product exactly" });
  const write = f.calls.find(call => call.sql.startsWith("update commerce.store"));
  assert.ok(write.sql.includes("jsonb_set(coalesce(metadata")); assert.ok(write.sql.includes("jsonb_build_object")); assert.equal(f.transactions,1);
  const second = commandFixture(f.source,{ request_id: "123e4567-e89b-42d3-a456-426614174002", expected_revision: 1, note: "Reviewed same physical product after an operator update." });
  const next = await tax.saveTaxClassification(f.scope,auth,f.source.id,second,f.reader);
  assert.equal(next.product.state.history.length,2); assert.deepEqual(next.product.state.history[0],result.product.state.history[0]);
});
test("same save request replays without Stripe or SQL writes; changed payload or actor is rejected", async () => {
  const f = fixture(), input = commandFixture(); await tax.saveTaxClassification(f.scope,auth,f.source.id,input,f.reader);
  const before = f.calls.length;
  const replay = await tax.saveTaxClassification(f.scope,auth,f.source.id,input,{ retrieve() { assert.fail("No network on replay"); } });
  assert.equal(replay.replayed,true); assert.equal(replay.applied_revision,1); assert.ok(f.calls.slice(before).every(call => !call.sql.startsWith("update")));
  for (const [who,body] of [[auth,{ ...input,note:"Changed payload" }],[{ ...auth,actor_id:"user_other" },input]]) await assert.rejects(() => tax.saveTaxClassification(f.scope,who,f.source.id,body,f.reader), /changed/);
});
test("stale product or revision and invalid inputs fail before network or transaction", async () => {
  const f = fixture(), never = { retrieve() { assert.fail("No network"); } };
  for (const input of [{ ...commandFixture(),expected_revision:1 },{ ...commandFixture(),source_fingerprint:"0".repeat(64) },{ ...commandFixture(),confirm_review:false },{ ...commandFixture(),note:"x" },{ ...commandFixture(),tax_code:"txcd_bad",admin:true }]) await assert.rejects(() => tax.saveTaxClassification(f.scope,auth,f.source.id,input,never));
  for (const offset of [[0],"1.5",-1,"1000001"]) await assert.rejects(() => tax.adminTaxProducts(f.scope,auth,offset), /Choose/);
  assert.equal(f.transactions,0);
});
test("code lookup failure, different exact code and unsupported location or gift card cannot save", async () => {
  for (const remote of [null,{ ...codeFixture(),id:"txcd_different" },{ ...codeFixture(),requirements:{ performance_location:"required" } },{ ...codeFixture(),requirements:{ performance_location:"future" } }]) {
    const f = fixture(); await assert.rejects(() => tax.saveTaxClassification(f.scope,auth,f.source.id,commandFixture(),{ retrieve:async () => remote })); assert.equal(f.store.settings,null);
  }
  const f = fixture(); f.source.is_giftcard = true;
  await assert.rejects(() => tax.saveTaxClassification(f.scope,auth,f.source.id,commandFixture(f.source),f.reader));
  await assert.rejects(() => tax.saveTaxClassification(f.scope,auth,f.source.id,commandFixture(f.source),{ retrieve:async () => { throw new Error("sk_test_private"); } }), error => !error.message.includes("sk_test_private"));
});
test("racing metadata or native product changes are rechecked under the Store transaction", async () => {
  for (const changed of [f => { f.store.settings = { [f.source.id]: stateFixture(f.source,commandFixture(f.source,{ request_id:"123e4567-e89b-42d3-a456-426614174099" })) }; },f => { f.source.description = "Changed during code lookup"; }]) {
    const f = fixture(); const reader = { retrieve:async () => { changed(f); return codeFixture(); } };
    await assert.rejects(() => tax.saveTaxClassification(f.scope,auth,f.source.id,commandFixture(),reader), /changed/);
    assert.ok(f.calls.some(call => call.sql.includes("for update"))); assert.ok(!f.calls.some(call => call.sql.startsWith("update commerce.store")));
  }
});
test("listing exposes only per-product audit, identifies stale content and rejects malformed history", async () => {
  const f = fixture(); f.store.settings = { [f.source.id]: stateFixture(), prod_other: { password:"private" } };
  let page = await tax.adminTaxProducts(f.scope,auth,"0"); assert.equal(page.products[0].ready,true); assert.equal(page.count,1); assert.ok(!JSON.stringify(page).includes("password"));
  f.source.description = "Edited product"; page = await tax.adminTaxProducts(f.scope,auth); assert.equal(page.products[0].ready,false);
  f.store.settings[f.source.id].history[0].revision = 2; await assert.rejects(() => tax.adminTaxProducts(f.scope,auth), /unavailable/);
  assert.equal(contract.taxClassificationStateSchema.safeParse({ ...stateFixture(),revision:2 }).success,false);
});
test("native checkout classifications reject missing reviews, stale products, custom items and future dates", async () => {
  const cart = { id:"cart_fixture",items:[{ id:"cali_fixture",variant_id:"variant_fixture" }] }, f = fixture();
  f.store.settings = { [f.source.id]:stateFixture() }; await tax.assertCartProductTaxClassifications(cart,f.scope);
  assert.equal(f.calls.length,3,"Batched native product check uses three reads rather than one per line");
  for (const change of [f => { f.store.settings=null; },f => { f.source.status="draft"; },f => { f.source.variants=[]; },f => { f.source.description="Changed"; },f => { f.source.is_giftcard=true; },f => { f.store.settings[f.source.id].history[0].reviewed_at="2099-01-01T00:00:00.000Z"; }]) {
    const next = fixture(); next.store.settings = { [next.source.id]:stateFixture() }; change(next); await assert.rejects(() => tax.assertCartProductTaxClassifications(cart,next.scope), /current tax classification/);
  }
  for (const items of [[],[{ id:"foreign",variant_id:"variant_fixture" }],[{ id:"cali_fixture",variant_id:null }],[...cart.items,...cart.items]]) await assert.rejects(() => tax.assertCartProductTaxClassifications({ ...cart,items },f.scope), /classification/);
});
