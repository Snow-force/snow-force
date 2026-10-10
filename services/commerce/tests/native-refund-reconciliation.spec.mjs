import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {test} from "node:test";
import {nativeReconciliationFixture as fixture} from "./fixtures/native-refund-reconciliation.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {verifyNativeRefundReconciliation}=require("../src/lib/native-refund-reconciliation.ts");
const {BigNumber}=require("@medusajs/framework/utils");
const run=f=>verifyNativeRefundReconciliation(f.scope,f.input,f.provider);
test("native candidate refuses default or live readers before dependencies",async()=>{
  const scope={resolve:()=>assert.fail()};await assert.rejects(()=>verifyNativeRefundReconciliation(scope,{}));
  await assert.rejects(()=>verifyNativeRefundReconciliation(scope,{}, {livemode:true}));
});
test("native reconciliation only GET-verifies saved successful funds and preserves original payment data",async()=>{
  const f=fixture(),result=await run(f);assert.deepEqual(result,{data:f.input.data});assert.equal(f.associationReads,2);assert.equal(f.posts.length,0);
});

test("installed native raw amounts and BigNumber instances preserve exact cents and payment data",async()=>{
  for(const amount of [10.52,{value:"10.52"},{value:"10.520000000000000000",precision:20},{value:10.52,precision:20},new BigNumber("10.52")]){
    const f=fixture();f.input.amount=amount;assert.deepEqual(await run(f),{data:f.input.data});assert.equal(f.posts.length,0);
  }
});

test("malformed, fractional-cent or mismatching raw native amounts reject before provider reads",async()=>{
  for(const amount of [null,undefined,{value:"10.521",precision:20},{value:"10.53",precision:20},{value:"-10.52",precision:20},
    {value:"NaN",precision:20},{value:"10.52",precision:0},{value:"10.52",precision:1.5},{value:"10.52",precision:101},
    {value:"10.52",currency:"usd"},{numeric:10.52},{value:null},new BigNumber("10.521")]){
    const f=fixture();f.input.amount=amount;f.provider.account=async()=>assert.fail("Invalid amount must not reach provider reads");
    await assert.rejects(()=>run(f));assert.equal(f.posts.length,0);
  }
});
test("ordinary untracked native refunds or malformed callbacks cannot reach Stripe",async()=>{
  for(const change of [f=>f.noAssociation=true,f=>f.input.context.idempotency_key="bad",f=>f.input.data.id="../intent",f=>f.input.data.livemode=true]){
    const f=fixture();change(f);f.provider.account=async()=>assert.fail("No provider reads permitted");await assert.rejects(()=>run(f));
  }
});
test("callback amount, identity and immutable request must match the reviewed allocation before provider reads",async()=>{
  for(const change of [f=>f.input.amount="10.53",f=>f.input.data.id="pi_other",f=>f.association.request.amount++,f=>f.association.request_fingerprint="f".repeat(64)]){
    const f=fixture();change(f);f.provider.account=async()=>assert.fail();await assert.rejects(()=>run(f));
  }
});
test("changed funds, account and native evidence reject bookkeeping",async()=>{
  for(const change of [f=>f.refund.status="pending",f=>f.refund.amount++,f=>f.provider.account=async()=>({id:"acct_other"}),f=>f.native.raw_amount.value="10.53",f=>f.native.created_by="user_other"]){
    const f=fixture();change(f);await assert.rejects(()=>run(f));assert.equal(f.posts.length,0);
  }
});
test("association or lease lost while reading remote proof cannot authorize native bookkeeping",async()=>{
  const f=fixture(),read=f.provider.refund;f.provider.refund=async id=>{const refund=await read(id);f.association.remote_id="re_other";return refund;};await assert.rejects(()=>run(f));
  const g=fixture(),other=g.provider.refund;g.provider.refund=async id=>{const refund=await other(id);g.noAssociation=true;return refund;};await assert.rejects(()=>run(g));
  const h=fixture(),replacementRead=h.provider.refund;h.provider.refund=async id=>{const refund=await replacementRead(id);h.association.claim_token="123e4567-e89b-42d3-a456-426614174077";return refund;};await assert.rejects(()=>run(h));
});
