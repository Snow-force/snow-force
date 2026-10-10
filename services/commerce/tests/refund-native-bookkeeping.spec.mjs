import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {test} from "node:test";
import {executionFixture} from "./fixtures/refund-execution.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {ContainerRegistrationKeys,Modules}=require("@medusajs/framework/utils");
const {claimRefundExecution,nativeRefundBookkeeping}=require("../src/lib/refund-execution.ts");
async function fixture(){
  const f=executionFixture(),task=await claimRefundExecution(f.db);
  f.cash.remote_id=f.refund.id;f.cash.snapshot=structuredClone(f.refund);f.transactions=[];f.debits=[];
  const original=f.db;
  f.db={...original,raw:async(sql,values)=>{
    if(sql.startsWith("select id from commerce.refund"))return {rows:structuredClone(f.nativeRows??[{id:f.native.id}])};
    if(sql.startsWith("select amount,raw_amount,currency_code from commerce.order_transaction"))return {rows:structuredClone(f.transactions)};
    return original.raw(sql,values);
  }};
  f.scope={resolve:name=>{
    if(name===ContainerRegistrationKeys.PG_CONNECTION)return f.db;
    if(name===Modules.ORDER)return {addOrderTransactions:async value=>{
      f.debits.push(structuredClone(value));if(f.debitFailure)throw Error("Fixture order transaction response lost");
      f.transactions=[{amount:String(value.amount),raw_amount:{value:String(value.amount)},currency_code:value.currency_code}];
    }};
    assert.fail(`Unexpected native module ${name}`);
  }};
  f.book=()=>nativeRefundBookkeeping(f.scope,task);return f;
}
test("existing native refund recovery verifies current proof and adds only its exact negative USD debit",async()=>{
  const f=await fixture();assert.equal(await f.book(),f.native.id);assert.deepEqual(f.debits,[{
    order_id:f.reservation.order_id,amount:-10.52,currency_code:"usd",reference:"refund",reference_id:f.native.id}]);
  assert.equal(await f.book(),f.native.id);assert.equal(f.debits.length,1);assert.equal(f.moneyPosts.length,0);
});
test("changed native money, raw money, staff, capture, payment identity or allocation rejects before any debit",async()=>{
  for(const change of [f=>f.native.amount="10.53",f=>f.native.raw_amount.value="10.51",f=>f.native.created_by="user_other",
    f=>f.native.captures[0].id="cap_other",f=>f.native.captures[0].raw_amount.value="1",f=>f.native.intent_id="pi_other",
    f=>f.native.metadata.snowforce_refund.allocation_fingerprint="f".repeat(64)]){
    const f=await fixture();change(f);await assert.rejects(f.book);assert.equal(f.debits.length,0);assert.equal(f.moneyPosts.length,0);
  }
});
test("a previous debit must be unique, negative USD, and agree in both decimal and raw cents",async()=>{
  for(const records of [
    [{amount:"10.52",raw_amount:{value:"10.52"},currency_code:"usd"}],
    [{amount:"-10.52",raw_amount:{value:"-10.51"},currency_code:"usd"}],
    [{amount:"-10.53",raw_amount:{value:"-10.52"},currency_code:"usd"}],
    [{amount:"-10.52",raw_amount:{value:"-10.52"},currency_code:"eur"}],
    [{amount:"-10.52",raw_amount:{value:"-10.52"},currency_code:"usd"},{amount:"-10.52",raw_amount:{value:"-10.52"},currency_code:"usd"}],
    [{amount:"-10.52",raw_amount:{value:"NaN"},currency_code:"usd"}],
  ]){const f=await fixture();f.transactions=records;await assert.rejects(f.book);assert.equal(f.debits.length,0);}
});
test("stale or short leases, pending/failed/unknown funds and duplicate native identities never authorize bookkeeping",async()=>{
  for(const change of [f=>f.cash.claim_token="123e4567-e89b-42d3-a456-426614174090",f=>f.cash.lease_until=f.state.now+59000,
    f=>f.cash.snapshot.status="pending",f=>f.cash.snapshot.status="failed",f=>{f.cash.remote_id=null;f.cash.snapshot=null;},
    f=>f.nativeRows=[{id:f.native.id},{id:"ref_other"}]]){
    const f=await fixture();change(f);await assert.rejects(f.book);assert.equal(f.debits.length,0);
  }
});
test("a native record changing during verification loses its lease and cannot add a debit",async()=>{
  const f=await fixture(),original=f.db.raw;
  f.db.raw=async(sql,values)=>{const result=await original(sql,values);if(sql.includes("from commerce.refund r"))f.cash.lease_until=f.state.now;return result;};
  await assert.rejects(f.book);assert.equal(f.debits.length,0);
});
test("bookkeeping storage failure is reported; a later retry reuses the same existing native refund",async()=>{
  const f=await fixture();f.debitFailure=true;await assert.rejects(f.book,/response lost/);f.debitFailure=false;
  assert.equal(await f.book(),f.native.id);assert.equal(f.debits.length,2);assert.deepEqual(f.debits[0],f.debits[1]);assert.equal(f.moneyPosts.length,0);
});
