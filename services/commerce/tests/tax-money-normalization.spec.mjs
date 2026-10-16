import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {auth,nativeCart,fixture,read} from "./fixtures/tax-source.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {decorateCartTotals,MathBN}=require("@medusajs/utils");
const {normalizeCartTaxMoney}=require("../src/lib/tax-money-normalization.ts");
const {readCartTaxMoneySource}=require("../src/lib/tax-quote-source.ts");
const {POST}=require("../src/api/store/snowforce/checkout/[id]/normalize/route.ts");

function normalizationFixture(cart=nativeCart(100,0.005,0)){
  const f=fixture(cart),baseScope=f.scope,baseDb=baseScope.resolve("__pg_connection__");
  Object.assign(f,{locks:[],lockSignals:[],writes:[],rawAmounts:new Map(),retiredCollections:[],transactionDepth:0,transactions:0,pending:false,guards:{has_order:false,has_session:false,has_payment:false,has_collection_funds:false},onTransaction:null,failWrite:0,emptyWrite:0});
  const recalculate=()=>{f.cart=JSON.parse(JSON.stringify(decorateCartTotals(f.cart)));};
  const originalAccount=f.setup.account;
  f.setup.account=async()=>{assert.equal(f.transactionDepth,0,"Stripe reads must stay outside SQL transactions");return originalAccount();};
  const raw=async(sql,values=[])=>{
    if(sql.startsWith("select id,customer_id,currency_code,region_id"))return {rows:[{id:f.cart.id,customer_id:f.cart.customer_id,currency_code:f.cart.currency_code,region_id:f.cart.region_id,completed_at:f.cart.completed_at,shipping_address_id:"caaddr_fixture"}]};
    if(sql.startsWith("select\n    exists"))return {rows:[{...f.guards,collection_count:f.cart.payment_collection?1:0}]};
    if(sql.startsWith("select id from commerce.snowforce_tax_operations"))return {rows:f.pending?[{id:"123e4567-e89b-42d3-a456-426614174001"}]:[]};
    if(sql.includes("for update"))return {rows:[]};
    if(sql.startsWith("update commerce.")||sql.startsWith("delete from commerce.cart_payment_collection")){
      assert.equal(f.transactionDepth,1);f.writes.push({sql,values:structuredClone(values)});
      if(f.failWrite===f.writes.length)throw new Error("private-write-detail");
      if(f.emptyWrite===f.writes.length)return {rows:[]};
      if(sql.startsWith("delete from commerce.cart_payment_collection")){
        assert.equal(values[0],f.cart.id);assert.equal(values[1],f.cart.payment_collection.id);
        f.retiredCollections.push(structuredClone(f.cart.payment_collection));f.cart.payment_collection=null;return {rows:[{id:"link_fixture"}]};
      }
      if(sql.startsWith("update commerce.cart_line_item_adjustment")){
        const [cents,json,id,itemId,original]=values,line=f.cart.items.find(row=>row.id===itemId),adjustment=line?.adjustments.find(row=>row.id===id);
        if(!adjustment||!MathBN.eq(adjustment.amount,original))return {rows:[]};
        adjustment.amount=cents/100;f.rawAmounts.set(id,JSON.parse(json));recalculate();return {rows:[{id}]};
      }
      if(sql.startsWith("update commerce.cart_shipping_method")){
        const [cents,json,id,cartId,original]=values,row=f.cart.shipping_methods.find(row=>row.id===id);
        if(!row||f.cart.id!==cartId||!MathBN.eq(row.amount,original))return {rows:[]};
        row.amount=cents/100;f.rawAmounts.set(id,JSON.parse(json));recalculate();return {rows:[{id}]};
      }
      if(sql.startsWith("update commerce.cart set updated_at")){assert.equal(values[0],f.cart.id);assert.equal(values[1],f.cart.customer_id);return {rows:[{id:f.cart.id}]};}
      assert.ok(sql.startsWith("update commerce.cart set metadata"));
      assert.equal(values[1],f.cart.id);assert.equal(values[2],f.cart.customer_id);
      f.cart.metadata={...f.cart.metadata};delete f.cart.metadata[values[0]];return {rows:[{id:f.cart.id}]};
    }
    return baseDb.raw(sql,values);
  };
  const db={raw,transaction:async callback=>{
    f.transactions++;f.onTransaction?.();
    const before=structuredClone(f.cart),rawBefore=new Map(f.rawAmounts),retiredBefore=structuredClone(f.retiredCollections);
    try{f.transactionDepth++;return await callback({raw,transaction:()=>assert.fail("No nested transaction needed")});}
    catch(error){f.cart=before;f.rawAmounts=rawBefore;f.retiredCollections=retiredBefore;throw error;}
    finally{f.transactionDepth--;}
  }};
  const locking={execute:async(key,callback,options)=>{
    f.locks.push({key,options});const controller=new AbortController();f.lockSignals.push(controller);
    return callback(controller.signal);
  }};
  f.scope={resolve:key=>key==="locking"?locking:key==="__pg_connection__"?db:baseScope.resolve(key)};
  return f;
}
async function normalize(f,actor=auth,id=f.cart.id,signals=[]){
  const before=process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try{process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";return await normalizeCartTaxMoney(f.scope,actor,id,signals);}
  finally{if(before===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=before;}
}

test("normalization source is a plan with no quote input or database write, while strict quoting rejects half cents",async()=>{
  const f=fixture(nativeCart(100,0.005,0));
  await assert.rejects(()=>read(f));
  const previous=process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try{process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";const result=await readCartTaxMoneySource(f.scope,auth,f.cart.id);assert.equal(result.discounts[0].discount_cents,1);assert.equal(result.shipping_cents,995);assert.ok(!Object.hasOwn(result,"input"));}
  finally{if(previous===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=previous;}
});
test("half-cent discount, exact native raw amounts and the 100-dollar shipping boundary change together",async()=>{
  const f=normalizationFixture();f.cart.metadata={...f.cart.metadata,unrelated:{keep:true},snowforce_tax_quote:{old:true}};
  f.cart.items[0].adjustments[0].promotion_id="promo_fixture";f.cart.items[0].adjustments[0].metadata={keep:"promotion context"};
  const result=await normalize(f);
  assert.deepEqual(result,{changed:true,adjustments_updated:1,retired_empty_collection:false,shipping_cents:995,merchandise_cents:9999});
  assert.equal(f.cart.items[0].adjustments[0].amount,0.01);assert.equal(f.cart.items[0].adjustments[0].promotion_id,"promo_fixture");assert.deepEqual(f.cart.items[0].adjustments[0].metadata,{keep:"promotion context"});
  assert.equal(f.cart.shipping_methods[0].amount,9.95);assert.deepEqual(f.rawAmounts.get("caliadj_fixture"),{value:"0.01",precision:20});assert.deepEqual(f.rawAmounts.get("casm_fixture"),{value:"9.95",precision:20});
  assert.deepEqual(f.cart.metadata.unrelated,{keep:true});assert.ok(!Object.hasOwn(f.cart.metadata,"snowforce_tax_quote"));
  assert.deepEqual(f.locks.map(row=>row.key),["snowforce-checkout:cart_fixture","cart_fixture"]);assert.equal(f.transactions,1);assert.equal(f.writes.length,3);
  const exact=await read(f);assert.equal(exact.input.shipping.amount_cents,995);assert.equal(exact.input.lines[0].discount_cents,1);
  const replay=await normalize(f);assert.equal(replay.changed,false);assert.equal(f.writes.length,3);
});
test("already exact carts are not rewritten, while a stale selected shipping amount uses the current saved policy",async()=>{
  for(const [price,discount,shipping,expectedShipping,changed] of [[110,10.01,9.95,995,false],[110,10,0,0,false],[100,0.004,9.95,0,true]]){
    const f=normalizationFixture(nativeCart(price,discount,shipping));const result=await normalize(f);assert.equal(result.shipping_cents,expectedShipping);assert.equal(result.changed,changed);
    if(!changed)assert.equal(f.writes.length,0);else{assert.equal(f.cart.items[0].adjustments[0].amount,0);assert.equal(f.cart.shipping_methods[0].amount,0);await read(f);}
  }
});
test("multiple fractional adjustments conserve one cent and keep their identities across a retry",async()=>{
  const cart=nativeCart(100,0.005,0),first=cart.items[0].adjustments[0];
  cart.items[0].adjustments=[{...first,id:"caliadj_B"},{...first,id:"caliadj_A"}];
  const f=normalizationFixture(JSON.parse(JSON.stringify(decorateCartTotals(cart))));
  const result=await normalize(f);
  assert.equal(result.adjustments_updated,2);assert.equal(result.merchandise_cents,9999);assert.equal(result.shipping_cents,995);
  assert.deepEqual(f.cart.items[0].adjustments.map(row=>[row.id,row.amount]),[["caliadj_B",0],["caliadj_A",0.01]]);
  await read(f);const writes=f.writes.length;assert.equal((await normalize(f)).changed,false);assert.equal(f.writes.length,writes);
});
test("a later write or conditional mismatch rolls back all earlier discount and shipping changes",async()=>{
  for(const mode of ["failWrite","emptyWrite"]){
    for(const stage of [1,2,3]){
      const f=normalizationFixture(),before=structuredClone(f.cart);f[mode]=stage;
      await assert.rejects(()=>normalize(f),error=>!error.message.includes("private-"));assert.deepEqual(f.cart,before);assert.equal(f.rawAmounts.size,0);
    }
  }
});
test("SQL ownership, completion, currency, region and native payment/order facts are checked before writing",async()=>{
  for(const kind of ["owner","complete","currency","region","order","session","payment","funds"]){
    const f=normalizationFixture();f.onTransaction=()=>{
      if(kind==="owner")f.cart.customer_id="cus_other";if(kind==="complete")f.cart.completed_at=new Date().toISOString();
      if(kind==="currency")f.cart.currency_code="cad";if(kind==="region")f.cart.region_id="reg_other";
      if(kind==="order")f.guards.has_order=true;if(kind==="session")f.guards.has_session=true;if(kind==="payment")f.guards.has_payment=true;
      if(kind==="funds")f.guards.has_collection_funds=true;
    };await assert.rejects(()=>normalize(f));assert.equal(f.writes.length,0);
  }
});
test("stale empty payment collection links retire atomically while native collection history remains",async()=>{
  const f=normalizationFixture();f.cart.payment_collection={id:"paycol_fixture",amount:f.cart.total,currency_code:"usd",payment_sessions:[]};
  const original=structuredClone(f.cart.payment_collection);
  const result=await normalize(f);assert.equal(result.retired_empty_collection,true);assert.equal(f.cart.payment_collection,null);assert.deepEqual(f.retiredCollections,[original]);assert.equal(f.writes.length,4);await read(f);
  for(const stage of [3,4]){
    const failed=normalizationFixture();failed.cart.payment_collection=structuredClone(original);const before=structuredClone(failed.cart);failed.failWrite=stage;
    await assert.rejects(()=>normalize(failed));assert.deepEqual(failed.cart,before);assert.deepEqual(failed.retiredCollections,[]);
  }
});
test("a stale empty collection on exact money retires without changing the quote or pending tax request",async()=>{
  const f=normalizationFixture(nativeCart());f.cart.payment_collection={id:"paycol_fixture",amount:1,currency_code:"usd",payment_sessions:[]};
  f.cart.metadata={...f.cart.metadata,snowforce_tax_quote:{keep:"unchanged monetary quote"}};f.pending=true;
  const metadata=structuredClone(f.cart.metadata),result=await normalize(f);
  assert.equal(result.changed,true);assert.equal(result.adjustments_updated,0);assert.equal(result.retired_empty_collection,true);
  assert.deepEqual(f.cart.metadata,metadata);assert.equal(f.writes.length,2);assert.equal(f.cart.payment_collection,null);await read(f);
});
test("cart, delivery, merchant and product review changes at transaction entry prevent writes",async()=>{
  for(const kind of ["price","address","shipping","configuration","classification","clock"]){
    const f=normalizationFixture();f.onTransaction=()=>{
      if(kind==="price")f.cart.items[0].unit_price=101;
      if(kind==="address")f.cart.shipping_address.postal_code="92618";
      if(kind==="shipping")f.option.prices[0].amount=12;
      if(kind==="configuration")f.metadata.snowforce_tax_configuration.active_revision=null;
      if(kind==="classification")f.metadata.snowforce_tax_classifications.prod_fixture.history[0].code.description="Changed review";
      if(kind==="clock")f.date=new Date(Date.now()+120000).toISOString();
    };await assert.rejects(()=>normalize(f));assert.equal(f.writes.length,0);
  }
});
test("pending provider requests stop monetary changes but an exact unchanged source is safe to reread",async()=>{
  const f=normalizationFixture();f.pending=true;await assert.rejects(()=>normalize(f));assert.equal(f.writes.length,0);
  const exact=normalizationFixture(nativeCart());exact.pending=true;assert.equal((await normalize(exact)).changed,false);assert.equal(exact.writes.length,0);
});
test("authentication, ID, release gate, inclusive adjustment and lease failures preserve all amounts",async()=>{
  const f=normalizationFixture();
  for(const actor of [undefined,{actor_type:"user",actor_id:"user_fixture"},{actor_type:"customer",actor_id:"user_fixture"}])await assert.rejects(()=>normalizeCartTaxMoney(f.scope,actor,f.cart.id));
  await assert.rejects(()=>normalize(f,auth,"cart_bad-id"));assert.equal(f.locks.length,0);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>normalize(f,auth,f.cart.id,[controller.signal]));assert.equal(f.locks.length,0);
  const before=process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try{delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;await assert.rejects(()=>normalizeCartTaxMoney(f.scope,auth,f.cart.id));}
  finally{if(before!==undefined)process.env.COMMERCE_TAX_POLICY_CONFIRMED=before;}
  f.cart.items[0].adjustments[0].is_tax_inclusive=true;await assert.rejects(()=>normalize(f));assert.equal(f.transactions,0);assert.equal(f.writes.length,0);
});
test("an expired native lease after one write causes the entire transaction to roll back",async()=>{
  const f=normalizationFixture(),before=structuredClone(f.cart),original=f.scope.resolve("__pg_connection__").raw;
  const db=f.scope.resolve("__pg_connection__");db.raw=async(...args)=>original(...args);
  const scope=f.scope,base=scope.resolve;
  const wrappedDb={raw:db.raw,transaction:callback=>db.transaction(async tx=>callback({raw:async(...args)=>{const result=await tx.raw(...args);if(args[0].startsWith("update commerce.cart_line_item_adjustment"))f.lockSignals[1].abort();return result;},transaction:tx.transaction}))};
  scope.resolve=key=>key==="__pg_connection__"?wrappedDb:base(key);
  await assert.rejects(()=>normalize(f));assert.deepEqual(f.cart,before);assert.equal(f.rawAmounts.size,0);
});
test("normalize API refuses browser money and returns only the reviewed amount change",async()=>{
  const f=normalizationFixture(),request={scope:f.scope,auth_context:auth,params:{id:f.cart.id},body:{}};
  for(const body of [{fee_cents:0},{california_permit_confirmed:true},{input:{}},null])await assert.rejects(()=>POST({...request,body},{json:()=>assert.fail("Invalid body cannot return success")}));
  assert.equal(f.locks.length,0);
  const previous=process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try{process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";let response;await POST(request,{json:value=>{response=value;}});assert.deepEqual(response,{status:"normalized",changed:true,adjustments_updated:1,retired_empty_collection:false,shipping_cents:995,merchandise_cents:9999,review_required:true});assert.ok(!JSON.stringify(response).includes("Fixture seller"));}
  finally{if(previous===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=previous;}
});
