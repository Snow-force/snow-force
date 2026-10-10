import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { executionFixture } from "./refund-execution.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {processRefundExecution}=require("../../src/lib/refund-execution.ts");
const {processTaxRefund}=require("../../src/lib/tax-refund-worker.ts");
const {readNativeTaxRefund}=require("../../src/lib/tax-refund-funds.ts");

export async function completedRefundFixture(){
  const f=executionFixture();assert.equal((await processRefundExecution(f.scope,f.provider,f.book)).status,"ready");
  f.reversal.transaction.created=f.reversal.transaction.posted_at=f.refund.created;
  assert.equal((await processTaxRefund(f.scope,f.provider)).status,"ready");
  f.record={native_refund_id:f.native.id,reservation:f.reservation,funds:f.state.funds.snapshot,funds_fingerprint:f.state.funds.fingerprint,
    tax_task:f.state.task,cash_task:f.cash,database_now:f.state.now,tax_result:{account_id:f.reservation.account_id,livemode:false,
      transaction_id:f.state.results[0].transaction_id,snapshot:f.state.results[0].snapshot},
    transactions:[{currency_code:"usd",amount:"-10.52",raw_amount:{value:"-10.52"}}]};
  f.current=await readNativeTaxRefund(f.db,f.reservation,f.native.id);f.records=[f.record];
  const original=f.db;f.balanceDb={...original,raw:async(sql,values)=>sql.startsWith("select f.native_refund_id")?{rows:structuredClone(f.records)}:original.raw(sql,values)};
  return f;
}
