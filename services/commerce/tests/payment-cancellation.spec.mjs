import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const service=require('../src/lib/payment-cancellation.ts');
const Stripe=require('stripe');
const {checkoutCartSchema}=require('../src/lib/checkout-policy.ts');
const {ContainerRegistrationKeys}=require('@medusajs/framework/utils');
function fixture(){
 const cart=checkoutCartSchema.parse({id:'cart_fixture',customer_id:'cus_fixture',currency_code:'usd',region_id:'reg_fixture',email:'fixture@example.test',completed_at:null,total:100,subtotal:100,tax_total:0,shipping_total:0,discount_total:0,item_total:100,item_tax_total:0,shipping_address:null,shipping_methods:[],items:[],payment_collection:{id:'paycol_fixture',amount:100,currency_code:'usd',payment_sessions:[{id:'payses_fixture',amount:100,currency_code:'usd',provider_id:'pp_stripe_stripe',status:'pending',data:{id:'pi_fixture',livemode:false,amount:10000}}]}});
 const native={id:cart.id,customer_id:cart.customer_id,currency_code:'usd',completed:false,updated_at:'2026-10-01T00:00:00.000Z',has_order:false,has_payment:false,has_authorization:false,collections:[{id:'paycol_fixture',link_id:'capaycol_fixture',currency_code:'usd',amount_cents:'100',status:'not_paid',completed:false,authorized_cents:'0',captured_cents:'0',refunded_cents:'0',sessions:[{id:'payses_fixture',provider_id:'pp_stripe_stripe',currency_code:'usd',amount_cents:'100',status:'pending',authorized:false,intent_id:'pi_fixture',livemode:false,data_session_id:'payses_fixture',data_amount_cents:10000,data_fingerprint:'a'.repeat(32),raw_amount_fingerprint:'b'.repeat(32),updated_at:'2026-10-01T00:00:00.000Z'}]}]};
 let operation=null,depth=0,remote={id:'pi_fixture',currency:'usd',livemode:false,amount:10000,capture_method:'manual',status:'requires_payment_method',amount_received:0,amount_capturable:0,metadata:{session_id:'payses_fixture'},latest_charge:null};
 const writes=[],cancelCalls=[],gets=[],sqls=[];
 const f={cart,native,writes,cancelCalls,gets,sqls,get remote(){return remote;},set remote(x){remote=x;},get operation(){return operation;},set operation(x){operation=x;},get depth(){return depth;},accountId:'acct_fixture',readFailure:false,cancelTimeout:false,afterCancel:null,beforeRead:null};
 const db={transaction:async cb=>{const original=structuredClone(operation),count=writes.length;depth++;try{return await cb(db);}catch(e){operation=original;writes.length=count;throw e;}finally{depth--; }},raw:async(sql,values=[])=>{
  sqls.push(sql);
  if(sql.startsWith('select c.id,c.customer_id'))return{rows:[structuredClone(native)]};
  if(sql.startsWith('select s.metadata'))return{rows:operation?[{operation}]:[]};
  if(sql.startsWith('select metadata->'))return{rows:[{operation}]};
  if(sql.endsWith('for update')){assert.equal(depth,1);return{rows:[{id:values[0]}]};}
  if(sql.startsWith('update commerce.payment_session')){if(sql.includes("jsonb_set(metadata,")){operation={...operation,phase:'canceled'};}else{assert.equal(depth,1);operation=JSON.parse(values[0]);}writes.push([sql,values]);return{rows:[{id:'payses_fixture'}]};}
  throw Error('Unexpected SQL');
 }};
 f.scope={resolve:key=>{assert.equal(key,ContainerRegistrationKeys.PG_CONNECTION);return db;}};
 f.writer={livemode:false,account:async()=>{assert.equal(depth,0);return{id:f.accountId};},retrieveIntent:async id=>{assert.equal(depth,0);gets.push(id);f.beforeRead?.(gets.length);if(f.readFailure)throw Error('network');return structuredClone(remote);},cancelIntent:async(id,key)=>{assert.equal(depth,0);cancelCalls.push([id,key]);remote={...remote,status:'canceled'};f.afterCancel?.();if(f.cancelTimeout)throw Error('response lost');return remote;}};
 return f;
}
const preview=f=>service.previewCartCancellation(f.cart,f.scope,[],f.writer);
const cancel=(f,token,signals=[])=>service.cancelUnpaidCartPayment(f.cart,f.scope,token,signals,f.writer);
test('preview uses owned native binding and returns only an opaque confirmation and exact money',async()=>{
 const f=fixture(),r=await preview(f);assert.equal(r.status,'confirmation-required');assert.equal(r.amountCents,10000);assert.match(r.token,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(r).sort(),['amountCents','currency','status','token']);assert.equal(f.writes.length,0);assert.equal(f.cancelCalls.length,0);
});
test('unfunded states cancel with a durable reservation and stable server session key',async()=>{
 for(const status of ['requires_payment_method','requires_confirmation','requires_action']){
  const f=fixture();f.remote.status=status;const p=await preview(f);assert.equal((await cancel(f,p.token)).status,'canceled');assert.equal(f.operation.phase,'canceled');assert.deepEqual(f.cancelCalls,[['pi_fixture','snowforce-cart-cancel:payses_fixture']]);assert.equal(f.writes[0][1][0].includes('"phase":"reserved"'),true);assert.equal(f.writes.length,2);assert.ok(!JSON.stringify(f.writes).includes('client_secret'));
 }
});
test('a repeat after remote cancellation never calls cancel twice or overwrites its original evidence',async()=>{
 const f=fixture(),p=await preview(f);await cancel(f,p.token);const created=f.operation.created_at;assert.equal((await cancel(f,p.token)).status,'canceled');assert.equal(f.cancelCalls.length,1);assert.equal(f.operation.created_at,created);assert.equal(f.operation.phase,'canceled');
});
test('lost cancel response is reconciled by GET of the same intent',async()=>{
 const f=fixture(),p=await preview(f);f.cancelTimeout=true;assert.equal((await cancel(f,p.token)).status,'canceled');assert.equal(f.cancelCalls.length,1);assert.ok(f.gets.every(id=>id==='pi_fixture'));
});
test('an uncertain external result preserves reservation and blocks native recovery',async()=>{
 const f=fixture(),p=await preview(f);f.afterCancel=()=>{f.readFailure=true;};assert.deepEqual(await cancel(f,p.token),{status:'pending',code:'verification-unavailable'});assert.equal(f.operation.phase,'reserved');f.readFailure=false;assert.equal((await cancel(f,p.token)).status,'canceled');assert.equal(f.cancelCalls.length,1);
});
test('a cancellation that did not happen remains pending and can reuse the same idempotency key',async()=>{
 const f=fixture(),p=await preview(f);f.writer.cancelIntent=async(id,key)=>{f.cancelCalls.push([id,key]);throw Error('network before commit');};assert.equal((await cancel(f,p.token)).status,'pending');assert.equal(f.operation.phase,'reserved');assert.equal((await cancel(f,p.token)).status,'pending');assert.equal(f.cancelCalls[0][1],f.cancelCalls[1][1]);
});
test('processing, authorized, captured, paid and refunded evidence never invokes cancellation',async()=>{
 const charge={id:'ch_fixture',paid:false,captured:false,refunded:false,amount_captured:0,amount_refunded:0,status:'failed'};
 for(const mutation of [{status:'processing'},{status:'requires_capture',amount_capturable:10000},{status:'succeeded',amount_received:10000},{amount_received:1},{latest_charge:{...charge,paid:true}},{latest_charge:{...charge,captured:true}},{latest_charge:{...charge,refunded:true}},{latest_charge:{...charge,amount_captured:1}},{latest_charge:{...charge,amount_refunded:1}},{latest_charge:{...charge,status:'pending'}}]){
  const f=fixture(),p=await preview(f);Object.assign(f.remote,mutation);assert.equal((await cancel(f,p.token)).status,'blocked');assert.equal(f.cancelCalls.length,0);assert.equal(f.writes.length,0);
 }
});
test('failed unfunded alternative-method charges use provider IDs without assuming a ch prefix',async()=>{
 const f=fixture();f.remote.latest_charge={id:'py_fixture',paid:false,captured:false,refunded:false,amount_captured:0,amount_refunded:0,status:'failed'};
 const p=await preview(f);assert.equal(p.status,'confirmation-required');assert.equal((await cancel(f,p.token)).status,'canceled');assert.equal(f.cancelCalls.length,1);
});
test('payment changes immediately before cancel and cancel-confirm races do not permit recovery',async()=>{
 const f=fixture(),p=await preview(f);f.beforeRead=n=>{if(n===3)f.remote.status='processing';};assert.equal((await cancel(f,p.token)).status,'blocked');assert.equal(f.cancelCalls.length,0);
 const race=fixture(),q=await preview(race);race.afterCancel=()=>{race.remote.latest_charge={id:'ch_fixture',paid:true,captured:false,refunded:false,amount_captured:0,amount_refunded:0,status:'succeeded'};};assert.deepEqual(await cancel(race,q.token),{status:'blocked',code:'payment-authorized'});assert.equal(race.operation.phase,'reserved');
});
test('stale tokens and replacement session/intent cannot cancel a different payment',async()=>{
 const f=fixture(),p=await preview(f);assert.deepEqual(await cancel(f,'b'.repeat(64)),{status:'blocked',code:'checkout-changed'});assert.equal(f.cancelCalls.length,0);
 f.native.collections[0].sessions[0].intent_id='pi_replacement';f.cart.payment_collection.payment_sessions[0].data.id='pi_replacement';assert.equal((await cancel(f,p.token)).status,'blocked');assert.equal(f.cancelCalls.length,0);
});
test('remote amount, currency, mode, session, capture mode and unknown charge evidence fail closed',async()=>{
 for(const change of [{amount:9999},{currency:'eur'},{livemode:true},{id:'pi_foreign'},{metadata:{session_id:'payses_foreign'}},{capture_method:'automatic'},{latest_charge:'ch_unexpanded'}]){
  const f=fixture(),p=await preview(f);Object.assign(f.remote,change);assert.ok(['blocked','pending'].includes((await cancel(f,p.token)).status));assert.equal(f.cancelCalls.length,0);assert.equal(f.writes.length,0);
 }
});
test('native orders, funds, authorization and ownership anomalies cannot write or cancel',async()=>{
 for(const mutation of [{has_order:true},{has_payment:true},{has_authorization:true},{completed:true},{customer_id:'cus_foreign'},{id:'cart_foreign'}]){
  const f=fixture(),p=await preview(f);Object.assign(f.native,mutation);assert.notEqual((await cancel(f,p.token)).status,'canceled');assert.equal(f.cancelCalls.length,0);assert.equal(f.writes.length,0);
 }
});
test('historical retry after link retirement verifies the exact persisted operation and current account',async()=>{
 const f=fixture(),p=await preview(f);await cancel(f,p.token);f.native.collections=[];f.cart.payment_collection=null;assert.equal((await cancel(f,p.token)).status,'canceled');assert.equal(f.cancelCalls.length,1);f.accountId='acct_foreign';assert.equal((await cancel(f,p.token)).status,'blocked');
});
test('recovery by a different request can retire a remotely canceled reserved operation',async()=>{
 const f=fixture(),p=await preview(f);await cancel(f,p.token);f.operation={...f.operation,phase:'reserved'};f.native.collections=[];f.cart.payment_collection=null;assert.deepEqual(await cancel(f,p.token),{status:'canceled'});assert.equal(f.operation.phase,'canceled');assert.equal(f.cancelCalls.length,1);
});
test('a cancellation operation freezes payment preparation until native recovery retires its collection',()=>{
 const f=fixture();assert.equal(service.paymentCancellationPending(f.cart),false);f.cart.payment_collection.payment_sessions[0].metadata={snowforce_cart_cancellation:{phase:'reserved'}};assert.equal(service.paymentCancellationPending(f.cart),true);f.cart.payment_collection=null;assert.equal(service.paymentCancellationPending(f.cart),false);
});
test('no payment is editable for preview but cannot accept a forged historical cancellation',async()=>{
 const f=fixture();f.native.collections=[];f.cart.payment_collection=null;assert.deepEqual(await preview(f),{status:'editable'});assert.equal((await cancel(f,'a'.repeat(64))).status,'blocked');assert.equal(f.cancelCalls.length,0);
});
test('a changed durable operation and expired leases stop before external cancellation',async()=>{
 const f=fixture(),p=await preview(f);f.operation={version:1,token:p.token,cart_id:f.cart.id,customer_id:'cus_other',session_id:'payses_fixture',intent_id:'pi_fixture',account_id:'acct_fixture',livemode:false,amount_cents:10000,currency:'usd',phase:'reserved',created_at:new Date().toISOString()};assert.equal((await cancel(f,p.token)).status,'blocked');assert.equal(f.cancelCalls.length,0);
 const expired=fixture(),q=await preview(expired);assert.equal((await cancel(expired,q.token,[AbortSignal.abort()])).status,'pending');assert.equal(expired.cancelCalls.length,0);
});
test('writer uses the configured account, expanded charge evidence and a stable cancel request',async()=>{
 const old=process.env.COMMERCE_STRIPE_API_KEY,sdk=new Stripe('sk_test_fixture'),pi=sdk.paymentIntents.constructor.prototype,accounts=sdk.accounts.constructor.prototype;
 const originals=[pi.retrieve,pi.cancel,accounts.retrieveCurrent],calls=[];
 try{pi.retrieve=async(...args)=>{calls.push(['get',...args]);return{};};pi.cancel=async(...args)=>{calls.push(['cancel',...args]);return{};};accounts.retrieveCurrent=async(...args)=>{calls.push(['account',...args]);return{id:'acct_fixture'};};process.env.COMMERCE_STRIPE_API_KEY='rk_test_fixture';const writer=service.createCancellationWriter();assert.equal(writer.livemode,false);await writer.account();await writer.retrieveIntent('pi_fixture');await writer.cancelIntent('pi_fixture','same-key');assert.deepEqual(calls,[['account'],['get','pi_fixture',{expand:['latest_charge']}],['cancel','pi_fixture',{cancellation_reason:'requested_by_customer'},{idempotencyKey:'same-key'}]]);process.env.COMMERCE_STRIPE_API_KEY='rk_live_fixture';assert.equal(service.createCancellationWriter().livemode,true);delete process.env.COMMERCE_STRIPE_API_KEY;assert.throws(()=>service.createCancellationWriter());}
 finally{[pi.retrieve,pi.cancel,accounts.retrieveCurrent]=originals;if(old===undefined)delete process.env.COMMERCE_STRIPE_API_KEY;else process.env.COMMERCE_STRIPE_API_KEY=old;}
});
