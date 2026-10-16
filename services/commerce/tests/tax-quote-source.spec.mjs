import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const service = require("../src/lib/tax-quote-source.ts");
const { checkoutFingerprint } = require("../src/lib/checkout-policy.ts");
const { shippingPriceRecords } = require("../src/lib/shipping-policy.ts");
const { taxQuoteInputSchema } = require("../src/lib/tax-quote-contract.ts");
const { governmentFeeMetadataKey } = require("../src/lib/tax-quote-money.ts");
import {auth,nativeCart,fixture,read} from "./fixtures/tax-source.mjs";

test("independent source checks overlap at both read fences without starting Stripe before validation",async()=>{
  for(const fence of [1,2]){
    const f=fixture(),resolve=f.scope.resolve.bind(f.scope);let regionReads=0,release,started;
    const gate=new Promise(done=>{release=done;}),entered=new Promise(done=>{started=done;});
    f.scope={resolve:(key,...args)=>{const dependency=resolve(key,...args);return key!=="query"?dependency:{graph:async request=>{
      if(request.entity==="region"&&++regionReads===fence){started();await gate;}
      return dependency.graph(request);
    }};}};
    const pending=read(f);
    await entered;
    try{
      assert.ok(f.privateReads>0,"product review reads overlap the region check");
      assert.ok(fence===1?f.graphCalls.some(call=>call.entity==="shipping_option"):f.graphCalls.filter(call=>call.entity==="shipping_option").length===2);
      assert.equal(f.providerCalls,fence===1?0:3);
    }finally{release();}
    assert.equal((await pending).input.customer_id,auth.actor_id);
  }
});

test("reads an unpaid native graph cart without a payment collection", async () => {
  const f = fixture(); delete f.cart.payment_collection;
  const result = await read(f);
  assert.equal(result.cart.payment_collection, null);
  assert.equal(result.input.customer_id, auth.actor_id);
  assert.equal(result.input.lines.length, 1);
  assert.doesNotThrow(() => service.assertTaxMoneySourceSnapshot(result, f.cart));
  for (const collection of [{}, { payment_sessions: [{ id: "payses_started" }] }]) {
    const started = fixture(); started.cart.payment_collection = collection;
    await assert.rejects(() => read(started));
    assert.equal(started.providerCalls, 0);
  }
});

test("quote source derives exact native discounted money, reviewed codes, private flags and database time", async () => {
  const f = fixture(), result = await read(f);
  assert.equal(result.input.tax_date, Math.floor(Date.parse(f.date) / 1000));
  assert.equal(result.input.configuration_revision, 2);
  assert.equal(result.input.lines[0].unit_price_cents, 11000);
  assert.equal(result.input.lines[0].discount_cents, 1001);
  assert.equal(result.input.lines[0].tax_code, "txcd_99999999");
  assert.equal(result.input.shipping.amount_cents, 995);
  assert.equal(result.input.shipping.tax_code, "txcd_92010001");
  assert.equal(result.input.cart_fingerprint, checkoutFingerprint(result.cart));
  assert.equal(result.input.ship_from_address.line1, f.warehouse.address.address_1);
  assert.equal(taxQuoteInputSchema.safeParse(result.input).success, true);
  assert.deepEqual(result.discounts[0].adjustments, [{ id: "caliadj_fixture", amount_cents: 1001, amount: "10.01" }]);
  assert.ok(!JSON.stringify(result.input).includes("ignored_browser_claim"));
  assert.equal(f.cartReads, 3);
  assert.deepEqual(f.graphCalls[0].fields,service.taxQuoteOwnerFields);
  assert.ok(f.graphCalls.filter(call=>call.entity==="cart").every(call=>!call.fields.includes("payment_collection.payment_sessions.*")&&!call.fields.some(field=>field.includes("sessions.data"))));
  assert.equal(f.providerCalls, 3);
});

test("native BigNumber and number serialization of identical source money has the same private fingerprint", async () => {
  const f=fixture(),first=await read(f),{BigNumber}=require("@medusajs/utils");
  f.cart.item_subtotal=new BigNumber(f.cart.item_subtotal);f.cart.discount_subtotal=new BigNumber(f.cart.discount_subtotal);
  for(const item of f.cart.items){item.unit_price=new BigNumber(item.unit_price);for(const adjustment of item.adjustments)adjustment.amount=new BigNumber(adjustment.amount);}
  f.cart.shipping_methods[0].amount=new BigNumber(f.cart.shipping_methods[0].amount);
  // Query fixtures clone JSON; check the raw in-transaction source directly as the SQL reader returns it.
  service.assertTaxMoneySourceSnapshot({...first,shipping_cents:first.input.shipping.amount_cents},f.cart);
});
test("native discounted 99.99/100.00 boundaries use current saved shipping rules", async () => {
  for (const [discount, shipping, net, shippingCents] of [[10.01,9.95,9999,995],[10,0,10000,0]]) {
    const f = fixture(nativeCart(110,discount,shipping)), result = await read(f);
    assert.equal(result.input.lines[0].unit_price_cents - result.input.lines[0].discount_cents, net);
    assert.equal(result.input.shipping.amount_cents, shippingCents);
  }
  const changed = fixture(); changed.option.prices = shippingPriceRecords({ fee_cents: 1250, free_threshold_cents: 15000 }).map(({ rules,...row }) => ({...row,price_rules:rules}));
  await assert.rejects(() => read(changed)); assert.equal(changed.providerCalls,0);
});
test("actor and malformed IDs are rejected before any graph, private data or provider access", async () => {
  const f = fixture();
  await assert.rejects(() => service.readCartTaxQuoteSource(f.scope,undefined,f.cart.id), /Sign in/);
  for (const actor of [{actor_type:"user",actor_id:"cus_fixture"},{actor_type:"customer",actor_id:"user_fixture"}]) await assert.rejects(() => read(f, actor), /Sign in/);
  await assert.rejects(() => read(f,auth,"other"),/Invalid cart/);
  assert.equal(f.graphCalls.length,0); assert.equal(f.privateReads,0); assert.equal(f.providerCalls,0);
});
test("another customer's malformed cart never reaches parsing, business data or Stripe", async () => {
  const f = fixture(); f.cart.customer_id = "cus_other"; delete f.cart.items;
  await assert.rejects(() => read(f), /Cart not found/);
  assert.equal(f.graphCalls.length,1); assert.equal(f.privateReads,0); assert.equal(f.providerCalls,0);
});
test("closed release gate, completed carts and every existing payment state prevent re-quoting", async () => {
  const f = fixture(), previous = process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try { process.env.COMMERCE_TAX_POLICY_CONFIRMED = "false"; await assert.rejects(() => service.readCartTaxQuoteSource(f.scope,auth,f.cart.id)); }
  finally { if(previous===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=previous; }
  assert.equal(f.providerCalls,0); assert.equal(f.privateReads,0);
  for (const status of ["pending","authorized","captured","canceled","requires_more","error"]) {
    const candidate=fixture(); candidate.cart.payment_collection={id:"paycol_fixture",currency_code:"usd",amount:109.94,payment_sessions:[{id:"payses_fixture",provider_id:"pp_stripe_stripe",currency_code:"usd",amount:109.94,status,data:null}]};
    await assert.rejects(() => read(candidate)); assert.equal(candidate.providerCalls,0); assert.equal(candidate.privateReads,0);
  }
  const complete=fixture();complete.cart.completed_at=new Date().toISOString();await assert.rejects(()=>read(complete));assert.equal(complete.privateReads,0);
});
test("drafts, missing private approval and fake browser confirmations do not generate a quote", async () => {
  for (const kind of ["configuration","permit","policy","product","review","warehouse"]) {
    const f=fixture();
    if(kind==="configuration")f.metadata.snowforce_tax_configuration.active_revision=null;
    if(kind==="permit")f.metadata.snowforce_tax_configuration.publications[0].content.california_permit_confirmed=false;
    if(kind==="policy")delete f.metadata.snowforce_shop_policy;
    if(kind==="product")f.product.status="draft";
    if(kind==="review")delete f.metadata.snowforce_tax_classifications;
    if(kind==="warehouse")f.warehouse.address.address_1="Changed ship-from";
    await assert.rejects(()=>read(f),/reviewed tax setup/);
  }
});
test("non-USD/non-US regions, excluded delivery states and fractional or invalid native money fail before Stripe", async () => {
  for (const kind of ["region","currency","state","price","discount","duplicate","shipping-discount","inclusive","custom","fee-marker"]) {
    const f=fixture();
    if(kind==="region")f.region.countries.push({iso_2:"ca"});
    if(kind==="currency")f.region.currency_code="cad";
    if(kind==="state")f.cart.shipping_address.province="ak";
    if(kind==="price")f.cart.items[0].unit_price=110.005;
    if(kind==="discount")f.cart.items[0].adjustments[0].amount=111;
    if(kind==="duplicate")f.cart.items.push(structuredClone(f.cart.items[0]));
    if(kind==="shipping-discount")f.cart.shipping_methods[0].adjustments=[{id:"casmadj_fixture",amount:1}];
    if(kind==="inclusive")f.cart.items[0].is_tax_inclusive=true;
    if(kind==="custom")f.cart.items[0].is_custom_price=true;
    if(kind==="fee-marker")f.cart.items[0].metadata={[governmentFeeMetadataKey]:{amount_cents:0}};
    await assert.rejects(()=>read(f));assert.equal(f.providerCalls,0);
  }
});

test("stale denormalized totals cannot override the native snapshot's line and adjustment amounts",async()=>{
  const f=fixture();f.cart.discount_subtotal=1;f.cart.item_total=1;f.cart.total=1;
  const result=await read(f);
  assert.equal(result.input.lines[0].unit_price_cents,11000);
  assert.equal(result.input.lines[0].discount_cents,1001);
  assert.equal(result.input.shipping.amount_cents,995);
  assert.equal(result.cart.total,109.94);
  assert.equal(f.snapshotReads,2,"both fresh native snapshots remain required");
});
test("native half-cent promotions cannot silently change merchandise or the free-shipping boundary", async () => {
  const f=fixture(nativeCart(100,0.005,0));
  await assert.rejects(()=>read(f));assert.equal(f.providerCalls,0);
});
test("in-flight cart, review, warehouse, policy, delivery and payment changes are re-read and rejected", async () => {
  for(const kind of ["price","discount","fee-marker","review","warehouse","policy","delivery","region","payment"]) {
    const f=fixture();f.onAccount=()=>{
      if(kind==="price")f.cart=nativeCart(111,10.01,0);
      if(kind==="discount")f.cart=nativeCart(110,10,0);
      if(kind==="fee-marker")f.cart.items[0].metadata={[governmentFeeMetadataKey]:{amount_cents:0}};
      if(kind==="review")f.metadata.snowforce_tax_classifications.prod_fixture.history[0].code.description="Changed reviewed facts";
      if(kind==="warehouse")f.warehouse.address.postal_code="92618";
      if(kind==="policy")f.metadata.snowforce_shop_policy.publications[0].content.seller_name="Changed seller";
      if(kind==="delivery")f.option.prices[0].amount=12.5;
      if(kind==="region")f.region.currency_code="cad";
      if(kind==="payment")f.cart.payment_collection={id:"paycol_fixture",currency_code:"usd",amount:109.94,payment_sessions:[{id:"payses_fixture",provider_id:"pp_stripe_stripe",amount:109.94,currency_code:"usd",status:"pending",data:null}]};
    };await assert.rejects(()=>read(f));
  }
});

test("ownership, shape and payment are rechecked after the minimal owner lookup", async () => {
  for(const kind of ["ownership","shape","payment","graph"]) {
    const f=fixture();f.onCartRead=count=>{
      if(count!==2)return;
      if(kind==="ownership")f.cart.customer_id="cus_another";
      if(kind==="shape")f.cart.items[0].metadata=true;
      if(kind==="payment")f.cart.payment_collection={id:"paycol_fixture",currency_code:"usd",amount:109.94,payment_sessions:[{id:"payses_fixture",provider_id:"pp_stripe_stripe",amount:109.94,currency_code:"usd",status:"pending",data:{client_secret:"private-payment-secret"}}]};
      if(kind==="graph")throw new Error("private-graph-detail");
    };
    await assert.rejects(()=>read(f),error=>!error.message.includes("private-"));
    assert.equal(f.snapshotReads,1);
    assert.equal(f.privateReads,0);assert.equal(f.providerCalls,0);
  }
});
test("provider failure, clock drift and expired leases preserve all native facts and redact details", async () => {
  for(const kind of ["provider","clock","lease","database","graph"]) {
    const f=fixture(),before=structuredClone(f.cart),controller=new AbortController();
    if(kind==="provider")f.setup.account=async()=>{throw new Error("private-provider-detail");};
    if(kind==="clock")f.date=new Date(Date.now()-120000).toISOString();
    if(kind==="lease")f.onAccount=()=>controller.abort();
    if(kind==="database")f.failDb=true;
    if(kind==="graph")f.scope={resolve:key=>key==="query"?{graph:async()=>{throw new Error("private-graph-detail");}}:assert.fail("No private lookup after graph failure")};
    await assert.rejects(()=>read(f,auth,f.cart.id,[controller.signal]),error=>!error.message.includes("private-"));assert.deepEqual(f.cart,before);
  }
  const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(()=>read(f,auth,f.cart.id,[controller.signal]));assert.equal(f.graphCalls.length,0);
});
