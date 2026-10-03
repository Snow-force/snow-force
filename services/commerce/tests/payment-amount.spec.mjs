import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {paymentAmountFixture} from "./fixtures/payment-amount.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {normalizeQuotedPaymentCollection}=require("../src/lib/payment-amount.ts");
const {createDurableCartPayment}=require("../src/lib/payment-creation.ts");
const {recoverCanceledCartPayment,readNativePaymentRecovery}=require("../src/lib/payment-recovery.ts");
const {assertPaymentMatches}=require("../src/lib/checkout-policy.ts");
const {readRecordedCartPaymentCents}=require("../src/lib/tax-quote-ledger.ts");
process.env.JWT_SECRET="fixture-payment-amount-signing-secret-at-least-32-characters";

test("real native float4 tax arithmetic converts only an empty collection to immutable quote cents",async()=>{
  const f=await paymentAmountFixture(),before=f.current();assert.equal(Number.isInteger(before.total*100),false);
  const value=await normalizeQuotedPaymentCollection(before,f.scope);
  assert.equal(value.payment_collection.amount,112.35);assert.deepEqual(f.rawAmount,{value:"112.35",precision:20});assert.equal(value.total,before.total);assert.equal(value.metadata.snowforce_tax_quote.signature,before.metadata.snowforce_tax_quote.signature);
  const count=f.writes.length;await normalizeQuotedPaymentCollection(f.current(),f.scope);assert.equal(f.writes.length,count);
});
test("native session and Stripe amount use quote cents, including stable unknown-result retry",async()=>{
  const f=await paymentAmountFixture(),post=f.writer.createIntent;let lost=true;
  f.writer.createIntent=async(...args)=>{const result=await post(...args);if(lost){lost=false;throw new Error("private-timeout");}return result;};
  await assert.rejects(()=>createDurableCartPayment(f.current(),f.scope,[],f.writer),error=>!error.message.includes("private-timeout"));
  const session=f.row.id;assert.equal(f.row.amount,112.35);assert.deepEqual(f.row.raw_amount,{value:"112.35",precision:20});assert.equal(f.bound,session);
  await createDurableCartPayment(f.current(),f.scope,[],f.writer);assert.equal(f.row.id,session);assert.deepEqual(f.writer.calls[0],f.writer.calls[1]);assert.equal(f.writer.calls[0].parameters.amount,11235);assert.equal(assertPaymentMatches(f.current(),11235).id,session);
  assert.equal(f.writes.filter(sql=>sql.startsWith("insert into commerce.payment_session")).length,1);
});
test("foreign, funded, deleted-session and changed proof states never reprice a collection",async()=>{
  for(const patch of [{customer_id:"cus_other"},{id:"paycol_other"},{currency_code:"eur"},{receipt_signature:"a".repeat(64)},{collection_count:2},{amount:"100"},{raw_amount:{value:"1",precision:20}},{has_order:true},{has_payment:true},{has_authorization:true},{completed:true},{authorized_amount:.01},{captured_amount:.01},{refunded_amount:.01},{session_count:1},{status:"authorized"}]){
    const f=await paymentAmountFixture();f.guardPatch=patch;await assert.rejects(()=>normalizeQuotedPaymentCollection(f.current(),f.scope));assert.equal(f.writes.length,0);assert.equal(f.writer.calls.length,0);
  }
  const f=await paymentAmountFixture();f.cart.payment_collection.amount=1;await assert.rejects(()=>normalizeQuotedPaymentCollection(f.current(),f.scope));assert.equal(f.writes.length,0);
});
test("conditional update failure or lost lease rolls back both amount representations",async()=>{
  for(const kind of ["miss","abort","native_mismatch"]){
    const f=await paymentAmountFixture(),before=structuredClone([f.cart,f.rawAmount]),controller=new AbortController();
    if(kind==="miss")f.noUpdate=true;else if(kind==="abort")f.onWrite=()=>controller.abort();else {const raw=f.db.raw;f.db.raw=async(sql,values)=>{const result=await raw(sql,values);if(sql.startsWith("select c.id,c.customer_id"))result.rows[0].collections[0].amount_cents="112.34";return result;};}
    await assert.rejects(()=>normalizeQuotedPaymentCollection(f.current(),f.scope,[controller.signal]));assert.deepEqual([f.cart,f.rawAmount],before);assert.equal(f.writes.length,0);
  }
  const f=await paymentAmountFixture(),controller=new AbortController();controller.abort();await assert.rejects(()=>normalizeQuotedPaymentCollection(f.current(),f.scope,[controller.signal]));assert.equal(f.writes.length,0);
});
test("expired historical proof supports GET-only cancellation recovery without current tax setup",async()=>{
  const f=await paymentAmountFixture();await createDurableCartPayment(f.current(),f.scope,[],f.writer);f.proofPatch={database_now:f.quote.expires_at+1};
  const blockedScope={resolve:key=>key==="snowforce_tax_setup_reader"?assert.fail("Historical recovery must not require current tax setup"):f.scope.resolve(key)};
  let reads=0;const result=await recoverCanceledCartPayment(f.current(),blockedScope,[],{livemode:false,retrieveIntent:async id=>{reads++;return {...await f.writer.retrieveIntent(id),status:"canceled"};}});
  assert.deepEqual(result,{unlocked:true});assert.equal(reads,1);assert.equal(f.retired,true);assert.equal(f.row.status,"canceled");assert.equal(f.writer.calls.length,1);
});
test("fractional cart totals cannot gain permission from forged, missing or inconsistent private quotes",async()=>{
  for(const kind of ["metadata","owner","signature","private","snapshot","state"]){const f=await paymentAmountFixture();
    if(kind==="metadata")f.cart.metadata={};if(kind==="owner")f.cart.customer_id="cus_other";if(kind==="signature")f.cart.metadata.snowforce_tax_quote.signature="a".repeat(64);
    if(kind==="private")f.proofPatch={receipt:{...f.receipt,total_cents:11234}};if(kind==="snapshot")f.proofPatch={snapshot:{...f.quote,amounts:{...f.quote.amounts,total_cents:11234}}};if(kind==="state")f.proofPatch={operation_state:"pending"};
    await assert.rejects(()=>readRecordedCartPaymentCents(f.db,f.current()));await assert.rejects(()=>normalizeQuotedPaymentCollection(f.current(),f.scope));assert.equal(f.writes.length,0);
  }
});
test("payment guard requires exact provider money, not rounded collection or session amounts",async()=>{
  const f=await paymentAmountFixture();await createDurableCartPayment(f.current(),f.scope,[],f.writer);
  assert.throws(()=>assertPaymentMatches(f.current()));assert.throws(()=>assertPaymentMatches(f.current(),11234));
  for(const kind of ["collection","session"]){const value=f.current();if(kind==="collection")value.payment_collection.amount+=.001;else value.payment_collection.payment_sessions[0].amount+=.001;assert.throws(()=>assertPaymentMatches(value,11235));}
  f.cart.payment_collection.amount+=.001;await assert.rejects(()=>readNativePaymentRecovery(f.db,f.current()));
});
