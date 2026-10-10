// Disposable native-module verifier only. Stripe cash/tax responses are
// fixtures. No live provider configuration, HTTP or production mutation.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {afterSalesRow}=require("../src/lib/after-sales-policy.ts");
const {assertAfterSalesRefundCompletion}=require("../src/lib/after-sales-refund-completion.ts");
const {verifyOrderRefundFunds,saveRefundFundsCheck}=require("../src/lib/refund-finality.ts");

export async function verifyAfterSalesRefundCompletion({scope,db,orders,payments,started,refund,provider,reviewer,caseId}){
  const checks=[],warnings=[],privateDb=scope.resolve();
  const observeWarning=warning=>warnings.push({name:warning.name,message:warning.message});
  process.on("warning",observeWarning);
  await db.query(readFileSync(new URL("../../../supabase/migrations/20261009230429_shop_after_sales_refund_completion.sql",import.meta.url),"utf8"));
  const read=async()=>afterSalesRow.parse((await db.query("select * from commerce.snowforce_after_sales where id=$1",[caseId])).rows[0]);
  const rejected=()=>assert.rejects(()=>privateDb.raw("update commerce.snowforce_after_sales set status='completed',version=version+1 where id=?",[caseId]),error=>error.code==="23514");
  const reader={livemode:false,retrieveIntent:provider.intent,listRefunds:async()=>({has_more:false,data:[structuredClone(refund)]})};
  const fresh=()=>verifyOrderRefundFunds(scope,started.order_id,reader);
  const save=check=>privateDb.transaction(async trx=>{
    await trx.raw('select id from commerce."order" where id=? for update',[started.order_id]);
    await trx.raw("select id from commerce.snowforce_after_sales where id=? for update",[caseId]);
    await saveRefundFundsCheck(trx,check,{source:"staff",staff_id:reviewer.id,request_id:caseId});
  });
  await rejected();checks.push("actual database completion rejects a linked received case without a fresh staff reconciliation");
  const check=await fresh(),readRow=await read();await save(check);
  assert.equal(check.state,"verified");
  for(const change of [value=>value.payments[0].refunds[0].id="re_other",value=>value.payments[0].refunds[0].amount_cents++,
    value=>value.payments[0].refunds[0].status="pending",value=>value.payments[0].native_refunds[0].id="ref_other"]){
    const wrong=structuredClone(check);change(wrong);await save(wrong);
    await assert.rejects(()=>assertAfterSalesRefundCompletion(privateDb,readRow,started.native_return_id,wrong),error=>error.type==="conflict");
    await rejected();
  }
  checks.push("matching aggregate cents cannot close with a different Stripe/native identity, amount or pending individual refund");
  await save(await fresh());
  const receipts=(await db.query("select id,received_quantity,raw_received_quantity from commerce.return_item where return_id=$1",[started.native_return_id])).rows;
  assert.equal(receipts.length,1);
  await db.query("update commerce.return_item set raw_received_quantity=jsonb_set(raw_received_quantity,'{value}','\"0\"') where id=$1",[receipts[0].id]);
  await rejected();
  await db.query("update commerce.return_item set raw_received_quantity=$1 where id=$2",[receipts[0].raw_received_quantity,receipts[0].id]);
  checks.push("changed raw receipt quantities cannot close even when the ordinary received decimal remains unchanged");
  await db.query("update commerce.snowforce_refund_verifications set observed_at=clock_timestamp()-interval '121 seconds' where order_id=$1",[started.order_id]);
  await rejected();
  checks.push("a successful older Stripe observation expires and cannot close a request");
  const finalCheck=await fresh();
  await privateDb.transaction(async trx=>{
    await trx.raw('select id from commerce."order" where id=? for update',[started.order_id]);
    await trx.raw("select id from commerce.snowforce_after_sales where id=? for update",[caseId]);
    await saveRefundFundsCheck(trx,finalCheck,{source:"staff",staff_id:reviewer.id,request_id:caseId});
    await assertAfterSalesRefundCompletion(trx,readRow,started.native_return_id,finalCheck);
    const completed=(await trx.raw("update commerce.snowforce_after_sales set status='completed',customer_message=?,version=version+1 where id=? and version=? returning *",["Fixture return received, funds reconciled and tax reversed.",caseId,readRow.version])).rows;
    assert.equal(completed.length,1);assert.equal(completed[0].status,"completed");
  });
  const finished=await read();assert.equal(finished.version,4);assert.equal(finished.history.at(-1).status,"completed");
  await assert.rejects(()=>privateDb.raw("update commerce.snowforce_after_sales set status='processing',version=version+1 where id=?",[caseId]),error=>error.code==="23514");
  checks.push("private-role application validation and actual database guards complete the exact request with append-only history; reopening is rejected");
  const remainingItem={id:readRow.items[0].id,quantity:2};
  await orders.registerFulfillment({order_id:started.order_id,reference:"fulfillment",reference_id:"ful_remainingfixture",items:[remainingItem]});
  const remainingReturn=await orders.createReturn({order_id:started.order_id,items:[remainingItem],created_by:reviewer.id});
  await orders.receiveReturn({return_id:remainingReturn.id,items:[remainingItem]});
  const remainingCase=randomUUID();
  await db.query("insert into commerce.snowforce_after_sales(id,order_id,customer_id,member_id,kind,reason,description,items,created_at) values($1,$2,$3,$4,'return','size','Remaining units fixture',$5,clock_timestamp()-interval '1 minute')",[remainingCase,started.order_id,readRow.customer_id,readRow.member_id,JSON.stringify([remainingItem])]);
  await db.query("update commerce.snowforce_after_sales set status='approved',version=2,reviewed_by=$1,reviewed_at=clock_timestamp() where id=$2",[reviewer.id,remainingCase]);
  await db.query("update commerce.snowforce_after_sales set status='processing',version=3,native_id=$1 where id=$2",[remainingReturn.id,remainingCase]);
  const remainingCheck=await fresh();
  await privateDb.transaction(trx=>saveRefundFundsCheck(trx,remainingCheck,{source:"staff",staff_id:reviewer.id,request_id:remainingCase}));
  const remainingRow=afterSalesRow.parse((await db.query("select * from commerce.snowforce_after_sales where id=$1",[remainingCase])).rows[0]);
  await assert.rejects(()=>assertAfterSalesRefundCompletion(privateDb,remainingRow,remainingReturn.id,remainingCheck),error=>error.type==="conflict");
  await assert.rejects(()=>privateDb.raw("update commerce.snowforce_after_sales set status='completed',version=version+1 where id=?",[remainingCase]),error=>error.code==="23514"&&error.message.includes("refund coverage"));
  assert.equal((await db.query("select status from commerce.snowforce_after_sales where id=$1",[remainingCase])).rows[0].status,"processing");
  checks.push("a subsequent fully received two-unit return cannot use the previous case's settled refund to close without its own quantity coverage");
  const equalOrder=await orders.createOrders({currency_code:"usd",customer_id:readRow.customer_id,items:[{title:"Exchange original fixture",unit_price:10,quantity:1}]});
  const equalCollection=await payments.createPaymentCollections({amount:10,currency_code:"usd"});
  const equalSession=await payments.createPaymentSession(equalCollection.id,{provider_id:"pp_stripe_stripe",amount:10,currency_code:"usd",data:{}});
  const equalPayment=await payments.authorizePaymentSession(equalSession.id,{});await payments.capturePayment({payment_id:equalPayment.id});
  await db.query("update commerce.payment set data=$1 where id=$2",[{id:"pi_equalexchange",livemode:false},equalPayment.id]);
  await db.query("insert into commerce.order_payment_collection values($1,$2,null)",[equalOrder.id,equalCollection.id]);
  const returnedItem={id:equalOrder.items[0].id,quantity:1};
  await orders.registerFulfillment({order_id:equalOrder.id,reference:"fulfillment",reference_id:"ful_equaloriginal",items:[returnedItem]});
  const exchange=await orders.createExchange({order_id:equalOrder.id,return_items:[returnedItem],additional_items:[{title:"Exchange replacement fixture",unit_price:10,quantity:1}],difference_due:0,
    return_shipping:{name:"Fixture free exchange return",amount:0,is_tax_inclusive:false}});
  await orders.receiveReturn({return_id:exchange.return_id,items:[returnedItem]});
  const equalCase=randomUUID();
  await db.query("insert into commerce.snowforce_after_sales(id,order_id,customer_id,member_id,kind,reason,description,items,created_at) values($1,$2,$3,$4,'exchange','size','Equal exchange fixture',$5,clock_timestamp()-interval '1 minute')",[equalCase,equalOrder.id,readRow.customer_id,readRow.member_id,JSON.stringify([returnedItem])]);
  await db.query("update commerce.snowforce_after_sales set status='approved',version=2,reviewed_by=$1,reviewed_at=clock_timestamp() where id=$2",[reviewer.id,equalCase]);
  await db.query("update commerce.snowforce_after_sales set status='processing',version=3,native_id=$1 where id=$2",[exchange.id,equalCase]);
  const equalReader={livemode:false,retrieveIntent:async()=>({id:"pi_equalexchange",currency:"usd",livemode:false,status:"succeeded",amount:1000,amount_received:1000}),listRefunds:async()=>({has_more:false,data:[]})};
  let equalCheck=await verifyOrderRefundFunds(scope,equalOrder.id,equalReader);
  await privateDb.transaction(trx=>saveRefundFundsCheck(trx,equalCheck,{source:"staff",staff_id:reviewer.id,request_id:equalCase}));
  await assert.rejects(()=>privateDb.raw("update commerce.snowforce_after_sales set status='completed',version=version+1 where id=?",[equalCase]),error=>error.code==="23514"&&error.message.includes("replacement delivery"));
  const replacement={id:exchange.additional_items[0].item_id,quantity:1};
  await orders.registerFulfillment({order_id:equalOrder.id,reference:"fulfillment",reference_id:"ful_equalreplacement",items:[replacement]});
  await orders.registerDelivery({order_id:equalOrder.id,reference:"fulfillment",reference_id:"ful_equalreplacement",items:[replacement]});
  equalCheck=await verifyOrderRefundFunds(scope,equalOrder.id,equalReader);
  const equalRow=afterSalesRow.parse((await db.query("select * from commerce.snowforce_after_sales where id=$1",[equalCase])).rows[0]);
  await privateDb.transaction(async trx=>{
    await trx.raw('select id from commerce."order" where id=? for update',[equalOrder.id]);
    await trx.raw("select id from commerce.snowforce_after_sales where id=? for update",[equalCase]);
    await saveRefundFundsCheck(trx,equalCheck,{source:"staff",staff_id:reviewer.id,request_id:equalCase});
    await assertAfterSalesRefundCompletion(trx,equalRow,exchange.return_id,equalCheck);
    await trx.raw("update commerce.snowforce_after_sales set status='completed',version=version+1 where id=?",[equalCase]);
  });
  assert.equal(Number((await db.query("select count(*) from commerce.refund where payment_id=$1",[equalPayment.id])).rows[0].count),0);
  checks.push("actual equal-value native exchange remains open until replacement delivery, then completes without cash allocation or refund");
  for(const role of ["anon","authenticated","service_role"])
    assert.equal((await db.query("select has_function_privilege($1,'commerce.guard_after_sales_refund_completion()','EXECUTE') as access",[role])).rows[0].access,false);
  assert.equal((await db.query("select prosecdef from pg_proc where oid='commerce.guard_after_sales_refund_completion()'::regprocedure")).rows[0].prosecdef,false);
  checks.push("completion invoker has no public/browser/service-role execute grants and retains original case immutability");
  process.removeListener("warning",observeWarning);
  const report={checkedAt:new Date().toISOString(),status:warnings.length?"functional_checks_passed_with_warning":"passed",postgres:(await db.query("show server_version")).rows[0].server_version,
    medusa:require("@medusajs/order/package.json").version,
    scope:"disposable loopback PostgreSQL; actual Medusa customer/order/return/payment/user migrations and APIs, real after-sales/funds/allocation/cash/tax migrations and private-role completion SQL; explicit order-payment link and provider responses are fixtures; no real Stripe HTTP or production changes",checks,warnings,
    warning_follow_up:warnings.length?"pg 8.23.1 -> Knex -> MikroORM native transaction query sequencing; investigate a supported Medusa transaction/dependency fix before clean launch acceptance. Warnings remain printed; no dependency patch or suppression applied.":null};
  writeFileSync(new URL("../../../output/shop-after-sales-refund-completion-local-verification.json",import.meta.url),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}
