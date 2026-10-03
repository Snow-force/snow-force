import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {applicationFixture,withEnabled} from "./fixtures/tax-application.mjs";
import {auth} from "./fixtures/tax-source.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {withdrawCartTaxQuote}=require("../src/lib/tax-quote-withdrawal.ts");
const {refreshCartTaxQuote,createCartTaxRefresher}=require("../src/lib/tax-quote-refresh.ts");
const {readHistoricalNativeTaxQuote,assertPersistedCartTaxQuote}=require("../src/lib/tax-quote-ledger.ts");
const {checkoutCartSchema}=require("../src/lib/checkout-policy.ts");
const {readStripeTaxSetup}=require("../src/lib/tax-setup.ts");
const {GET}=require("../src/api/store/snowforce/checkout/[id]/route.ts");
const {POST:edit}=require("../src/api/store/snowforce/checkout/[id]/edit/route.ts");
const {POST:quote}=require("../src/api/store/snowforce/checkout/[id]/quote/route.ts");
process.env.JWT_SECRET="fixture-lifecycle-signing-key-at-least-32-characters";
const withdraw=f=>withdrawCartTaxQuote(f.scope,auth,f.cart.id);
const refresh=f=>withEnabled(()=>refreshCartTaxQuote(f.scope,auth,f.cart.id));

test("expired quotes can be withdrawn with tax disabled while private history and unrelated metadata remain",async()=>{
  const f=await applicationFixture({state:"CO",fee:28});await f.apply();f.clockShift=1000;
  f.cart.metadata.snowforce_shop_policy_acceptance={old:"preserve until withdrawal"};
  const history=structuredClone([f.operations,f.results,f.applications]),setupCalls=f.providerCalls;
  process.env.COMMERCE_TAX_POLICY_CONFIRMED="false";
  assert.equal((await readHistoricalNativeTaxQuote(checkoutCartSchema.parse(f.cart),f.scope)).quote.amounts.government_fee_cents,28);
  assert.deepEqual(await withdraw(f),{status:"editable",quote_removed:true,review_required:true});
  assert.equal(f.cart.items.length,1);assert.equal(f.cart.tax_total,0);assert.equal(f.cart.total,109.94);
  assert.equal(f.retiredFees.length,1);assert.equal(f.retiredTaxes.length,2);
  assert.ok(!f.cart.metadata.snowforce_tax_quote);assert.ok(f.cart.metadata.ignored_browser_claim);
  assert.deepEqual([f.operations,f.results,f.applications],history);assert.equal(f.providerCalls,setupCalls);
  const writes=f.writes.length;assert.equal((await withdraw(f)).quote_removed,false);assert.equal(f.writes.length,writes);
});

test("withdrawal rolls back all taxes, fees, metadata and empty collection retirement on any final failure",async()=>{
  for(const step of [1,2,3,4,5]){
    const f=await applicationFixture({state:"CO",fee:28});await f.apply();
    f.cart.payment_collection={id:"pay_col_empty",amount:f.cart.total,currency_code:"usd",payment_sessions:[]};
    const before=structuredClone([f.cart,f.applications,f.retiredTaxes,f.retiredFees,f.retiredCollections]);
    f.failWrite=f.writes.length+step;
    await assert.rejects(()=>withdraw(f),error=>!error.message.includes("private-atomic"));
    assert.deepEqual([f.cart,f.applications,f.retiredTaxes,f.retiredFees,f.retiredCollections],before);
  }
});

test("payment/order/funds, forged proof, orphan fees, credits and ambiguous requests prevent quote cleanup",async()=>{
  for(const kind of ["session","order","funds","payment","signature","amount","orphan","pending","credits"]){
    const f=await applicationFixture({state:"CO",fee:28});await f.apply();
    if(kind==="session")f.cart.payment_collection={payment_sessions:[{id:"payses_fixture"}]};
    if(kind==="order")f.guard={has_order:true};if(kind==="funds")f.guard={has_collection_funds:true};if(kind==="payment")f.guard={has_payment:true};
    if(kind==="signature")f.cart.metadata.snowforce_tax_quote.signature="f".repeat(64);
    if(kind==="amount")f.cart.total+=1;if(kind==="orphan")delete f.cart.metadata.snowforce_tax_quote;
    if(kind==="pending")f.operations.set("pending_fixture",{id:"pending_fixture",state:"pending"});
    if(kind==="credits")f.cart.credit_lines=[{id:"cacl_fixture",amount:1}];
    const before=structuredClone(f.cart),writes=f.writes.length;await assert.rejects(()=>withdraw(f));
    assert.deepEqual(f.cart,before);assert.equal(f.writes.length,writes);
  }
});

test("ownership, identity races and lease expiry cannot remove a quote",async()=>{
  const f=await applicationFixture();await f.apply();const before=structuredClone(f.cart);
  await assert.rejects(()=>withdrawCartTaxQuote(f.scope,{...auth,actor_id:"cus_other"},f.cart.id));
  const controller=new AbortController();f.onWrite=()=>controller.abort();
  await assert.rejects(()=>withdrawCartTaxQuote(f.scope,auth,f.cart.id,[controller.signal]));assert.deepEqual(f.cart,before);
  const race=await applicationFixture();await race.apply();const base=race.scope;
  race.scope={resolve:(key,options)=>{const db=base.resolve(key,options);return key==="__pg_connection__"?{...db,transaction:async action=>{race.cart.shipping_address.address_1="Changed before lock";return db.transaction(action);}}:db;}};
  const writes=race.writes.length;await assert.rejects(()=>withdraw(race));assert.equal(race.writes.length,writes);
});

test("first customer quote applies a previously recorded result and repeated clicks reuse current evidence without provider POSTs",async()=>{
  const f=await applicationFixture({state:"CO",fee:28}),writes=f.writes.length,posts=f.requests.length;
  const first=await refresh(f);assert.equal(first.status,"quoted");assert.equal(first.taxQuote.totalCents,11263);assert.deepEqual(first.taxQuote.fees,[{state:"CO",amountCents:28}]);
  assert.equal(f.requests.length,posts);assert.ok(f.writes.length>writes);
  const after=f.writes.length;assert.equal((await refresh(f)).reused,true);assert.equal(f.writes.length,after);assert.equal(f.requests.length,posts);
  assert.ok(!JSON.stringify(first).match(/quote_id|acct_fixture|binding_fingerprint|tax_code|customer_id/));
});

test("after withdrawal a new quote gets fresh immutable application evidence and a stable provider retry",async()=>{
  const f=await applicationFixture({state:"CO",fee:28});await f.apply();const oldId=f.prepared.quote_id;await withdraw(f);
  f.failPost=true;const writes=f.writes.length;await assert.rejects(()=>refresh(f));assert.equal(f.applications.size,1);assert.equal(f.operations.size,2);
  const attempted=f.requests.at(-1);assert.ok(!attempted.key.endsWith(oldId));
  await assert.rejects(()=>withdraw(f));assert.equal(f.writes.length,writes);
  f.failPost=false;const refreshed=await refresh(f);assert.equal(refreshed.status,"quoted");assert.deepEqual(f.requests.at(-1),attempted);
  assert.equal(f.applications.size,2);assert.equal(f.operations.size,2);assert.notEqual(f.cart.metadata.snowforce_tax_quote.quote_id,oldId);assert.ok(f.applications.has(oldId));
});

test("expired unpaid quote is replaced with a fresh calculation before payment can be initialized",async()=>{
  const f=await applicationFixture();await f.apply();const oldId=f.prepared.quote_id,now=Date.now,at=Date.now()+901000;
  try{
    Date.now=()=>at;f.date=new Date(at).toISOString();
    await assert.rejects(async()=>assertPersistedCartTaxQuote(checkoutCartSchema.parse(f.cart),f.scope,await readStripeTaxSetup(f.setup),"create_payment"));
    const fresh=await refresh(f);assert.equal(fresh.status,"quoted");assert.ok(fresh.taxQuote.expiresAt>Math.floor(at/1000));assert.notEqual(f.cart.metadata.snowforce_tax_quote.quote_id,oldId);
    assert.equal(f.applications.size,2);assert.equal(f.requests.length,2);
  }finally{Date.now=now;}
});

test("GET reports merchant readiness before an address or quote exists and presents proven fee lines separately",async()=>{
  const f=await applicationFixture({state:"CO",fee:28});
  const saved={COMMERCE_TAX_POLICY_CONFIRMED:process.env.COMMERCE_TAX_POLICY_CONFIRMED,COMMERCE_STRIPE_API_KEY:process.env.COMMERCE_STRIPE_API_KEY,COMMERCE_STRIPE_WEBHOOK_SECRET:process.env.COMMERCE_STRIPE_WEBHOOK_SECRET};
  Object.assign(process.env,{COMMERCE_TAX_POLICY_CONFIRMED:"true",COMMERCE_STRIPE_API_KEY:"sk_test_fixture",COMMERCE_STRIPE_WEBHOOK_SECRET:"whsec_fixture"});
  try{
    const address=f.cart.shipping_address,methods=f.cart.shipping_methods;f.cart.shipping_address=null;f.cart.shipping_methods=[];let result;
    const req={scope:f.scope,params:{id:f.cart.id},auth_context:auth};await GET(req,{json:value=>{result=value;}});
    assert.equal(result.configured,true);assert.equal(result.taxQuote,null);assert.equal(result.paymentStarted,false);
    f.cart.shipping_address=address;f.cart.shipping_methods=methods;await f.apply();await GET(req,{json:value=>{result=value;}});
    assert.equal(result.taxQuote.ready,true);assert.equal(result.cart.items.length,1);assert.equal(result.taxQuote.fees[0].amountCents,28);
    f.clockShift=1000;await GET(req,{json:value=>{result=value;}});assert.equal(result.configured,true);assert.equal(result.taxQuote.ready,false);assert.equal(result.cart.items.length,1);
  }finally{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test("customer quote/edit endpoints reject client money and do not resolve dependencies before authentication",async()=>{
  const req={body:{amount:1},params:{id:"cart_fixture"},scope:{resolve:()=>assert.fail("No dependency")},auth_context:auth};
  for(const handler of [edit,quote])await assert.rejects(()=>handler(req,{json:()=>assert.fail("No response")}));
  for(const actor of [undefined,{actor_type:"user",actor_id:"user_fixture"}]){
    await assert.rejects(()=>withdrawCartTaxQuote(req.scope,actor,"cart_fixture"),/Sign in/);
    await assert.rejects(()=>refreshCartTaxQuote(req.scope,actor,"cart_fixture"),/Sign in/);
  }
  await assert.rejects(()=>refreshCartTaxQuote(req.scope,auth,"foreign"),/Invalid cart/);
});

test("existing payment and disabled tax gate prevent refresh without calling an injected tax flow",async()=>{
  const f=await applicationFixture(),never=()=>assert.fail("No tax mutation"),refresh=createCartTaxRefresher({withdraw:never,normalize:never,create:never,apply:never});
  process.env.COMMERCE_TAX_POLICY_CONFIRMED="false";await assert.rejects(()=>refresh(f.scope,auth,f.cart.id));
  f.cart.payment_collection={...f.cart.payment_collection,id:"pay_col_fixture",amount:f.cart.total,currency_code:"usd",payment_sessions:[{id:"payses_fixture"}]};
  await assert.rejects(()=>withEnabled(()=>refresh(f.scope,auth,f.cart.id)));
});
