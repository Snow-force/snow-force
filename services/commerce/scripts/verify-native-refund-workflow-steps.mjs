// Actual native workflow, Query/Link and event bus in disposable loopback
// PostgreSQL only. Stripe responses are fixtures; no provider registration
// changes, real Stripe HTTP or production mutations.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {asValue}=require("awilix");
const {ContainerRegistrationKeys,Modules}=require("@medusajs/framework/utils");
const {queueRefundExecution,claimRefundExecution,nativeRefundBookkeeping}=require("../src/lib/refund-execution.ts");
const SnowforceStripe=require("../src/modules/snowforce-stripe/service.ts").default;

export async function verifyInitialNativeRefundWorkflow({app,scope,db,orders,payments,started,f,payment,reviewer,installVerifier,nativeRefundCallCount}){
  const checks=[],reads=[],warnings=[];
  const observeWarning=warning=>warnings.push({name:warning.name,message:warning.message});
  process.on("warning",observeWarning);
  try{
    const container=app.sharedContainer.createScope();
    container.register({
      [ContainerRegistrationKeys.PG_CONNECTION]:asValue(scope.resolve()),
      [ContainerRegistrationKeys.REMOTE_QUERY]:asValue(app.query),
      [ContainerRegistrationKeys.QUERY]:asValue(app.query),
    });
    assert.equal(container.resolve(Modules.ORDER),orders);assert.equal(container.resolve(Modules.PAYMENT),payments);
    const linked=await app.query({entryPoint:"order_payment_collection",fields:["order.id"],variables:{payment_collection_id:payment.payment_collection_id}});
    assert.equal(linked.length,1);assert.equal(linked[0].order.id,started.order_id);
    checks.push("actual Query resolves the actual native order/payment Link created through the installed Link API");
    await db.query("update commerce.payment set data=$1 where id=$2",[{id:f.sale.source.intent_id,livemode:false},payment.id]);
    const previousMode=process.env.COMMERCE_OPERATING_MODE;
    try{
      process.env.COMMERCE_OPERATING_MODE="sales";
      await queueRefundExecution(container,{actor_type:"user",actor_id:reviewer.id},started.id,{allocation_fingerprint:started.allocation_fingerprint,confirmed:true});
    }finally{
      if(previousMode===undefined)delete process.env.COMMERCE_OPERATING_MODE;else process.env.COMMERCE_OPERATING_MODE=previousMode;
    }
    const task=await claimRefundExecution(scope.resolve(),started.id);assert.ok(task);
    const refund={id:"re_initialworkflowfixture",object:"refund",amount:started.total_cents,currency:"usd",status:"succeeded",
      created:Math.floor(Date.now()/1000),payment_intent:f.sale.source.intent_id,
      metadata:{snowforce_operation:started.id,snowforce_allocation:started.allocation_fingerprint,snowforce_order:started.order_id,snowforce_payment:payment.id}};
    await db.query("update commerce.snowforce_refund_executions set remote_id=$1,snapshot=$2 where id=$3",[refund.id,refund,started.id]);
    const provider={livemode:false,account:async()=>({id:started.account_id}),
      intent:async()=>({id:f.sale.source.intent_id,object:"payment_intent",currency:"usd",status:"succeeded",livemode:false,
        amount:f.sale.snapshot.total_cents,amount_received:f.sale.snapshot.total_cents,amount_capturable:0,metadata:{session_id:f.sale.source.session_id}}),
      refund:async id=>{reads.push(id);assert.equal(id,refund.id);return structuredClone(refund);}};
    class FixtureCandidate extends SnowforceStripe {
      refundFundsReader(){return provider;}
    }
    // Real candidate and Medusa cradle; only Stripe GET responses are fixtures.
    // The application's configured payment provider remains unchanged.
    const candidate=new FixtureCandidate(container.cradle,{apiKey:"sk_test_nativecandidatefixture",webhookSecret:"whsec_nativecandidatefixture"});
    // The disposable native provider delegates to the real read-only callback.
    // There is no funds POST method in this provider or this verifier.
    const before=nativeRefundCallCount();
    assert.equal(Number((await db.query("select count(*) from commerce.refund where payment_id=$1",[payment.id])).rows[0].count),0);
    installVerifier(input=>candidate.refundPayment({...input,amount:"10.53"}));
    await assert.rejects(()=>nativeRefundBookkeeping(container,task));
    assert.equal(nativeRefundCallCount(),before+1);assert.equal(reads.length,0);
    assert.equal(Number((await db.query("select count(*) from commerce.refund where payment_id=$1",[payment.id])).rows[0].count),0);
    assert.equal(Number((await db.query("select count(*) from commerce.order_transaction where order_id=$1 and reference='refund'",[started.order_id])).rows[0].count),0);
    checks.push("a mismatching native callback is rejected before provider reads; the failed native workflow cleans up its refund and leaves no debit");
    installVerifier(input=>candidate.refundPayment(input));
    const nativeId=await nativeRefundBookkeeping(container,task);
    assert.match(nativeId,/^ref_[A-Za-z0-9]+$/);assert.equal(nativeRefundCallCount(),before+2);assert.ok(reads.length);
    const native=(await db.query("select id,amount,raw_amount,metadata from commerce.refund where payment_id=$1 and deleted_at is null",[payment.id])).rows;
    assert.equal(native.length,1);assert.equal(native[0].id,nativeId);assert.equal(Number(native[0].amount)*100,started.total_cents);
    assert.equal(Number(native[0].raw_amount.value)*100,started.total_cents);assert.equal(native[0].metadata.snowforce_refund.claim_token,task.claim_token);
    const transactions=(await db.query("select amount,raw_amount,currency_code from commerce.order_transaction where order_id=$1 and reference='refund' and reference_id=$2 and deleted_at is null",[started.order_id,nativeId])).rows;
    assert.equal(transactions.length,1);assert.equal(Number(transactions[0].amount)*100,-started.total_cents);
    assert.equal(Number(transactions[0].raw_amount.value)*100,-started.total_cents);assert.equal(transactions[0].currency_code,"usd");
    checks.push("initial candidate calls the installed refundPaymentWorkflow and the unregistered provider adapter with an actual Medusa cradle, creating exactly one correctly associated refund and negative USD debit");
    assert.equal(await nativeRefundBookkeeping(container,task),nativeId);assert.equal(nativeRefundCallCount(),before+2);
    checks.push("repeated bookkeeping reuses the native refund and debit without another provider callback or funds POST");
    const report={checkedAt:new Date().toISOString(),status:warnings.length?"functional_checks_passed_with_warning":"passed",
      postgres:(await db.query("show server_version")).rows[0].server_version,medusa:require("@medusajs/payment/package.json").version,
      scope:"Disposable loopback PostgreSQL; actual Medusa native refund workflow, Query/Link, payment/order modules, unregistered candidate adapter and local event bus; provider dispatch and Stripe GET responses are fixtures; no real Stripe HTTP or production provider change",checks,warnings,actual_stripe_api_calls:0};
    writeFileSync(new URL("../../../output/shop-native-refund-workflow-local-verification.json",import.meta.url),JSON.stringify(report,null,2)+"\n");
    console.log(JSON.stringify(report,null,2));
  }finally{
    installVerifier(null);process.removeListener("warning",observeWarning);
  }
}
