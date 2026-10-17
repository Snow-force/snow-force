import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { attachTaxQuote, quoteCalculation, quoteInput, quoteSetup, taxNativeCart } from "./fixtures/tax-quote.mjs";
import { checkoutTaxRows } from "./fixtures/tax-classification.mjs";
import { taxConfigurationRows } from "./fixtures/tax-configuration.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const service=require("../src/lib/tax-quote-ledger.ts"), {checkoutCartSchema}=require("../src/lib/checkout-policy.ts");
process.env.JWT_SECRET="fixture-tax-ledger-signing-secret-at-least-32-characters";
const context={setup_fingerprint:quoteSetup.fingerprint,namespace:"f".repeat(64)};
function cart(){return checkoutCartSchema.parse({id:"cart_fixture",customer_id:"cus_fixture",currency_code:"usd",region_id:"reg_fixture",email:"fixture@example.test",completed_at:null,total:109.95,subtotal:100,tax_total:0,shipping_total:9.95,discount_total:0,item_total:100,item_tax_total:0,
  shipping_address:{first_name:"Fixture",last_name:"Rider",address_1:"1 Test Street",address_2:"",city:"Fixture city",province:"ca",postal_code:"92614",country_code:"us",phone:"5551234567"},
  shipping_methods:[{id:"casm_fixture",shipping_option_id:"so_fixture",name:"US standard",amount:9.95}],items:[{id:"cali_fixture",variant_id:"variant_fixture",product_handle:"fixture",product_title:"Fixture gear",title:"Fixture gear",variant_title:"M",thumbnail:null,quantity:1,unit_price:100,total:100}],payment_collection:null});}
function databaseFixture(){
  const value=cart(),input=quoteInput(value);let operation=null,snapshot=null,calculation=null,depth=0;
  const state={now:input.tax_date,owners:[{id:value.id}],inserts:0,failComplete:false};
  const db={transaction:async action=>{const old=[structuredClone(operation),structuredClone(snapshot),structuredClone(calculation),state.inserts];depth++;try{return await action(db);}catch(error){[operation,snapshot,calculation,state.inserts]=old;throw error;}finally{depth--;}}
    ,raw:async(sql,values=[])=>{
      assert.equal(depth,1);
      if(sql.startsWith("select id from commerce.cart"))return {rows:state.owners};
      if(sql.startsWith("select floor(extract"))return {rows:[{database_now:state.now}]};
      if(sql.startsWith("select id,input,"))return {rows:operation&&(!sql.includes("state='pending'")||operation.state==="pending")&&(!sql.includes("state='ready'")||operation.state==="ready"&&state.now+60<snapshot.expires_at)?[{...structuredClone(operation),database_now:state.now}]:[]};
      if(sql.startsWith("insert into commerce.snowforce_tax_operations")){state.inserts++;operation={id:values[0],input:JSON.parse(values[3]),setup_fingerprint:values[4],namespace:values[5],binding_fingerprint:values[6],request_fingerprint:values[7],request:JSON.parse(values[8]),state:"pending"};return {rows:[{...operation,database_now:state.now}]};}
      if(sql.startsWith("select snapshot"))return {rows:snapshot?[{snapshot}]:[]};
      if(sql.startsWith("select input,calculation,snapshot"))return {rows:snapshot?[{input:operation.input,calculation,snapshot}]:[]};
      if(sql.startsWith("insert into commerce.snowforce_tax_quotes")){assert.equal(snapshot,null);calculation=JSON.parse(values.at(-2));snapshot=JSON.parse(values.at(-1));return {rows:[]};}
      if(sql.startsWith("update commerce.snowforce_tax_operations")){if(state.failComplete)return {rows:[]};operation.state="ready";return {rows:[{id:operation.id}]};}
      assert.fail(`Unexpected statement: ${sql.split(" ").slice(0,4).join(" ")}`);
    }};
  return {value,input,state,db,scope:{resolve:key=>{assert.equal(key,"__pg_connection__");return db;}},get operation(){return operation;},get snapshot(){return snapshot;}};
}
test("private request is reserved once and retry keeps original date, body and permanent identity",async()=>{
  const f=databaseFixture(), first=await service.reserveTaxQuote(f.scope,f.input,context);
  f.state.now+=10;const second=await service.reserveTaxQuote(f.scope,{...f.input,tax_date:f.input.tax_date+10},context);
  assert.equal(second.id,first.id);assert.equal(second.input.tax_date,first.input.tax_date);assert.deepEqual(second.request,first.request);assert.equal(f.state.inserts,1);
});

test("only immutable draft evidence permits importing an older exact calculation date",async()=>{
  const f=databaseFixture(),calculation=quoteCalculation(f.input),quote=require("../src/lib/tax-quote-money.ts").normalizeStripeTaxQuote(f.input,calculation,f.input.tax_date),previewId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  f.state.now+=120;
  const input={...f.input,cart_fingerprint:"b".repeat(64),shipping:{...f.input.shipping,id:"casm_persisted"}};
  await assert.rejects(service.reserveTaxQuote(f.scope,input,context));assert.equal(f.state.inserts,0);
  const row={input:f.input,calculation,snapshot:quote,...context,state:"ready"};
  const scope={resolve:key=>{assert.equal(key,"__pg_connection__");return {transaction:work=>f.db.transaction(tx=>work({raw:async(sql,values)=>sql.includes("from commerce.snowforce_checkout_quote_drafts")?{rows:values[0]===previewId?[structuredClone(row)]:[]}:tx.raw(sql,values)}))};}};
  const operation=await service.reserveTaxQuote(scope,input,context,previewId);assert.equal(operation.input.tax_date,f.input.tax_date);assert.equal(f.state.inserts,1);assert.equal(operation.input.shipping.id,"casm_persisted");assert.equal(operation.importedPreview,true);
  const retry=await service.reserveTaxQuote(scope,input,context,previewId);assert.equal(retry.id,operation.id);assert.ok(!("importedPreview" in retry),"an existing pending operation must resume its original provider identity");
  await service.recordTaxQuote(scope,operation.id,calculation,context);
  const completed=await service.reserveTaxQuote(scope,input,context,previewId);assert.equal(completed.id,operation.id);assert.ok(!("importedPreview" in completed),"an existing completed calculation must remain immutable");
});

test("import refuses fabricated, expired or semantically changed preview evidence before reserving native work",async()=>{
  for(const kind of ["missing","setup","namespace","snapshot","variant","net-discount","expired"]){
    const f=databaseFixture(),calculation=quoteCalculation(f.input),quote=require("../src/lib/tax-quote-money.ts").normalizeStripeTaxQuote(f.input,calculation,f.input.tax_date),row={input:structuredClone(f.input),calculation,snapshot:structuredClone(quote),...context,state:"ready"},input=structuredClone(f.input);f.state.now+=120;
    if(kind==="setup")row.setup_fingerprint="b".repeat(64);if(kind==="namespace")row.namespace="b".repeat(64);if(kind==="snapshot")row.snapshot.amounts.total_cents++;if(kind==="variant")input.lines[0].variant_id="variant_other";if(kind==="net-discount"){input.lines[0].unit_price_cents++;input.lines[0].discount_cents++;}if(kind==="expired")f.state.now=f.input.tax_date+850;
    const scope={resolve:()=>({transaction:work=>f.db.transaction(tx=>work({raw:async(sql,values)=>sql.includes("from commerce.snowforce_checkout_quote_drafts")?{rows:kind==="missing"?[]:[row]}:tx.raw(sql,values)}))})};
    await assert.rejects(service.reserveTaxQuote(scope,input,context,"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));assert.equal(f.state.inserts,0,kind);
  }
});
const reordered=value=>Array.isArray(value)?value.map(reordered):value!==null&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,entry])=>[key,reordered(entry)])):value;
test("PostgreSQL JSONB object-key order cannot change request, immutable snapshot or receipt identity",async()=>{
  const f=databaseFixture(),op=await service.reserveTaxQuote(f.scope,f.input,context);f.operation.request=reordered(f.operation.request);
  assert.equal((await service.reserveTaxQuote(f.scope,f.input,context)).id,op.id);
  const calculation=quoteCalculation(f.input);await service.recordTaxQuote(f.scope,op.id,calculation,context);
  const raw=f.db.raw;f.db.raw=async(sql,values)=>{const result=await raw(sql,values);return sql.startsWith("select snapshot")?{rows:result.rows.map(row=>reordered(row))}:result;};
  await service.recordTaxQuote(f.scope,op.id,reordered(calculation),context);
  const proof=proofFixture();proof.proof.snapshot=reordered(proof.proof.snapshot);proof.proof.receipt=reordered(proof.proof.receipt);await proof.assert();
});
test("unresolved requests cannot be overwritten by a changed cart, setup, key namespace or expired replay",async()=>{
  for(const changed of ["cart","setup","namespace","expired","backward","corrupted"]){const f=databaseFixture();await service.reserveTaxQuote(f.scope,f.input,context);let input=f.input,ctx=context;
    if(changed==="cart")input={...input,shipping:{...input.shipping,amount_cents:1}};
    if(changed==="setup")ctx={...ctx,setup_fingerprint:"a".repeat(64)};
    if(changed==="namespace")ctx={...ctx,namespace:"a".repeat(64)};
    if(changed==="expired")f.state.now+=900;if(changed==="backward")f.state.now--;
    if(changed==="corrupted")f.operation.request.currency="eur";
    await assert.rejects(()=>service.reserveTaxQuote(f.scope,input,ctx));assert.equal(f.state.inserts,1);
  }
});
test("missing owners, unconfirmed source and old/future initial dates never reserve a request",async()=>{
  for(const kind of ["owner","permit","old","future"]){const f=databaseFixture();let input=f.input;
    if(kind==="owner")f.state.owners=[];if(kind==="permit")input={...input,california_permit_confirmed:false};
    if(kind==="old")f.state.now+=11;if(kind==="future")f.state.now--;
    await assert.rejects(()=>service.reserveTaxQuote(f.scope,input,context));assert.equal(f.state.inserts,0);
  }
});
test("calculation is validated, persisted atomically and immutable exact replay works after expiry",async()=>{
  const f=databaseFixture(),op=await service.reserveTaxQuote(f.scope,f.input,context),calculation=quoteCalculation(f.input);
  const quote=await service.recordTaxQuote(f.scope,op.id,calculation,context);assert.equal(f.operation.state,"ready");assert.deepEqual(f.snapshot,quote);
  f.state.now+=86400;assert.deepEqual(await service.recordTaxQuote(f.scope,op.id,calculation,context),quote);
  await assert.rejects(()=>service.recordTaxQuote(f.scope,op.id,{...calculation,id:"taxcalc_replacement"},context));
});

test("completed quote reservation and result reuse preserve identity without another provider request",async()=>{
  const f=databaseFixture(),op=await service.reserveTaxQuote(f.scope,f.input,context),calculation=quoteCalculation(f.input);
  const quote=await service.recordTaxQuote(f.scope,op.id,calculation,context);
  f.state.now+=10;
  const reused=await service.reserveTaxQuote(f.scope,{...f.input,tax_date:f.state.now},context);
  assert.equal(reused.id,op.id);assert.equal(reused.state,"ready");assert.equal(f.state.inserts,1);
  assert.deepEqual(await service.readRecordedTaxQuote(f.scope,reused.id,context),quote);
  const scope={resolve:()=>({transaction:async action=>action({raw:async(sql,values)=>{
    const result=await f.db.transaction(db=>db.raw(sql,values));
    if(sql.startsWith("select input,calculation,snapshot"))return {rows:result.rows.map(row=>({...row,snapshot:{...row.snapshot,amounts:{...row.snapshot.amounts,total_cents:1}}}))};
    return result;
  }})})};
  await assert.rejects(()=>service.readRecordedTaxQuote(scope,op.id,context));
  await assert.rejects(()=>service.readRecordedTaxQuote(f.scope,op.id,{...context,namespace:"a".repeat(64)}));
  f.state.now=quote.expires_at;await assert.rejects(()=>service.readRecordedTaxQuote(f.scope,op.id,context));
});

test("changed context, source or near-expired ready quote reserves a new operation but unresolved ones never do",async()=>{
  for(const kind of ["source","context","near_expiry"]){
    const f=databaseFixture(),first=await service.reserveTaxQuote(f.scope,f.input,context);
    await service.recordTaxQuote(f.scope,first.id,quoteCalculation(f.input),context);
    let input=f.input,ctx=context;
    if(kind==="source")input={...input,shipping:{...input.shipping,amount_cents:1}};
    if(kind==="context")ctx={...context,namespace:"a".repeat(64)};
    if(kind==="near_expiry"){f.state.now+=840;input={...input,tax_date:f.state.now};}
    const next=await service.reserveTaxQuote(f.scope,input,ctx);
    assert.notEqual(next.id,first.id);assert.equal(next.state,"pending");assert.equal(f.state.inserts,2);
  }
});
test("provider money, mode, context, missing operation and failed final update cannot leave a partial quote",async()=>{
  for(const kind of ["money","mode","context","operation","update","expired"]){const f=databaseFixture(),op=await service.reserveTaxQuote(f.scope,f.input,context);let calculation=quoteCalculation(f.input),ctx=context;
    if(kind==="money")calculation.amount_total++;if(kind==="mode")calculation.livemode=true;
    if(kind==="context")ctx={...ctx,namespace:"a".repeat(64)};if(kind==="update")f.state.failComplete=true;
    if(kind==="expired")f.state.now+=900;
    if(kind==="operation"){const raw=f.db.raw;f.db.raw=async(sql,values)=>sql.startsWith("select id,input,")?{rows:[]}:raw(sql,values);}
    await assert.rejects(()=>service.recordTaxQuote(f.scope,op.id,calculation,ctx));assert.equal(f.snapshot,null);assert.equal(f.operation.state,"pending");
  }
});
function proofFixture(){const value=cart(),proof=attachTaxQuote(value),state={rows:[proof],native:null,classification:null};
  const scope={resolve:key=>key==="query"?{graph:async()=>({data:[state.native??taxNativeCart(value)]})}:key==="__pg_connection__"?{raw:async sql=>({rows:sql.includes("from commerce.snowforce_tax_quotes q join")?state.rows:taxConfigurationRows(sql)??state.classification?.(sql)??checkoutTaxRows(sql,value)})}:assert.fail("Unexpected dependency")};
  return {value,proof,state,scope,assert:(purpose="review",setup=quoteSetup)=>service.assertPersistedCartTaxQuote(value,scope,setup,purpose)};
}
test("payment proof requires both authentic private application evidence and exact native line amounts",async()=>{
  const f=proofFixture();assert.equal((await f.assert()).quote.amounts.total_cents,10995);
  assert.equal((await f.assert("create_payment")).receipt.quote_id,f.proof.id);
  assert.ok(!JSON.stringify(f.value.metadata).includes("ship_from_address"));
});
test("customer tags, receipt forgery, stolen identity, missing rows and corrupted snapshots fail closed",async()=>{
  for(const kind of ["missing","unsigned","forged","customer","cart","row","duplicate","snapshot","operation"]){const f=proofFixture();
    if(kind==="missing")f.value.metadata=null;if(kind==="unsigned")delete f.value.metadata[service.taxQuoteReceiptKey].signature;
    if(kind==="forged")f.value.metadata[service.taxQuoteReceiptKey].total_cents++;
    if(kind==="customer")f.value.customer_id="cus_other";if(kind==="cart")f.value.id="cart_other";
    if(kind==="row")f.state.rows=[];if(kind==="duplicate")f.state.rows.push(f.proof);
    if(kind==="snapshot")f.proof.snapshot.amounts.total_cents++;if(kind==="operation")f.proof.operation_state="pending";
    await assert.rejects(()=>f.assert(),/verified, current tax quote/);
  }
});
test("same total cannot hide changed line tax, discount, quantities or a different native source",async()=>{
  for(const mutate of [n=>{n.items[0].tax_total=.01;},n=>{n.items[0].discount_subtotal=.01;},n=>{n.items[0].quantity=2;},n=>{n.shipping_methods[0].tax_total=.01;},n=>{n.metadata={};},n=>{n.items[0].variant_id="variant_other";}]){const f=proofFixture();f.state.native=taxNativeCart(f.value);mutate(f.state.native);await assert.rejects(()=>f.assert());}
});
test("configuration/account/mode drift and current product review replacing the quote's classification reject",async()=>{
  for(const patch of [{fingerprint:"a".repeat(64)},{account_id:"acct_other"},{livemode:true},{api_ready:false},{collecting_states:["CA","NY"]}]){const f=proofFixture();await assert.rejects(()=>f.assert("review",{...quoteSetup,...patch}));}
  const f=proofFixture();f.state.classification=sql=>{const rows=checkoutTaxRows(sql,f.value);if(sql.includes("as settings"))rows[0].settings.prod_fixture.history[0].code.description="Changed official classification";return rows;};await assert.rejects(()=>f.assert());
});
function boundPayment(f){const receipt=f.proof.receipt,at=f.proof.input.tax_date;
  const data={id:"pi_fixture",amount:receipt.total_cents,currency:"usd",livemode:false,metadata:{session_id:"payses_fixture"}};
  f.proof.payment_session_id="payses_fixture";f.proof.bound_at=at;
  f.proof.payment={id:"payses_fixture",collection_id:"paycol_fixture",provider_id:"pp_stripe_stripe",currency_code:"usd",amount:109.95,status:"authorized",created_at:at,data,metadata:{snowforce_payment_creation:{cart_id:f.value.id,customer_id:f.value.customer_id,quote:receipt.checkout_fingerprint,livemode:false}}};
  f.value.payment_collection={id:"paycol_fixture",amount:109.95,currency_code:"usd",payment_sessions:[{id:"payses_fixture",provider_id:"pp_stripe_stripe",currency_code:"usd",amount:109.95,status:"authorized",data}]};
}
test("expired quotes cannot initialize/retry provider creation; bound existing payment can complete",async()=>{
  const f=proofFixture();f.proof.database_now=f.proof.snapshot.expires_at;
  await assert.rejects(()=>f.assert());boundPayment(f);await f.assert("complete");await f.assert("review");await assert.rejects(()=>f.assert("create_payment"));
});
test("expired completion rejects late, foreign, ambiguous, canceled and financially different payment bindings",async()=>{
  for(const mutate of [f=>{f.proof.bound_at=f.proof.snapshot.expires_at;},f=>{f.proof.payment.created_at++;},f=>{f.proof.payment.data={snowforce_payment_creation_pending:true};},f=>{f.proof.payment.amount=1;},f=>{f.proof.payment.data.livemode=true;},f=>{f.proof.payment.metadata.snowforce_payment_creation.quote="a".repeat(64);},f=>{f.proof.payment.status="canceled";},f=>{f.value.payment_collection.id="paycol_other";},f=>{f.value.payment_collection.payment_sessions.push({...f.value.payment_collection.payment_sessions[0],id:"payses_other"});}]){const f=proofFixture();boundPayment(f);f.proof.database_now=f.proof.snapshot.expires_at;mutate(f);await assert.rejects(()=>f.assert("complete"));}
});
test("payment binding is conditional, fresh and records only the existing native session",async()=>{
  const f=proofFixture();let calls=0;
  const db={raw:async(sql,values)=>{calls++;assert.ok(sql.includes("clock_timestamp()<to_timestamp(q.expires_at)"));assert.ok(sql.includes("payment_session_id is null or payment_session_id=?"));assert.equal(values[0],"payses_fixture");return {rows:[{quote_id:f.proof.id}]};}};
  await service.bindTaxQuotePayment(db,f.proof.receipt,"payses_fixture");assert.equal(calls,1);
  await assert.rejects(()=>service.bindTaxQuotePayment({raw:async()=>({rows:[]})},f.proof.receipt,"payses_other"));
});
test("short signing secret and foreign cart/amount cannot produce a tax receipt",()=>{
  const f=proofFixture();assert.throws(()=>service.sealTaxQuoteReceipt(f.proof.id,f.proof.snapshot,quoteSetup.fingerprint,{...f.value,total:1},taxNativeCart(f.value)));
  assert.throws(()=>service.sealTaxQuoteReceipt(f.proof.id,f.proof.snapshot,quoteSetup.fingerprint,{...f.value,customer_id:"cus_other"},taxNativeCart(f.value)));
  assert.throws(()=>service.sealTaxQuoteReceipt(f.proof.id,f.proof.snapshot,quoteSetup.fingerprint,f.value,{...taxNativeCart(f.value),total:1}));
  assert.throws(()=>service.sealTaxQuoteReceipt(f.proof.id,f.proof.snapshot,quoteSetup.fingerprint,f.value,undefined));
  const old=process.env.JWT_SECRET;try{process.env.JWT_SECRET="short";assert.throws(()=>service.sealTaxQuoteReceipt(f.proof.id,f.proof.snapshot,quoteSetup.fingerprint,f.value,taxNativeCart(f.value)));}finally{process.env.JWT_SECRET=old;}
});
test("native order creation must copy the same signed tax receipt from the initial workflow cart",()=>{
  const f=proofFixture(),original={...f.value,customer:{id:f.value.customer_id},region:{id:f.value.region_id}};
  service.assertWorkflowTaxQuoteSnapshot(original,f.value);
  for(const initial of [{...original,metadata:{}},{...original,customer:{id:"cus_other"}},{...original,total:1}])assert.throws(()=>service.assertWorkflowTaxQuoteSnapshot(initial,f.value));
});
test("unbound, replaced and ambiguous current sessions fail even while the quote is fresh",async()=>{
  for(const mutate of [f=>{f.proof.payment_session_id=null;},f=>{f.proof.payment.data={};},f=>{f.proof.payment.collection_id="paycol_other";},f=>{f.proof.payment.created_at++;}]){const f=proofFixture();boundPayment(f);mutate(f);await assert.rejects(()=>f.assert());}
});
test("migration has private RLS tables, immutable evidence and exclusive pending request index",()=>{
  const dir=new URL("../../../supabase/migrations/",import.meta.url),files=readdirSync(dir).filter(name=>/^\d{14}_shop_tax_quote_ledger\.sql$/.test(name));assert.equal(files.length,1);
  const sql=readFileSync(new URL(files[0],dir),"utf8");for(const name of ["snowforce_tax_operations","snowforce_tax_quotes","snowforce_tax_quote_applications"]){assert.ok(sql.includes(`alter table commerce.${name} enable row level security`));assert.ok(sql.includes(`alter table commerce.${name} owner to snowforce_commerce`));assert.ok(sql.includes(`before update or delete on commerce.${name}`));}
  assert.ok(sql.includes("where state='pending'"));assert.ok(sql.includes("security invoker set search_path=''"));assert.ok(sql.includes("from public,anon,authenticated,service_role"));assert.ok(!/security definer|create policy|grant .* to (anon|authenticated|service_role)/i.test(sql));
});
