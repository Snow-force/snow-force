import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { auth } from "./fixtures/tax-source.mjs";
import { creationFixture } from "./fixtures/tax-creation.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { createCartTaxQuote } = require("../src/lib/tax-quote-creation.ts");

async function create(f,actor=auth,id=f.cart.id,signals=[]) {
  const old = process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try { process.env.COMMERCE_TAX_POLICY_CONFIRMED = "true"; return await createCartTaxQuote(f.scope,actor,id,signals); }
  finally { if(old === undefined) delete process.env.COMMERCE_TAX_POLICY_CONFIRMED; else process.env.COMMERCE_TAX_POLICY_CONFIRMED=old; }
}

test("authenticated server source produces one durable Calculation result without applying taxes or enabling payment",async()=>{
  const f=creationFixture(),before=structuredClone(f.cart),result=await create(f);
  assert.equal(result.applied,false);assert.equal(result.reused,false);assert.equal(result.quote.amounts.merchandise_cents,9999);assert.equal(result.quote.amounts.shipping_cents,995);
  assert.equal(f.operations.size,1);assert.equal(f.results.size,1);assert.equal([...f.operations.values()][0].state,"ready");assert.deepEqual(f.cart,before);
  assert.deepEqual(f.locks.map(row=>row.key),["snowforce-checkout:cart_fixture","cart_fixture"]);assert.deepEqual(f.locks[0].options,{timeout:15,expire:120});
  assert.equal(f.requests[0].request.line_items[0].amount,9999);assert.equal(f.requests[0].request.shipping_cost.amount,995);
  assert.equal(f.requests[0].key,`snowforce-tax-quote:${result.quote_id}`);
  assert.ok(!JSON.stringify(result.quote).includes("ignored_browser_claim"));assert.ok(!JSON.stringify(result).includes("namespace"));
});

test("response lost after commit reuses the verified saved result with zero additional POSTs",async()=>{
  const f=creationFixture(),first=await create(f),second=await create(f);
  assert.equal(second.quote_id,first.quote_id);assert.deepEqual(second.quote,first.quote);assert.equal(second.reused,true);
  assert.equal(f.operations.size,1);assert.equal(f.requests.length,1);assert.equal(f.pages.length,1);
});

test("ambiguous POST, failed listing and failed record keep the original key/date/body on retry",async()=>{
  for(const kind of ["post","page","record"]){
    const f=creationFixture();f[kind === "post" ? "failPost" : kind === "page" ? "failPage" : "failRecord"]=true;
    await assert.rejects(()=>create(f),error=>!error.message.includes("private-"));
    assert.equal(f.operations.size,1);assert.equal(f.results.size,0);assert.equal([...f.operations.values()][0].state,"pending");
    const first=structuredClone(f.requests[0]);f.failPost=false;f.failPage=false;f.failRecord=false;f.date=new Date(new Date(f.date).getTime()+2000).toISOString();
    const result=await create(f);assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1],first);assert.equal(f.results.size,1);assert.equal(result.quote_id,[...f.operations.values()][0].id);
  }
});

test("unknown requests can't be replaced after changes to amount, shipping, account, setup or key namespace",async()=>{
  for(const kind of ["amount","shipping","account","setup","namespace"]){
    const f=creationFixture();f.failPost=true;await assert.rejects(()=>create(f));f.failPost=false;
    if(kind === "amount"){f.cart.items[0].unit_price++;}
    if(kind === "shipping")f.cart.shipping_address.address_1="2 Changed Street";
    if(kind === "account")f.writer.account=async()=>({object:"account",id:"acct_foreign"});
    if(kind === "setup"){const original=f.setup.settings;f.setup.settings=async()=>({...await original(),defaults:{provider:"stripe",tax_behavior:"exclusive",tax_code:null}});}
    if(kind === "namespace")f.writer.namespace="a".repeat(64);
    await assert.rejects(()=>create(f));assert.equal(f.operations.size,1);assert.equal(f.requests.length,1);assert.equal(f.results.size,0);
  }
});

test("source edited during identity check cannot reserve, and changes during POST preserve history without returning a current quote",async()=>{
  const before=creationFixture();before.onWriterAccount=()=>{before.cart.shipping_address.address_1="Changed before reserve";};
  await assert.rejects(()=>create(before));assert.equal(before.operations.size,0);assert.equal(before.requests.length,0);
  for(const kind of ["address","owner","payment","flag"]){
    const f=creationFixture();f.onCreate=()=>{
      if(kind === "address")f.cart.shipping_address.address_1="Changed during POST";
      if(kind === "owner")f.cart.customer_id="cus_other";
      if(kind === "payment")f.cart.payment_collection={id:"paycol_fixture",amount:109.94,currency_code:"usd",payment_sessions:[{id:"payses_fixture"}]};
      if(kind === "flag")process.env.COMMERCE_TAX_POLICY_CONFIRMED="false";
    };
    await assert.rejects(()=>create(f));assert.equal(f.requests.length,1);assert.equal(f.results.size,1);assert.equal([...f.operations.values()][0].state,"ready");
    assert.ok(!Object.hasOwn(f.cart.metadata,"snowforce_tax_quote"));
  }
});

test("authentication, ownership, identifiers, blocked setup and existing payment fail before Calculation creation",async()=>{
  for(const kind of ["anonymous","actor","id","owner","pending_setup","payment","flag","fractional"]){
    const f=creationFixture();let actor=auth,id=f.cart.id;
    if(kind === "anonymous")actor=null;if(kind === "actor")actor={...auth,actor_type:"user"};if(kind === "id")id="foreign";
    if(kind === "owner")f.cart.customer_id="cus_other";
    if(kind === "pending_setup"){const original=f.setup.settings;f.setup.settings=async()=>({...await original(),status:"pending"});}
    if(kind === "payment")f.cart.payment_collection={payment_sessions:[{id:"payses_fixture"}]};
    if(kind === "fractional")f.cart.items[0].adjustments[0].amount=10.005;
    if(kind === "flag"){const old=process.env.COMMERCE_TAX_POLICY_CONFIRMED;try{process.env.COMMERCE_TAX_POLICY_CONFIRMED="false";await assert.rejects(()=>createCartTaxQuote(f.scope,auth,id));}finally{if(old===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=old;}}
    else await assert.rejects(()=>create(f,actor,id));
    assert.equal(f.requests.length,0);assert.equal(f.operations.size,0);
  }
});

test("external and shared lease expiration stop provider pagination or result recording without losing the reserved request",async()=>{
  const before=creationFixture(),external=new AbortController();external.abort();await assert.rejects(()=>create(before,auth,before.cart.id,[external.signal]));assert.equal(before.locks.length,0);
  for(const position of ["post","page","reserve"]){
    const f=creationFixture();
    if(position === "post")f.onCreate=()=>f.controllers[1].abort();
    if(position === "page")f.onPage=()=>f.controllers[0].abort();
    if(position === "reserve")f.onTransaction=()=>f.controllers[0].abort();
    await assert.rejects(()=>create(f));assert.equal(f.results.size,0);
    assert.equal(f.requests.length,position === "reserve" ? 0 : 1);
    assert.equal(f.operations.size,1);assert.equal([...f.operations.values()][0].state,"pending");
  }
});
