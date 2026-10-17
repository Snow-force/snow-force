import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {nativeCart} from "./fixtures/tax-source.mjs";
import {quoteInput,quoteCalculation,quoteSetup} from "./fixtures/tax-quote.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {collectDraftTaxQuote,readDraftTaxQuote}=require("../src/lib/checkout-draft-ledger.ts");
const context={setup_fingerprint:quoteSetup.fingerprint,namespace:"f".repeat(64)};
async function enabled(action){const old=process.env.COMMERCE_TAX_POLICY_CONFIRMED;try{process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";return await action();}finally{if(old===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=old;}}
function fixture(){
 const f={input:quoteInput(nativeCart(100,0,9.95)),rows:new Map(),imported:new Set(),calls:[],keys:[],owner:true,depth:0,quota:0,failPost:false,failRecord:false,onPost:null};f.now=f.input.tax_date;
 const db={transaction:async work=>{const before=structuredClone(f.rows);f.depth++;try{return await work(db);}catch(e){f.rows=before;throw e;}finally{f.depth--;}},raw:async(sql,values=[])=>{
  if(sql.startsWith("select id from commerce.cart"))return {rows:f.owner?[{id:f.input.cart_id}]:[]};
  if(sql.startsWith("select count(*)"))return {rows:[{recent:f.quota}]};
  if(sql.startsWith("insert into commerce.snowforce_checkout_quote_drafts")){assert.equal(f.depth,1);const row={id:values[0],cart_id:values[1],customer_id:values[2],input:JSON.parse(values[3]),setup_fingerprint:values[4],namespace:values[5],binding_fingerprint:values[6],expires_at:values[7],state:"pending",calculation:null,snapshot:null};f.rows.set(row.id,row);return {rows:[{...structuredClone(row),database_now:f.now}]};}
  if(sql.startsWith("select *,floor")){let rows=[...f.rows.values()];if(sql.includes("not exists(select 1 from commerce.snowforce_tax_quotes"))rows=rows.filter(row=>!f.imported.has(row.calculation?.id));if(sql.includes("binding_fingerprint=?"))rows=rows.filter(row=>row.cart_id===values[0]&&row.customer_id===values[1]&&row.binding_fingerprint===values[2]&&row.setup_fingerprint===values[3]&&row.namespace===values[4]&&row.expires_at>f.now+60).slice(-1);else{rows=rows.filter(row=>row.id===values[0]);if(values.length===3)rows=rows.filter(row=>row.cart_id===values[1]&&row.customer_id===values[2]);}return {rows:rows.map(row=>({...structuredClone(row),database_now:f.now}))};}
  if(sql.startsWith("update commerce.snowforce_checkout_quote_drafts")){assert.equal(f.depth,1);if(f.failRecord)throw Error("record unavailable");const row=f.rows.get(values[3]);if(!row||row.state!=="pending")return {rows:[]};Object.assign(row,{state:"ready",calculation:JSON.parse(values[0]),snapshot:JSON.parse(values[1]),expires_at:values[2]});return {rows:[{id:row.id}]};}
  assert.fail("Unexpected/native write: "+sql.slice(0,70));
 }};
 const calculation=()=>{const row=[...f.rows.values()].at(-1),value=quoteCalculation(row.input);value.id='taxcalc_'+row.id.replaceAll('-','');value.line_items={...value.line_items,object:"list",url:`/v1/tax/calculations/${value.id}/line_items`,data:value.line_items.data.map(row=>({...row,object:"tax.calculation_line_item"}))};return value;};
 f.writer={livemode:false,namespace:context.namespace,account:()=>assert.fail("A verified source already checked identity"),createCalculation:async(request,key)=>{assert.equal(f.depth,0);f.calls.push(request);f.keys.push(key);f.onPost?.();if(f.failPost)throw Error("provider unknown");return calculation();},listLineItems:async()=>{assert.equal(f.depth,0);return calculation().line_items;}};
 f.scope={resolve:key=>{assert.equal(key,"__pg_connection__");return db;}};f.collect=signals=>collectDraftTaxQuote(f.scope,f.input,context.setup_fingerprint,f.writer,signals);f.read=(id,cart=f.input.cart_id,customer=f.input.customer_id,ctx=context)=>readDraftTaxQuote(f.scope,id,cart,customer,ctx);return f;
}
test("draft calculation persists isolated evidence, validates all lines and reuses an exact result",()=>enabled(async()=>{
 const f=fixture(),first=await f.collect(),again=await f.collect();assert.equal(first.quote.amounts.total_cents,10995);assert.equal(again.id,first.id);assert.equal(f.calls.length,1);assert.equal(f.rows.size,1);assert.equal([...f.rows.values()][0].state,"ready");
}));
test("returning to an already imported draft obtains new evidence and cannot import the same calculation twice",()=>enabled(async()=>{
 const f=fixture(),first=await f.collect(),original=structuredClone(f.rows.get(first.id));f.imported.add(first.quote.calculation_id);await assert.rejects(f.read(first.id));const next=await f.collect();assert.notEqual(next.id,first.id);assert.notEqual(next.quote.calculation_id,first.quote.calculation_id);assert.equal(next.quote.amounts.total_cents,first.quote.amounts.total_cents);assert.equal(f.calls.length,2);assert.deepEqual(f.rows.get(first.id),original);assert.equal((await f.collect()).id,next.id);assert.equal(f.calls.length,2);
}));
test("ambiguous preview POST preserves input and the same idempotency key without native pending evidence",()=>enabled(async()=>{
 const f=fixture();f.failPost=true;await assert.rejects(f.collect());const input=structuredClone([...f.rows.values()][0].input);f.now+=2;f.input.tax_date=f.now;f.failPost=false;await f.collect();assert.equal(f.rows.size,1);assert.equal(f.keys[0],f.keys[1]);assert.deepEqual([...f.rows.values()][0].input,input);
}));
test("a different draft can proceed after an earlier estimate becomes ambiguous",()=>enabled(async()=>{
 const f=fixture();f.failPost=true;await assert.rejects(f.collect());f.input.shipping_address.line2="Newest draft";f.failPost=false;await f.collect();assert.equal(f.rows.size,2);assert.deepEqual([...f.rows.values()].map(row=>row.state),["pending","ready"]);assert.notEqual(f.keys[0],f.keys[1]);
}));
test("recording failure leaves pending evidence and retry reuses the original request",()=>enabled(async()=>{
 const f=fixture();f.failRecord=true;await assert.rejects(f.collect());assert.equal([...f.rows.values()][0].state,"pending");f.failRecord=false;await f.collect();assert.equal(f.rows.size,1);assert.equal(f.keys[0],f.keys[1]);
}));
test("draft result rejects another owner, namespace, setup, altered evidence and near expiry",()=>enabled(async()=>{
 const f=fixture(),first=await f.collect();await assert.rejects(f.read(first.id,"cart_other"));await assert.rejects(f.read(first.id,f.input.cart_id,"cus_other"));
 for(const change of [{namespace:"a".repeat(64)},{setup_fingerprint:"a".repeat(64)}])await assert.rejects(f.read(first.id,f.input.cart_id,f.input.customer_id,{...context,...change}));
 const row=f.rows.get(first.id),saved=structuredClone(row.snapshot);row.snapshot.amounts.total_cents=1;await assert.rejects(f.read(first.id));row.snapshot=saved;f.now=row.expires_at-60;await assert.rejects(f.read(first.id));
}));
test("new estimate budget does not block reuse of a valid exact quote",()=>enabled(async()=>{
 const f=fixture(),first=await f.collect();f.quota=20;assert.equal((await f.collect()).id,first.id);f.input.shipping_address.line2="Changed";await assert.rejects(f.collect());assert.equal(f.calls.length,1);assert.equal(f.rows.size,1);
}));
test("owner, mode and interruption fail before calculation and retain no native writes",()=>enabled(async()=>{
 const f=fixture();f.owner=false;await assert.rejects(f.collect());assert.equal(f.calls.length,0);f.owner=true;f.writer.livemode=true;await assert.rejects(f.collect());f.writer.livemode=false;const controller=new AbortController();controller.abort();await assert.rejects(f.collect([controller.signal]));assert.equal(f.rows.size,0);
 const g=fixture(),stop=new AbortController();g.onPost=()=>stop.abort();await assert.rejects(g.collect([stop.signal]));assert.equal([...g.rows.values()][0].state,"pending");
}));
