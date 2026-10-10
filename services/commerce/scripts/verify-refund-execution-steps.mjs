// Disposable PostgreSQL only. Recover one already-observed fixture refund.
// Real Medusa bookkeeping and ledger SQL; no Stripe HTTP or money creation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { queueRefundExecution, claimRefundExecution, processRefundExecution } = require("../src/lib/refund-execution.ts");
const { verifyNativeRefundReconciliation } = require("../src/lib/native-refund-reconciliation.ts");
const { assertTrackedRefundBalance } = require("../src/lib/tracked-refund-balance.ts");
const { startTaxRefundReservation } = require("../src/lib/tax-refund-reservations.ts");
const { nativeRefundBookkeeping } = require("../src/lib/refund-execution.ts");
const { Modules } = require("@medusajs/framework/utils");

export async function verifyRefundExecution({ scope, db, orders, payments, started, nativeRefundId, refund, provider, reviewer, completionCase, nativeRefundCallCount }) {
  const checks = [], reads = []; let books = 0;
  if (!(await db.query("select to_regclass('commerce.snowforce_refund_executions') as existing")).rows[0].existing)
    await db.query(readFileSync(new URL("../../../supabase/migrations/20261009220808_shop_refund_execution.sql", import.meta.url), "utf8"));
  const previousMode = process.env.COMMERCE_OPERATING_MODE;
  let queued;
  try {
    process.env.COMMERCE_OPERATING_MODE = "sales";
    queued = await queueRefundExecution(scope, { actor_type: "user", actor_id: reviewer.id }, started.id,
      { allocation_fingerprint: started.allocation_fingerprint, confirmed: true });
    assert.deepEqual(await queueRefundExecution(scope, { actor_type: "user", actor_id: reviewer.id }, started.id,
      { allocation_fingerprint: started.allocation_fingerprint, confirmed: true }), queued);
  } finally {
    if (previousMode === undefined) delete process.env.COMMERCE_OPERATING_MODE;
    else process.env.COMMERCE_OPERATING_MODE = previousMode;
  }
  assert.equal(queued.state, "queued"); assert.equal(queued.total_cents, 1052);
  assert.equal(Number((await db.query("select count(*) from commerce.snowforce_refund_executions")).rows[0].count), 1);
  checks.push("authenticated queue SQL recovers one exact original allocation without replacing its request");

  const claims = await Promise.all([claimRefundExecution(scope.resolve()), claimRefundExecution(scope.resolve())]);
  assert.equal(claims.filter(Boolean).length, 1);
  await db.query("update commerce.refund set metadata=jsonb_set(metadata,'{snowforce_refund,claim_token}',to_jsonb($1::text)) where id=$2", [claims.find(Boolean).claim_token, nativeRefundId]);
  await db.query("update commerce.snowforce_refund_executions set remote_id=$1,snapshot=$2 where id=$3", [refund.id, refund, started.id]);
  const nativeData = (await db.query("select data from commerce.payment where id=$1", [started.payment_id])).rows[0].data;
  assert.deepEqual(await verifyNativeRefundReconciliation(scope, { data: nativeData, amount: "10.52", context: { idempotency_key: nativeRefundId } }, provider), { data: nativeData });
  await assert.rejects(() => verifyNativeRefundReconciliation(scope, { data: nativeData, amount: "10.53", context: { idempotency_key: nativeRefundId } }, provider));
  await db.query("update commerce.refund set metadata=jsonb_set(metadata,'{snowforce_refund,claim_token}',to_jsonb($1::text)) where id=$2", ["123e4567-e89b-42d3-a456-426614174077", nativeRefundId]);
  await assert.rejects(() => verifyNativeRefundReconciliation(scope, { data: nativeData, amount: "10.52", context: { idempotency_key: nativeRefundId } }, provider));
  await db.query("update commerce.refund set metadata=jsonb_set(metadata,'{snowforce_refund,claim_token}',to_jsonb($1::text)) where id=$2", [claims.find(Boolean).claim_token, nativeRefundId]);
  checks.push("unregistered Sandbox callback uses actual native refund association and GET-only proof; callback amount or claim-token mismatch is rejected");
  await assert.rejects(() => db.query("update commerce.snowforce_refund_executions set state='ready',claim_token=null,lease_until=null where id=$1", [started.id]), error => error.code === "23514");
  await db.query("update commerce.snowforce_refund_executions set state='queued',claim_token=null,lease_until=null where id=$1", [started.id]);
  checks.push("concurrent claims have one winner; successful provider evidence alone cannot complete without native order bookkeeping");
  await assert.rejects(() => assertTrackedRefundBalance(scope.resolve(), started.source_data.sale, [{ id: nativeRefundId }]));
  await assert.rejects(() => db.query("select commerce.assert_completed_refunds($1,$2,$3::jsonb)", [started.payment_id, started.order_id, JSON.stringify(started.source_data.sale)]), error => error.code === "23514");

  const fixture = { ...provider,
    listRefunds: async () => ({ data: [structuredClone(refund)], has_more: false }),
    refund: async id => { reads.push(id); assert.equal(id, refund.id); return structuredClone(refund); },
    createRefund: async () => assert.fail("Known fixture refund must recover through GET, never POST") };
  const bookkeepingChecks=[];
  const beforeNativeCalls=nativeRefundCallCount();
  await assert.rejects(()=>payments.refundPayment({payment_id:started.payment_id,amount:started.total_cents/100,created_by:started.staff_id,
    metadata:{snowforce_refund:{operation_id:started.id,allocation_fingerprint:started.allocation_fingerprint}}}),
    error=>error.code==="23505"||error.name==="UniqueConstraintViolationException"||
      error.type==="invalid_data"&&error.message.includes("operation_id")&&error.message.includes("already exists"));
  assert.equal(nativeRefundCallCount(),beforeNativeCalls);
  bookkeepingChecks.push("a repeated native refund for the same allocation is rejected by the unique index before the fixture provider callback");
  const bookScope={...scope,resolve:name=>name===Modules.ORDER?orders:scope.resolve(name)};
  const book = async (_scope,task) => {
    books++;
    const debit={order_id:started.order_id,amount:-started.total_cents/100,currency_code:"usd",reference:"refund",reference_id:nativeRefundId};
    await assert.rejects(()=>orders.addOrderTransactions({...debit,amount:-10.53}),error=>error.code==="23514"||error.message.includes("exact native cents"));
    const concurrent=await Promise.allSettled([orders.addOrderTransactions(debit),orders.addOrderTransactions(debit)]);
    assert.equal(concurrent.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(concurrent.filter(result=>result.status==="rejected").length,1);
    const duplicate=concurrent.find(result=>result.status==="rejected").reason;
    assert.ok(duplicate.code==="23505"||duplicate.name==="UniqueConstraintViolationException"||
      duplicate.type==="invalid_data"&&duplicate.message.includes("reference_id")&&duplicate.message.includes("already exists"));
    bookkeepingChecks.push("concurrent actual native order debit attempts have one winner; incorrect cents are rejected before booking");
    return nativeRefundBookkeeping(bookScope,task);
  };
  assert.equal((await processRefundExecution(scope, fixture, book, started.id)).status, "ready");
  assert.equal(await processRefundExecution(scope, fixture, book, started.id), null);
  assert.equal(books, 1); assert.ok(reads.length >= 1);
  const transactions = (await db.query("select amount,raw_amount,currency_code from commerce.order_transaction where reference='refund' and reference_id=$1 and deleted_at is null", [nativeRefundId])).rows;
  assert.equal(transactions.length, 1); assert.equal(Number(transactions[0].amount), -10.52);
  assert.equal(Number(transactions[0].raw_amount.value), -10.52); assert.equal(transactions[0].currency_code, "usd");
  checks.push("saved provider identity recovers through GET, actual Medusa books exact negative USD cents, and repeated workers do no further work");
  bookkeepingChecks.push("actual candidate recovery validates current native payment/refund/capture and reuses the one existing correct debit without further Stripe funds requests");

  if(!completionCase){
  const continuationChecks = [];
  assert.equal((await assertTrackedRefundBalance(scope.resolve(), started.source_data.sale, [{ id: nativeRefundId }])).length, 1);
  await db.query("select commerce.assert_completed_refunds($1,$2,$3::jsonb)", [started.payment_id, started.order_id, JSON.stringify(started.source_data.sale)]);
  continuationChecks.push("completed first refund passes both private-role application checks and actual database invoker checks; incomplete cash state was rejected");
  const next = (await db.query("select id from commerce.snowforce_refund_allocations where state='reserved' order by sequence limit 1")).rows[0];
  assert.ok(next); const continued = await startTaxRefundReservation(scope, started.order_id, next.id, reviewer.id);
  assert.equal(continued.state, "started"); assert.equal(continued.total_cents, 1051);
  continuationChecks.push("actual second original-price refund freezes after first completed cash, tax and native order debit; next rounding amount is 1051 cents");
  const debit = (await db.query("select id,raw_amount from commerce.order_transaction where reference='refund' and reference_id=$1 and deleted_at is null", [nativeRefundId])).rows[0];
  await assert.rejects(()=>db.query("update commerce.order_transaction set raw_amount=jsonb_set(raw_amount,'{value}','\"-1\"') where id=$1",[debit.id]),error=>error.code==="23514");
  continuationChecks.push("settled raw order debit changes are rejected at mutation time before they can affect continuation");
  await assert.rejects(()=>db.query("update commerce.refund set deleted_at=clock_timestamp() where id=$1",[nativeRefundId]),error=>error.code==="23514");
  continuationChecks.push("settled native refund removal is rejected at mutation time before it can orphan funds evidence");
  for (const role of ["anon", "authenticated", "service_role"])
    assert.equal((await db.query("select has_function_privilege($1,'commerce.assert_completed_refunds(text,text,jsonb)','EXECUTE') as access", [role])).rows[0].access, false);
  assert.equal((await db.query("select prosecdef from pg_proc where oid='commerce.assert_completed_refunds(text,text,jsonb)'::regprocedure")).rows[0].prosecdef, false);
  continuationChecks.push("continuation invoker retains no browser/service-role execute grants and the original immutable receipt/allocation guard remains installed");
  const continuationReport = { checkedAt: new Date().toISOString(), status: "passed", postgres: (await db.query("show server_version")).rows[0].server_version,
    scope: "disposable loopback PostgreSQL; actual Medusa refund/order APIs and private-role SQL; fixture provider proofs and original sale; no real Stripe HTTP or production changes", checks: continuationChecks };
  writeFileSync(new URL("../../../output/shop-tracked-refund-local-verification.json", import.meta.url), JSON.stringify(continuationReport, null, 2) + "\n");
  console.log(JSON.stringify(continuationReport, null, 2));
  }

  for(const sql of [
    "update commerce.refund set amount=amount+1 where id=$1","update commerce.refund set metadata='{}' where id=$1",
    "delete from commerce.refund where id=$1","delete from commerce.order_transaction where reference='refund' and reference_id=$1",
    "update commerce.order_transaction set deleted_at=clock_timestamp() where reference='refund' and reference_id=$1",
  ])await assert.rejects(()=>db.query(sql,[nativeRefundId]),error=>error.code==="23514");
  bookkeepingChecks.push("settled native refund money/association/deletion and order-debit deletion/soft deletion are rejected without rewriting historical records");
  for(const fn of ["guard_native_snowforce_refund","guard_native_snowforce_refund_transaction"]){
    assert.equal((await db.query("select prosecdef from pg_proc where oid=$1::regprocedure",[`commerce.${fn}()`])).rows[0].prosecdef,false);
    for(const role of ["anon","authenticated","service_role"])
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as access",[role,`commerce.${fn}()`])).rows[0].access,false);
  }
  bookkeepingChecks.push("both bookkeeping guards remain private invokers with no browser/service-role execute grants");
  const bookkeepingReport={checkedAt:new Date().toISOString(),status:"passed",postgres:(await db.query("show server_version")).rows[0].server_version,
    medusa:require("@medusajs/order/package.json").version,scope:"disposable loopback PostgreSQL; actual native refund/order APIs, duplicate/parallel attempts and candidate existing-record recovery; provider responses are fixtures; initial native workflow and real Stripe Sandbox are not verified",checks:bookkeepingChecks};
  writeFileSync(new URL("../../../output/shop-native-refund-bookkeeping-local-verification.json",import.meta.url),JSON.stringify(bookkeepingReport,null,2)+"\n");
  console.log(JSON.stringify(bookkeepingReport,null,2));

  for (const sql of [
    "update commerce.snowforce_refund_executions set state='retry' where id=$1",
    "update commerce.snowforce_refund_executions set request=jsonb_set(request,'{amount}','1') where id=$1",
    "delete from commerce.snowforce_refund_executions where id=$1",
    "update commerce.snowforce_refund_execution_history set state='queued' where execution_id=$1",
    "delete from commerce.snowforce_refund_execution_history where execution_id=$1",
    "insert into commerce.snowforce_refund_execution_history(execution_id,state,attempts) values($1,'ready',99)",
  ]) await assert.rejects(() => db.query(sql, [started.id]), error => error.code === "23514");
  const history = (await db.query("select state from commerce.snowforce_refund_execution_history where execution_id=$1 order by sequence", [started.id])).rows;
  assert.equal(history[0].state, "queued"); assert.equal(history.at(-1).state, "ready");
  checks.push("database guards retain immutable original requests and completed state; history only appends through its ledger trigger");
  for (const table of ["snowforce_refund_executions", "snowforce_refund_execution_history"]) {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass", [`commerce.${table}`])).rows[0].relrowsecurity, true);
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as access", [role, `commerce.${table}`])).rows[0].access, false);
  }
  for (const fn of ["guard_refund_execution", "audit_refund_execution", "guard_refund_execution_history"])
    assert.equal((await db.query("select prosecdef from pg_proc where oid=$1::regprocedure", [`commerce.${fn}()`])).rows[0].prosecdef, false);
  checks.push("runtime role executes queue and claims; RLS and invoker guards retain absent browser/service-role privileges");
  const report = { checkedAt: new Date().toISOString(), status: "passed", postgres: (await db.query("show server_version")).rows[0].server_version,
    medusa: require("@medusajs/order/package.json").version,
    scope: "disposable loopback PostgreSQL; actual Medusa refund and order-transaction records; known fixture provider identity and injected Sandbox-only GET recovery; no real Stripe HTTP, production mutation or configured provider replacement", checks };
  writeFileSync(new URL("../../../output/shop-refund-execution-local-verification.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if(completionCase){
    const {verifyAfterSalesRefundCompletion}=await import("./verify-after-sales-refund-completion-steps.mjs");
    await verifyAfterSalesRefundCompletion({scope,db,orders,payments,started,nativeRefundId,refund,provider,reviewer,caseId:completionCase});
  }
}
