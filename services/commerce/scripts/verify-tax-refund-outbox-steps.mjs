// Called only by the disposable loopback Medusa verifier. Provider responses
// below are fixtures, while payment/refund records and queue SQL are real.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { reversalFixture } from "../tests/fixtures/tax-refund.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { checkedRefundSale } = require("../src/lib/tax-refund-contract.ts");
const { inspectTaxRefundFunds } = require("../src/lib/tax-refund-funds.ts");
const { claimTaxRefund, deferTaxRefund, enqueueTaxRefund } = require("../src/lib/tax-refund-ledger.ts");
const { enqueueSucceededTaxRefund, processTaxRefund } = require("../src/lib/tax-refund-worker.ts");

export async function verifyTaxRefundOutbox({ scope, db, orders, payments, started, f, payment, reviewer, completionCase, nativeRefundCallCount }) {
  const checks = [], posts = [], reads = [], total = checkedRefundSale(f.sale).quote.amounts.total_cents;
  if (!(await db.query("select to_regclass('commerce.snowforce_refund_funds') as existing")).rows[0].existing)
    await db.query(readFileSync(new URL("../../../supabase/migrations/20261009170338_shop_refund_tax_outbox.sql", import.meta.url), "utf8"));
  // Native fixture provider has no external intent. Install its explicit test
  // identity in this disposable database; no production account is involved.
  await db.query("update commerce.payment set data=$1 where id=$2", [{ id: f.sale.source.intent_id, livemode: false }, payment.id]);
  await payments.refundPayment({ payment_id: payment.id, amount: started.total_cents / 100, created_by: reviewer.id,
    metadata: { snowforce_refund: { operation_id: started.id, allocation_fingerprint: started.allocation_fingerprint } } });
  const native = (await db.query("select id,amount,raw_amount,floor(extract(epoch from created_at))::bigint as created_at from commerce.refund where payment_id=$1", [payment.id])).rows;
  assert.equal(native.length, 1); assert.equal(Number(native[0].amount), started.total_cents / 100);
  const refund = { id: "re_localfixture", object: "refund", amount: started.total_cents, currency: "usd", status: "succeeded", created: Number(native[0].created_at),
    payment_intent: f.sale.source.intent_id, metadata: { snowforce_operation: started.id, snowforce_allocation: started.allocation_fingerprint,
      snowforce_order: started.order_id, snowforce_payment: payment.id } };
  const reversal = reversalFixture(f.sale, started.allocation, started.request);
  reversal.transaction.created = reversal.transaction.posted_at = Math.max(refund.created, f.sale.source.captured_at + 10);
  let createFailure = false, readFailure = false;
  const provider = { livemode: false, account: async () => ({ id: started.account_id }),
    intent: async () => ({ id: f.sale.source.intent_id, object: "payment_intent", currency: "usd", status: "succeeded", livemode: false,
      amount: total, amount_received: total, amount_capturable: 0, metadata: { session_id: f.sale.source.session_id } }),
    refund: async () => structuredClone(refund),
    create: async (request, key) => { posts.push(structuredClone({ request, key })); if (createFailure) throw Error("Fixture response lost"); return structuredClone(reversal.transaction); },
    retrieve: async id => { reads.push(id); if (readFailure) throw Error("Fixture read unavailable"); return structuredClone(reversal.transaction); },
    lines: async () => ({ object: "list", has_more: false, data: structuredClone(reversal.lines) }) };
  const proof = await inspectTaxRefundFunds(scope, started.id, native[0].id, refund.id, provider);
  assert.equal(proof.native.captures[0].id, f.sale.source.capture_id); assert.equal(proof.native.amount, 1052);
  checks.push("actual Medusa refund raw USD cents and original full capture bind to a specific succeeded provider fixture");

  // Force failure after funds INSERT using a temporary, rejecting task trigger.
  // Transaction rollback must remove the funds row as well.
  await db.query(`create function commerce.reject_fixture_tax_task() returns trigger language plpgsql as $$ begin raise exception 'Fixture task insertion fault'; end $$;
    create trigger reject_fixture_tax_task before insert on commerce.snowforce_refund_tax_tasks for each row execute function commerce.reject_fixture_tax_task()`);
  await assert.rejects(() => enqueueTaxRefund(scope.resolve(), started, proof));
  assert.equal(Number((await db.query("select count(*) from commerce.snowforce_refund_funds")).rows[0].count), 0);
  await db.query("drop trigger reject_fixture_tax_task on commerce.snowforce_refund_tax_tasks; drop function commerce.reject_fixture_tax_task()");
  const task = await enqueueSucceededTaxRefund(scope, started.id, native[0].id, refund.id, provider);
  const repeated = await enqueueSucceededTaxRefund(scope, started.id, native[0].id, refund.id, provider);
  assert.equal(repeated.funds_fingerprint, task.funds_fingerprint); assert.equal(posts.length, 0);
  checks.push("funds and task commit atomically; insertion failure rolls back funds, and duplicate observations recover one task");

  const claims = await Promise.all([claimTaxRefund(scope.resolve()), claimTaxRefund(scope.resolve())]);
  assert.equal(claims.filter(Boolean).length, 1);
  await deferTaxRefund(scope.resolve(), claims.find(Boolean), "provider_unavailable");
  const due = () => db.query("update commerce.snowforce_refund_tax_tasks set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1", [started.id]);
  await due(); createFailure = true;
  assert.equal((await processTaxRefund(scope, provider)).status, "retry"); assert.equal(posts.length, 1);
  await due(); createFailure = false; readFailure = true;
  assert.equal((await processTaxRefund(scope, provider)).status, "retry"); assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1]);
  assert.equal((await db.query("select remote_id from commerce.snowforce_refund_tax_tasks where id=$1", [started.id])).rows[0].remote_id, reversal.transaction.id);
  checks.push("concurrent claimers cannot both acquire work; unknown create response retries the fixed request and idempotency key");

  await due(); readFailure = false;
  assert.equal((await processTaxRefund(scope, provider)).status, "ready"); assert.equal(posts.length, 2); assert.ok(reads.length >= 2);
  assert.equal(await processTaxRefund(scope, provider), null);
  const result = (await db.query("select snapshot from commerce.snowforce_refund_tax_results where task_id=$1", [started.id])).rows;
  assert.equal(result.length, 1); assert.equal(result[0].snapshot.total_cents, 1052);
  checks.push("saved provider identity recovers with GET and commits exactly one immutable specific-item tax reversal result");

  for (const [sql, values] of [
    ["update commerce.snowforce_refund_funds set fingerprint=repeat('f',64) where allocation_id=$1", [started.id]],
    ["delete from commerce.snowforce_refund_funds where allocation_id=$1", [started.id]],
    ["update commerce.snowforce_refund_tax_tasks set state='retry' where id=$1", [started.id]],
    ["update commerce.snowforce_refund_tax_results set snapshot='{}' where task_id=$1", [started.id]],
    ["delete from commerce.snowforce_refund_tax_results where task_id=$1", [started.id]],
  ]) await assert.rejects(() => db.query(sql, values), error => error.code === "23514");
  checks.push("database guards reject editing or deleting money evidence and reopening completed tax work");
  for (const table of ["snowforce_refund_funds", "snowforce_refund_tax_tasks", "snowforce_refund_tax_results"]) {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass", [`commerce.${table}`])).rows[0].relrowsecurity, true);
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as access", [role, `commerce.${table}`])).rows[0].access, false);
  }
  assert.equal((await db.query("select prosecdef from pg_proc where oid='commerce.guard_refund_tax_ledger()'::regprocedure")).rows[0].prosecdef, false);
  checks.push("application role executes actual queue SQL; RLS, invoker guards and absent browser/service-role grants protect all three tables");
  const report = { checkedAt: new Date().toISOString(), status: "passed", postgres: (await db.query("show server_version")).rows[0].server_version,
    medusa: require("@medusajs/payment/package.json").version,
    scope: "disposable loopback PostgreSQL; actual Medusa migrations and native refund API; explicit fixture provider responses, committed sale and after-sales data; no production changes or Stripe HTTP", checks };
  writeFileSync(new URL("../../../output/shop-tax-refund-outbox-local-verification.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--with-cash-candidate") || completionCase) {
    const { verifyRefundExecution } = await import("./verify-refund-execution-steps.mjs");
    await verifyRefundExecution({ scope, db, orders, payments, started, nativeRefundId: native[0].id, refund, provider, reviewer, completionCase, nativeRefundCallCount });
  }
}
