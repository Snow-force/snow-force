import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { executionFixture } from "./fixtures/refund-execution.mjs";
import { completedRefundFixture as completed } from "./fixtures/completed-refund.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {checkedCompletedRefund,assertTrackedRefundBalance,assertRefundBalanceTotals}=require("../src/lib/tracked-refund-balance.ts");
const {checkedRefundSale}=require("../src/lib/tax-refund-contract.ts");
const {taxSaleFingerprint}=require("../src/lib/tax-sale-contract.ts");
test("completed prior refund matches exact original sale, current native record, cash, tax and USD debit",async()=>{
  const f=await completed();assert.deepEqual(checkedCompletedRefund(f.sale,f.record,f.current),{native_refund_id:f.native.id,stripe_refund_id:f.refund.id,operation_id:f.reservation.id,total_cents:1052});
  assert.equal((await assertTrackedRefundBalance(f.balanceDb,f.sale,[{id:f.native.id}])).length,1);assert.equal(f.moneyPosts.length,1);
});
test("incomplete funds, cash, tax, results and individual bookkeeping never authorize continuation",async()=>{
  const f=await completed();
  for(const change of [r=>r.tax_task.state="retry",r=>r.cash_task.state="pending",r=>r.cash_task.remote_id="re_other",r=>r.cash_task.snapshot.amount++,
    r=>r.tax_result.transaction_id="tax_other",r=>r.tax_result.account_id="acct_other",r=>r.tax_result.livemode=true,r=>r.tax_result.snapshot.lines[0].amount++,
    r=>r.funds_fingerprint="f".repeat(64),r=>r.native_refund_id="ref_other",r=>r.transactions=[],r=>r.transactions.push(r.transactions[0]),
    r=>r.transactions[0].amount="10.52",r=>r.transactions[0].amount="-10.53",r=>r.transactions[0].raw_amount.value="-10.51",r=>r.transactions[0].currency_code="eur"]){
    const row=structuredClone(f.record);change(row);assert.throws(()=>checkedCompletedRefund(f.sale,row,f.current));
  }
});
test("changed current native evidence or another valid original sale cannot authorize old money",async()=>{
  const f=await completed(),changed=structuredClone(f.current);changed.amount++;assert.throws(()=>checkedCompletedRefund(f.sale,f.record,changed));
  const other=executionFixture();other.sale.source.capture_id="cap_other";assert.throws(()=>checkedCompletedRefund(other.sale,f.record,f.current));
  const row=structuredClone(f.record);row.funds.total_cents++;assert.throws(()=>checkedCompletedRefund(f.sale,row,f.current));
});
test("every native refund and funds proof must pair exactly; missing, orphan, duplicate or malformed IDs block",async()=>{
  const f=await completed();
  for(const ids of [[],[{id:"ref_other"}],[{id:f.native.id},{id:"ref_legacy"}],[{id:f.native.id},{id:f.native.id}],[{}]])
    await assert.rejects(()=>assertTrackedRefundBalance(f.balanceDb,f.sale,ids));
  f.records=[];await assert.rejects(()=>assertTrackedRefundBalance(f.balanceDb,f.sale,[{id:f.native.id}]));
  assert.deepEqual(await assertTrackedRefundBalance(f.balanceDb,f.sale,[]),[]);
});
test("repeated proof rows cannot make a valid aggregate even when per-row amounts match",async()=>{
  const f=await completed();f.records=[f.record,structuredClone(f.record)];
  await assert.rejects(()=>assertTrackedRefundBalance(f.balanceDb,f.sale,[{id:f.native.id},{id:"ref_other"}]));
  f.records[1].native_refund_id="ref_other";await assert.rejects(()=>assertTrackedRefundBalance(f.balanceDb,f.sale,[{id:f.native.id},{id:"ref_other"}]));
  assert.equal(f.record.funds_fingerprint,taxSaleFingerprint(f.record.funds));
});
test("aggregate defense accepts the exact captured balance and rejects excess cents or reused refund/operation identities",()=>{
  const f=executionFixture(),total=checkedRefundSale(f.sale).quote.amounts.total_cents;
  const first={native_refund_id:"ref_first",stripe_refund_id:"re_first",operation_id:"123e4567-e89b-42d3-a456-426614174081",total_cents:1052};
  const rest={native_refund_id:"ref_rest",stripe_refund_id:"re_rest",operation_id:"123e4567-e89b-42d3-a456-426614174082",total_cents:total-1052};
  assert.doesNotThrow(()=>assertRefundBalanceTotals(f.sale,[first,rest]));
  for(const change of [r=>r.total_cents++,r=>r.native_refund_id=first.native_refund_id,r=>r.stripe_refund_id=first.stripe_refund_id,r=>r.operation_id=first.operation_id,r=>r.total_cents=0,r=>r.total_cents=1.5]){
    const row=structuredClone(rest);change(row);assert.throws(()=>assertRefundBalanceTotals(f.sale,[first,row]));
  }
});
test("continuation migration retains original receipt and audit guards, verifies all finished evidence and grants only the private role",()=>{
  const sql=readFileSync(new URL("../../../supabase/migrations/20261009224620_shop_tracked_refund_continuation.sql",import.meta.url),"utf8");
  for(const part of ["security invoker set search_path=''","e.state='ready'","t.state='ready'","current_refund.amount*100=f.total_cents",
    "order by r.id for update","Refund evidence has no current native record","amount*100=-f.total_cents","received_quantity",
    "Later refund reservations depend","from public,anon,authenticated,service_role","perform commerce.assert_completed_refunds"])assert.ok(sql.includes(part),part);
  assert.ok(!sql.includes("security definer"));assert.ok(!sql.includes("create policy"));assert.ok(!sql.includes("snowforce-stripe"));
});
