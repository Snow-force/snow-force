import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {refundOutboxFixture} from "./fixtures/tax-refund-outbox.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const admin=require("../src/lib/refund-admin.ts");
const route=require("../src/api/admin/snowforce/after-sales/[id]/refunds/route.ts");
const auth={actor_type:"user",actor_id:"user_fixture"};
const {bindRefundOrderLines}=require("../src/lib/tax-refund-contract.ts");
function processingFixture(){
  const f=refundOutboxFixture(),original=f.db;
  f.case={id:f.reservation.case_id,order_id:f.reservation.order_id,version:f.reservation.case_version,kind:"return",status:"processing",native_id:f.reservation.native_return_id};
  f.rows=[f.reservation];f.receipts=f.reservation.source_data.order_lines.map(line=>({item_id:line.id,received_quantity:3,raw_received_quantity:{value:3}}));
  f.source={sale:f.sale,order_lines:f.reservation.source_data.order_lines,bindings:bindRefundOrderLines(f.sale,f.reservation.source_data.order_lines)};
  const db={...original,transaction:action=>original.transaction(()=>action(db)),raw:async(sql,values)=>{
    if(sql.startsWith('select id from commerce."user"')){assert.equal(values[0],auth.actor_id);return{rows:[{id:auth.actor_id}]};}
    if(sql.startsWith("select id,order_id,version"))return{rows:[f.case]};
    if(sql.includes("from commerce.snowforce_refund_allocations where order_id="))return{rows:f.rows};
    if(sql.startsWith("select item_id,received_quantity"))return{rows:f.receipts};
    if(sql.startsWith("select return_id")){assert.ok(sql.includes("canceled_at is null and deleted_at is null"));return{rows:f.exchangeMissing?[]:[{return_id:f.reservation.native_return_id}]};}
    return original.raw(sql,values);
  }};
  f.scope={resolve:()=>db};f.readSource=async()=>f.source;return f;
}
test("refund preview rejects non-staff and malformed cases before database or provider access",async()=>{
  const scope={resolve:()=>assert.fail()};
  for(const a of [undefined,{actor_type:"customer",actor_id:"cus_fixture"}]){
    await assert.rejects(()=>admin.adminRefundPlans(scope,a,"123e4567-e89b-42d3-a456-426614174099"));
    await assert.rejects(()=>admin.prepareAdminRefund(scope,a,"123e4567-e89b-42d3-a456-426614174099",{}));
  }
  await assert.rejects(()=>admin.adminRefundPlans(scope,auth,"bad"));
});
test("preparation accepts only reviewed quantity decisions, never client amounts, success flags or private source evidence",async()=>{
  const f=refundOutboxFixture(),scope={resolve:()=>assert.fail()};
  for(const body of [{operation_id:f.reservation.id,version:3,input:{...f.input,amount:1}},
    {operation_id:f.reservation.id,version:3,input:f.input,status:"succeeded"},{operation_id:f.reservation.id,version:3,input:f.input,source:f.sale}])
    await assert.rejects(()=>admin.prepareAdminRefund(scope,auth,f.reservation.case_id,body));
});
test("safe refund projection includes original per-line cents and excludes customer/address/payment source and snapshots",()=>{
  const f=refundOutboxFixture(),plan=admin.safeRefundReservation(f.reservation);
  assert.equal(plan.total_cents,1052);assert.equal(plan.items[0].net_cents,1000);assert.equal(plan.items[0].sales_tax_cents,52);
  for(const key of ["source_data","request","snapshot","account_id","payment_id","staff_id","source_fingerprint"])assert.equal(key in plan,false);
  const serialized=JSON.stringify(plan);assert.ok(!serialized.includes(f.sale.source.intent_id));assert.ok(!serialized.includes(f.sale.source.input.shipping_address.line1));
});
test("terminal cases expose only existing safe plans and never attempt a new source or Stripe read",async()=>{
  const f=refundOutboxFixture(),db={raw:async(sql)=>{if(sql.startsWith("select id,order_id"))return{rows:[{id:f.reservation.case_id,order_id:f.reservation.order_id,version:4,kind:"return",status:"completed",native_id:"return_fixture"}]};
    assert.ok(sql.includes("from commerce.snowforce_refund_allocations"));return{rows:[f.reservation]};}};
  const result=await admin.adminRefundPlans({resolve:()=>db},auth,f.reservation.case_id);
  assert.equal(result.can_prepare,false);assert.equal(result.execution_enabled,false);assert.equal(result.plans.length,1);assert.equal(result.items.length,0);
});
test("server case version conflicts prevent source reads and reservation writes",async()=>{
  const f=refundOutboxFixture(),db={raw:async sql=>{assert.ok(sql.startsWith("select id,order_id"));return{rows:[{id:f.reservation.case_id,order_id:f.reservation.order_id,version:4,kind:"return",status:"processing",native_id:"return_fixture"}]};}};
  await assert.rejects(()=>admin.prepareAdminRefund({resolve:()=>db},auth,f.reservation.case_id,{operation_id:f.reservation.id,version:3,input:f.input}),/review changed/);
});
test("preview endpoints are authenticated and private/no-store, and do not invoke the financial executor",async()=>{
  let header;const res={setHeader:(key,value)=>header=[key,value],json:()=>assert.fail()};
  await assert.rejects(()=>route.GET({auth_context:undefined,params:{id:"bad"},scope:{resolve:()=>assert.fail()}},res));
  assert.deepEqual(header,["Cache-Control","private, no-store"]);
  const source=readFileSync(new URL("../src/api/admin/snowforce/after-sales/[id]/refunds/route.ts",import.meta.url),"utf8");
  assert.ok(!source.includes("processRefundExecution"));assert.ok(!source.includes("createRefund"));
});
test("processing preview subtracts active allocations from original and received quantities, including exchanges",async()=>{
  for(const exchange of [false,true]){
    const f=processingFixture();if(exchange){f.case.kind="exchange";f.case.native_id="oexc_fixture";}
    const result=await admin.adminRefundPlans(f.scope,auth,f.reservation.case_id,f.readSource);
    assert.equal(result.can_prepare,true);assert.equal(result.execution_enabled,false);
    const selected=result.items.find(line=>line.item_id===f.reservation.input.items[0].item_id);assert.equal(selected.available_quantity,2);
    f.receipts.find(line=>line.item_id===selected.item_id).received_quantity=1;f.receipts.find(line=>line.item_id===selected.item_id).raw_received_quantity.value=1;
    const constrained=await admin.adminRefundPlans(f.scope,auth,f.reservation.case_id,f.readSource);assert.ok(!constrained.items.some(line=>line.item_id===selected.item_id));
  }
});
test("malformed raw receipts, duplicates and missing exchange associations reject preview",async()=>{
  for(const change of [f=>f.receipts[0].raw_received_quantity.value=0,f=>f.receipts.push(f.receipts[0]),f=>{f.case.kind="exchange";f.case.native_id="oexc_fixture";f.exchangeMissing=true;},f=>f.case.native_id=null]){
    const f=processingFixture();change(f);await assert.rejects(()=>admin.adminRefundPlans(f.scope,auth,f.reservation.case_id,f.readSource));
  }
});
test("preparing an identical stored plan recovers its reviewed original amount without recomputing prices or invoking Stripe",async()=>{
  const f=processingFixture(),result=await admin.prepareAdminRefund(f.scope,auth,f.reservation.case_id,{operation_id:f.reservation.id,version:f.case.version,input:f.reservation.input},async()=>assert.fail("Existing immutable plan should recover"));
  assert.equal(result.plan.total_cents,1052);assert.equal(result.plan.state,"started");assert.equal(result.execution_enabled,false);assert.equal(f.posts.length,0);
});
