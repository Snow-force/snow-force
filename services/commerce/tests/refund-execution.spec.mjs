import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {test} from "node:test";
import {createServer} from "node:http";
import {executionFixture} from "./fixtures/refund-execution.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const engine=require("../src/lib/refund-execution.ts");
const Stripe=require("stripe");
const run=f=>engine.processRefundExecution(f.scope,f.provider,f.book);
test("candidate cash execution is disconnected by default and refuses the live environment before dependencies",async()=>{
  const scope={resolve:()=>assert.fail("No live or default access permitted")};
  await assert.rejects(()=>engine.processRefundExecution(scope));
  await assert.rejects(()=>engine.processRefundExecution(scope,{livemode:true},async()=>"ref_fixture"));
  const f=executionFixture();await assert.rejects(()=>engine.processRefundExecution(scope,f.provider));
});
test("cash request derives exact original cents and immutable association; it cannot accept caller-supplied prices",()=>{
  const f=executionFixture(),request=engine.cashRefundRequest(f.reservation);
  assert.equal(request.amount,1052);assert.equal(request.payment_intent,f.sale.source.intent_id);assert.equal(request.metadata.snowforce_operation,f.reservation.id);
  assert.deepEqual(engine.checkedRefundExecution({...f.cash,database_now:f.state.now}).request,request);
  for(const patch of [{request:{...request,amount:1053}},{request_fingerprint:"f".repeat(64)},{id:"123e4567-e89b-42d3-a456-426614174099"}])assert.throws(()=>engine.checkedRefundExecution({...f.cash,database_now:f.state.now,...patch}));
});
test("successful Sandbox harness records the fixed cash operation then enqueues tax only after native booking",async()=>{
  const f=executionFixture();assert.equal((await run(f)).status,"ready");
  assert.equal(f.moneyPosts.length,1);assert.equal(f.moneyPosts[0].key,`snowforce-cash-refund:${f.cash.id}`);assert.equal(f.books.length,1);
  assert.equal(f.state.task.state,"queued");assert.equal(f.state.funds.snapshot.stripe_refund_id,f.refund.id);assert.equal(await run(f),null);
});
test("unknown cash response retries only the saved request/key, and a saved remote ID recovers without another POST",async()=>{
  const f=executionFixture();f.createCashFailure=Error("Lost response");assert.equal((await run(f)).status,"retry");f.state.now+=180000;f.createCashFailure=null;
  assert.equal((await run(f)).status,"ready");assert.deepEqual(f.moneyPosts[0],f.moneyPosts[1]);
  const g=executionFixture();g.bookFailure=true;assert.equal((await run(g)).status,"retry");assert.equal(g.cash.remote_id,g.refund.id);
  g.state.now+=2*86400000;g.bookFailure=false;assert.equal((await run(g)).status,"ready");assert.equal(g.moneyPosts.length,1);
});
test("an unknown old request cannot POST after the idempotency window, while GET history can recover its identity",async()=>{
  const f=executionFixture();f.createCashFailure=Error("Lost response");await run(f);f.state.now+=22*3600000;f.createCashFailure=null;
  assert.equal((await run(f)).status,"reconcile_required");assert.equal(f.moneyPosts.length,1);
  const g=executionFixture();g.createCashFailure=Error("Lost response");await run(g);g.remote=[structuredClone(g.refund)];g.state.now+=22*3600000;g.createCashFailure=null;
  assert.equal((await run(g)).status,"ready");assert.equal(g.moneyPosts.length,1);
});
test("pending and action-required funds do not create native records or tax; polling is GET only",async()=>{
  for(const status of ["pending","requires_action"]){const f=executionFixture();f.refund.status=status;assert.equal((await run(f)).status,"pending");assert.equal(f.books.length,0);assert.equal(f.state.task,null);
    f.state.now+=180000;f.refund.status="succeeded";assert.equal((await run(f)).status,"ready");assert.equal(f.moneyPosts.length,1);}
});
test("failed or canceled remote refunds retain their identity for review and never start tax work",async()=>{
  for(const status of ["failed","canceled"]){const f=executionFixture();f.refund.status=status;assert.equal((await run(f)).status,"reconcile_required");assert.equal(f.cash.remote_id,f.refund.id);assert.equal(f.books.length,0);assert.equal(f.state.task,null);assert.equal(await run(f),null);}
});
test("changed native payment/capture, account, environment or untracked refund blocks any money POST",async()=>{
  for(const change of [f=>f.badPayment=true,f=>f.untracked=true,f=>f.native.captures[0].raw_amount.value="1",f=>f.native.captures[0].id="cap_other",
    f=>f.native.captures[0].created_at++,f=>f.provider.account=async()=>({id:"acct_other"}),f=>f.intent.amount_received--]){
    const f=executionFixture();change(f);assert.equal((await run(f)).status,"reconcile_required");assert.equal(f.moneyPosts.length,0);assert.equal(f.books.length,0);}
});
test("changed review, canceled return or reversed receipt blocks a new funds POST, while already saved funds still reconcile",async()=>{
  for(const change of [f=>f.review.version++,f=>f.review.status="completed",f=>f.returned.canceled_at=new Date(),f=>f.returned.order_id="order_other",
    f=>{f.receipts[0].received_quantity=0;f.receipts[0].raw_received_quantity.value=0;}]){
    const f=executionFixture();change(f);assert.equal((await run(f)).status,"reconcile_required");assert.equal(f.moneyPosts.length,0);
  }
  const f=executionFixture();f.bookFailure=true;assert.equal((await run(f)).status,"retry");f.review.version++;f.bookFailure=false;f.state.now+=180000;
  assert.equal((await run(f)).status,"ready");assert.equal(f.moneyPosts.length,1);
});
test("unknown Stripe history, duplicate own refunds or stuck pages cannot authorize another refund",async()=>{
  for(const change of [f=>f.remote=[{...f.refund,id:"re_untracked",metadata:{}}],f=>f.remote=[f.refund,{...f.refund,id:"re_duplicate"}],f=>f.pages=()=>({data:[],has_more:true}),f=>f.remote=[{...f.refund,amount:999}]]){
    const f=executionFixture();change(f);assert.equal((await run(f)).status,"reconcile_required");assert.equal(f.moneyPosts.length,0);}
});
test("a mismatch in the create response cannot save funds or native booking even if amount matches",async()=>{
  for(const change of [f=>f.refund.metadata.snowforce_payment="pay_other",f=>f.refund.payment_intent="pi_other",f=>f.refund.currency="eur",f=>f.refund.created=f.reservation.first_attempt_at-1]){
    const f=executionFixture();change(f);assert.equal((await run(f)).status,"reconcile_required");assert.equal(f.books.length,0);assert.equal(f.state.task,null);}
});
test("authorization and explicit confirmation reject before private or Stripe dependencies",async()=>{
  const scope={resolve:()=>assert.fail()},f=executionFixture();
  for(const auth of [undefined,{actor_type:"customer",actor_id:"cus_fixture"}])await assert.rejects(()=>engine.queueRefundExecution(scope,auth,f.reservation.id,{confirmed:true,allocation_fingerprint:f.reservation.allocation_fingerprint}));
  await assert.rejects(()=>engine.queueRefundExecution(scope,{actor_type:"user",actor_id:"user_fixture"},f.reservation.id,{confirmed:false,allocation_fingerprint:f.reservation.allocation_fingerprint}));
});
test("candidate migration is private, append-only audited and cannot mark ready without verified native bookkeeping",()=>{
  const sql=readFileSync(new URL("../../../supabase/migrations/20261009220808_shop_refund_execution.sql",import.meta.url),"utf8");
  for(const part of ["security invoker set search_path=''","from public,anon,authenticated,service_role","enable row level security","old.state='ready'","successful funds and correct native bookkeeping","append-only"])assert.ok(sql.includes(part),part);
  assert.ok(!sql.includes("security definer"));assert.ok(!sql.includes("create policy"));
  const config=readFileSync(new URL("../medusa-config.ts",import.meta.url),"utf8");assert.ok(config.includes('resolve: "./src/modules/snowforce-stripe", id: "stripe"'));
});
test("installed cash SDK adapter sends fixed exact refund requests and validates every GET/list identity before HTTP",async()=>{
  const f=executionFixture(),calls=[];
  const server=createServer(async(req,res)=>{
    let body="";for await(const chunk of req)body+=chunk;
    calls.push({method:req.method,url:req.url,body:new URLSearchParams(body),key:req.headers["idempotency-key"],version:req.headers["stripe-version"]});
    if(req.method==="POST"&&req.url==="/v1/refunds"&&calls.at(-1).body.has("currency")){
      res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:{type:"invalid_request_error",code:"parameter_unknown",param:"currency",message:"Refund currency is inherited from the payment."}}));return;
    }
    const response=req.url==="/v1/account"?{id:f.reservation.account_id}:req.url.startsWith("/v1/payment_intents/")?f.intent:
      req.url.startsWith("/v1/refunds?")?{object:"list",has_more:false,data:[f.refund]}:f.refund;
    res.setHeader("content-type","application/json");res.end(JSON.stringify(response));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const sdk=new Stripe("sk_test_localfixture",{host:"127.0.0.1",port:server.address().port,protocol:"http",apiVersion:"2026-09-30.endive",maxNetworkRetries:0});
    const provider=engine.createRefundExecutorProvider(sdk,false),request=engine.cashRefundRequest(f.reservation);
    await provider.account();await provider.intent(f.intent.id);await provider.refund(f.refund.id);
    await provider.listRefunds(f.intent.id);await provider.listRefunds(f.intent.id,"re_cursor");
    await provider.createRefund(request,`snowforce-cash-refund:${f.reservation.id}`);
    assert.deepEqual(calls.slice(0,3).map(c=>[c.method,c.url]),[["GET","/v1/account"],["GET",`/v1/payment_intents/${f.intent.id}`],["GET",`/v1/refunds/${f.refund.id}`]]);
    const list=new URL(calls[4].url,"http://fixture.test");assert.equal(list.searchParams.get("limit"),"100");assert.equal(list.searchParams.get("starting_after"),"re_cursor");
    const post=calls[5];assert.equal(post.method,"POST");assert.equal(post.url,"/v1/refunds");assert.equal(post.body.get("amount"),"1052");
    assert.equal(post.body.get("payment_intent"),f.intent.id);assert.equal(post.body.get("metadata[snowforce_operation]"),f.reservation.id);
    assert.equal(post.body.has("currency"),false);
    assert.equal(post.key,`snowforce-cash-refund:${f.reservation.id}`);assert.ok(calls.every(c=>c.version==="2026-09-30.endive"));
    const count=calls.length;
    for(const action of [()=>provider.intent("../intent"),()=>provider.refund("../refund"),()=>provider.listRefunds("../intent"),()=>provider.listRefunds(f.intent.id,"../cursor"),
      ()=>provider.createRefund(request,"foreign"),()=>provider.createRefund({...request,currency:"eur"},`snowforce-cash-refund:${f.reservation.id}`),()=>provider.createRefund({...request,metadata:{}},`snowforce-cash-refund:${f.reservation.id}`)])assert.throws(action);
    assert.equal(calls.length,count);assert.throws(()=>engine.createRefundExecutorProvider(sdk));
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test("cash SDK factory requires protected credentials; key environment does not enable the candidate executor",()=>{
  const original=process.env.COMMERCE_STRIPE_API_KEY;
  try{
    for(const key of [undefined,"pk_test_fixture","rk_test_bad-key"]){if(key===undefined)delete process.env.COMMERCE_STRIPE_API_KEY;else process.env.COMMERCE_STRIPE_API_KEY=key;assert.throws(()=>engine.createRefundExecutorProvider());}
    for(const [key,live] of [["rk_test_fixture",false],["rk_live_fixture",true]]){process.env.COMMERCE_STRIPE_API_KEY=key;assert.equal(engine.createRefundExecutorProvider().livemode,live);}
  }finally{if(original===undefined)delete process.env.COMMERCE_STRIPE_API_KEY;else process.env.COMMERCE_STRIPE_API_KEY=original;}
});
