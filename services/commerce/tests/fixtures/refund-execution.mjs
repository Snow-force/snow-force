import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {refundOutboxFixture} from "./tax-refund-outbox.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {cashRefundRequest}=require("../../src/lib/refund-execution.ts");
const {taxSaleFingerprint}=require("../../src/lib/tax-sale-contract.ts");
export function executionFixture(){
  const f=refundOutboxFixture(),request=cashRefundRequest(f.reservation),original=f.db;
  f.cash={id:f.reservation.id,state:"queued",request,request_fingerprint:taxSaleFingerprint(request),reservation:f.reservation,remote_id:null,snapshot:null,attempts:0,claim_token:null,first_attempt_at:null,lease_until:null,next_attempt_at:f.state.now};
  f.moneyPosts=[];f.books=[];f.history=[];f.untracked=false;f.cashFault=null;f.remote=[];
  f.refund.created=Math.floor(f.state.now/1000);f.native.created_at=f.refund.created;
  const receiptTime=new Date((f.reservation.first_attempt_at-1)*1000);
  f.review={order_id:f.reservation.order_id,kind:"return",status:"processing",version:f.reservation.case_version,native_id:f.reservation.native_return_id,
    items:f.orderLines.map(line=>({id:line.id,quantity:Number(line.quantity)})),created_at:receiptTime};
  f.returned={id:f.reservation.native_return_id,order_id:f.reservation.order_id,exchange_id:null,claim_id:null,canceled_at:null,created_at:receiptTime,status:"received"};
  f.receipts=f.review.items.map(line=>({item_id:line.id,quantity:line.quantity,raw_quantity:{value:line.quantity},received_quantity:line.quantity,raw_received_quantity:{value:line.quantity}}));
  const clone=structuredClone,joined=()=>({...clone(f.cash),reservation:clone(f.reservation),database_now:f.state.now});
  const fenced=values=>f.cash.state==="running"&&values.includes(f.cash.claim_token)&&f.cash.lease_until>f.state.now;
  const db={transaction:async action=>{const saved=clone(f.cash);try{return await original.transaction(()=>action(db));}catch(error){f.cash=saved;throw error;}},raw:async(sql,values=[])=>{
    let rows;
    if(f.cashFault&&sql.startsWith(f.cashFault))throw Error("Fixture cash database failure");
    if(sql.includes("from commerce.snowforce_refund_executions e")){
      const eligible=sql.includes("skip locked")?(["queued","retry","pending"].includes(f.cash.state)&&f.cash.next_attempt_at<=f.state.now||f.cash.state==="running"&&f.cash.lease_until<=f.state.now)
        :sql.includes("e.claim_token=")?fenced(values):true;
      rows=eligible?[joined()]:[];
    }else if(sql.startsWith("update commerce.snowforce_refund_executions")){
      if(sql.includes("set state='running'"))Object.assign(f.cash,{state:"running",claim_token:values[0],lease_until:f.state.now+180000,first_attempt_at:f.cash.first_attempt_at??f.state.now,attempts:f.cash.attempts+1});
      else if(sql.includes("set remote_id=")){if(fenced(values)&&(!f.cash.remote_id||f.cash.remote_id===values[0])){Object.assign(f.cash,{remote_id:values[0],snapshot:JSON.parse(values[1])});rows=[{id:f.cash.id}];}}
      else if(sql.includes("set state=")){if(fenced(values)){Object.assign(f.cash,{state:values[0],error_code:values[1],claim_token:null,lease_until:null,next_attempt_at:f.state.now+120000});rows=[{id:f.cash.id}];}}
      else assert.fail(sql);
      rows??=[];
    }else if(sql.startsWith('select id from commerce."user"'))rows=[{id:f.reservation.staff_id}];
    else if(sql.startsWith("select order_id,kind,status,version"))rows=[f.review];
    else if(sql.startsWith("select id,order_id,exchange_id"))rows=[f.returned];
    else if(sql.startsWith("select item_id,quantity,raw_quantity"))rows=f.receipts;
    else if(sql.startsWith("select id from commerce.payment"))rows=f.badPayment?[]:[{id:f.reservation.payment_id}];
    else if(sql.startsWith("select r.id from commerce.refund r left join"))rows=f.untracked?[{id:"ref_untracked"}]:[];
    else if(sql.startsWith("select stripe_refund_id,total_cents"))rows=f.tracked??[];
    else if(sql.startsWith("select id,amount,raw_amount"))rows=f.native.captures;
    else if(sql.endsWith(" as now"))rows=[{now:f.state.now}];
    else return original.raw(sql,values);
    f.history.push(sql);return{rows:clone(rows)};
  }};
  f.db=db;f.scope={resolve:()=>db};
  f.provider={...f.provider,
    createRefund:async(request,key)=>{f.moneyPosts.push(clone({request,key}));if(f.createCashFailure)throw f.createCashFailure;if(f.saveBeforeLoss)f.remote=[clone(f.refund)];return clone(f.refund);},
    listRefunds:async()=>f.pages?f.pages():({data:clone(f.remote),has_more:false}),
    refund:async id=>{if(f.readCashFailure)throw Error("Fixture Stripe read failure");assert.equal(id,f.refund.id);return clone(f.refund);},
  };
  f.book=async()=>{f.books.push(f.native.id);if(f.bookFailure)throw Error("Fixture native bookkeeping failed");return f.native.id;};
  return f;
}
