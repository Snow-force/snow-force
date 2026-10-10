import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {completedRefundFixture} from "./fixtures/completed-refund.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {assertAfterSalesRefundCompletion}=require("../src/lib/after-sales-refund-completion.ts");
const {checkedRefundSale}=require("../src/lib/tax-refund-contract.ts");
async function fixture(){
  const f=await completedRefundFixture();
  f.case={id:f.reservation.case_id,order_id:f.reservation.order_id,kind:"return",status:"processing",version:4,
    native_id:f.reservation.native_return_id,items:f.input.items.map(line=>({id:line.item_id,quantity:line.quantity}))};
  f.check={order_id:f.case.order_id,state:"verified",payments:[{payment_id:f.reservation.payment_id,intent_id:f.sale.source.intent_id,
    livemode:false,captured_cents:checkedRefundSale(f.sale).quote.amounts.total_cents,
    native_refunds:[{id:f.native.id,amount_cents:f.reservation.total_cents}],
    refunds:[{id:f.refund.id,status:"succeeded",amount_cents:f.reservation.total_cents}]}]};
  f.plans=[f.reservation];f.orphans=[];
  f.completionDb={...f.balanceDb,raw:async(sql,values)=>{
    if(sql.includes("from commerce.snowforce_refund_allocations"))return {rows:structuredClone(f.plans)};
    if(sql.startsWith("select f.allocation_id"))return {rows:structuredClone(f.orphans)};
    return f.balanceDb.raw(sql,values);
  }};
  f.close=()=>assertAfterSalesRefundCompletion(f.completionDb,f.case,f.returned.id,f.check);
  return f;
}
test("received case closes only with its exact completed cash, native debit and tax proof; later tracking versions are valid",async()=>{
  const f=await fixture(),posts=f.moneyPosts.length;await f.close();assert.equal(f.moneyPosts.length,posts);
});
test("matching aggregate cents from another refund, native ID, amount or pending provider result cannot close",async()=>{
  for(const change of [p=>p.refunds[0].id="re_other",p=>p.native_refunds[0].id="ref_other",p=>p.refunds[0].amount_cents++,
    p=>p.native_refunds[0].amount_cents++,p=>p.refunds[0].status="pending",p=>p.refunds.push({id:"re_failed",status:"failed",amount_cents:100}),
    p=>p.intent_id="pi_other",p=>p.livemode=true,p=>p.captured_cents--]){
    const f=await fixture();change(f.check.payments[0]);await assert.rejects(f.close);
  }
});
test("unfinished tax, cash, missing native bookkeeping or orphan native money keeps the case open",async()=>{
  for(const change of [f=>f.records[0].tax_task.state="retry",f=>f.records[0].cash_task.state="pending",
    f=>f.records[0].transactions=[],f=>f.records=[],f=>f.check.payments[0].native_refunds.push({id:"ref_manual",amount_cents:100}),
    f=>f.check.payments.push({...f.check.payments[0],payment_id:"pay_other"})]){const f=await fixture();change(f);await assert.rejects(f.close);}
});
test("a return must refund every approved received unit, without over-allocation or another case's proof",async()=>{
  for(const change of [f=>f.case.items[0].quantity=2,f=>f.case.items[0].quantity=0,f=>f.case.items[0].id="ordli_other",
    f=>f.case.id="123e4567-e89b-42d3-a456-426614174090",f=>f.case.items.push(f.case.items[0]),f=>f.case.version=2]){
    const f=await fixture();change(f);await assert.rejects(f.close);
  }
});
test("unfinished reservations, wrong original source and a changed native return cannot close",async()=>{
  for(const change of [f=>{f.plans[0].state="reserved";f.plans[0].first_attempt_at=null;},f=>f.plans[0].source_data.sale.source.capture_id="cap_other",
    f=>f.returned.id="return_other",f=>f.case.native_id="return_other",f=>f.check.order_id="order_other",f=>f.check.state="exception",
    f=>f.case.status="completed"]){const f=await fixture();change(f);await assert.rejects(f.close);}
});
test("legacy aggregate-only refunds and unrefunded returns cannot be marked completed",async()=>{
  const f=await fixture();f.plans=[];await assert.rejects(f.close);
  f.check.payments[0].refunds=[];f.check.payments[0].native_refunds=[];await assert.rejects(f.close);
});
test("equal-value exchanges need no cash allocation; any native/provider refund or orphan proof prevents that exception",async()=>{
  const f=await fixture();f.case.kind="exchange";f.case.native_id="oexc_fixture";f.plans=[];
  f.check.payments[0].refunds=[];f.check.payments[0].native_refunds=[];await f.close();
  f.orphans=[{allocation_id:f.reservation.id}];await assert.rejects(f.close);f.orphans=[];
  f.check.payments[0].refunds=[{id:f.refund.id,status:"failed",amount_cents:1052}];await assert.rejects(f.close);
  f.check.payments[0].refunds=[];f.check.payments[0].native_refunds=[{id:f.native.id,amount_cents:1052}];await assert.rejects(f.close);
});
test("a settled exchange can refund fewer units than its total exchange quantity, with all refund evidence still required",async()=>{
  const f=await fixture();f.case.kind="exchange";f.case.native_id="oexc_fixture";f.case.items[0].quantity=3;await f.close();
  f.record.tax_task.state="retry";await assert.rejects(f.close);
});
test("cancelled untouched previews retain validation and do not block an equal-value exchange",async()=>{
  const f=await fixture();f.case.kind="exchange";f.case.native_id="oexc_fixture";
  f.plans[0]={...f.reservation,state:"cancelled",first_attempt_at:null,cancelled_at:f.reservation.first_attempt_at,cancellation_reason:"Reviewed untouched preview"};
  f.check.payments[0].refunds=[];f.check.payments[0].native_refunds=[];await f.close();
  f.plans[0].allocation_fingerprint="f".repeat(64);await assert.rejects(f.close);
});

test("malformed financial evidence becomes a conflict while an unavailable database is reported accurately",async()=>{
  const f=await fixture();f.returned.id="invalid";await assert.rejects(f.close,error=>error.type==="conflict");
  f.returned.id=f.reservation.native_return_id;f.records[0].funds_fingerprint="broken";
  await assert.rejects(f.close,error=>error.type==="conflict");
  f.completionDb.raw=async()=>{throw Error("Fixture database unavailable");};
  await assert.rejects(f.close,error=>error.message==="Fixture database unavailable");
});
