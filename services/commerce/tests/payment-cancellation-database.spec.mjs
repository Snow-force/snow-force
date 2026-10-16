import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const {ContainerRegistrationKeys}=require('@medusajs/framework/utils');
const {previewCartCancellation,cancelUnpaidCartPayment}=require('../src/lib/payment-cancellation.ts');
const {recoverCanceledCartPayment}=require('../src/lib/payment-recovery.ts');
test('real PostgreSQL cancellation evidence survives recovery, repeated requests and historic link retirement',async()=>{
 const pg=new PGlite();let depth=0,cancelCalls=0,status='requires_payment_method';
 try{
  await pg.exec(`create schema commerce;
   create table commerce.cart(id text primary key,customer_id text,currency_code text,completed_at timestamptz,deleted_at timestamptz,updated_at timestamptz default now());
   create table commerce.order_cart(cart_id text);
   create table commerce.payment(id text,payment_collection_id text);
   create table commerce.payment_collection(id text primary key,currency_code text,amount numeric,status text,completed_at timestamptz,authorized_amount numeric default 0,captured_amount numeric default 0,refunded_amount numeric default 0,deleted_at timestamptz);
   create table commerce.cart_payment_collection(id text primary key,cart_id text,payment_collection_id text,deleted_at timestamptz,updated_at timestamptz default now());
   create table commerce.payment_session(id text primary key,payment_collection_id text,provider_id text,currency_code text,amount numeric,raw_amount jsonb,status text,authorized_at timestamptz,data jsonb,metadata jsonb default '{}'::jsonb,deleted_at timestamptz,updated_at timestamptz default now());
   insert into commerce.cart(id,customer_id,currency_code) values('cart_fixture','cus_fixture','usd');
   insert into commerce.payment_collection(id,currency_code,amount,status) values('paycol_fixture','usd',100,'not_paid');
   insert into commerce.cart_payment_collection(id,cart_id,payment_collection_id) values('link_fixture','cart_fixture','paycol_fixture');
   insert into commerce.payment_session(id,payment_collection_id,provider_id,currency_code,amount,raw_amount,status,data,metadata) values
    ('payses_fixture','paycol_fixture','pp_stripe_stripe','usd',100,'{"value":"100","precision":20}','pending','{"id":"pi_fixture","livemode":false,"amount":10000,"metadata":{"session_id":"payses_fixture"}}','{"existing_history":"preserved"}');`);
  function adapter(connection){return{raw:(sql,values=[])=>{let i=0;return connection.query(sql.replace(/\?/g,()=>'$'+(++i)),values);},transaction:cb=>connection.transaction(async tx=>{depth++;try{return await cb(adapter(tx));}finally{depth--;}})};}
  const db=adapter(pg),scope={resolve:key=>{assert.equal(key,ContainerRegistrationKeys.PG_CONNECTION);return db;}};
  const cart={id:'cart_fixture',customer_id:'cus_fixture',currency_code:'usd',region_id:'reg_fixture',email:'fixture@example.test',completed_at:null,total:100,subtotal:100,tax_total:0,shipping_total:0,discount_total:0,item_total:100,item_tax_total:0,shipping_address:null,shipping_methods:[],items:[],payment_collection:{id:'paycol_fixture',amount:100,currency_code:'usd',payment_sessions:[{id:'payses_fixture',provider_id:'pp_stripe_stripe',amount:100,currency_code:'usd',status:'pending',data:{id:'pi_fixture',livemode:false}}]}};
  const remote=()=>({id:'pi_fixture',currency:'usd',livemode:false,amount:10000,capture_method:'manual',status,amount_received:0,amount_capturable:0,metadata:{session_id:'payses_fixture'},latest_charge:null});
  const writer={livemode:false,account:async()=>({id:'acct_fixture'}),retrieveIntent:async()=>{assert.equal(depth,0);return remote();},cancelIntent:async()=>{assert.equal(depth,0);cancelCalls++;status='canceled';return remote();}};
  const preview=await previewCartCancellation(cart,scope,[],writer);assert.equal(preview.status,'confirmation-required');
  assert.deepEqual(await cancelUnpaidCartPayment(cart,scope,preview.token,[],writer),{status:'canceled'});
  const saved=await pg.query('select data,metadata,amount,raw_amount,status from commerce.payment_session');assert.equal(saved.rows[0].status,'pending');assert.equal(saved.rows[0].metadata.existing_history,'preserved');assert.equal(saved.rows[0].metadata.snowforce_cart_cancellation.phase,'canceled');assert.equal(saved.rows[0].metadata.snowforce_cart_cancellation.amount_cents,10000);
  assert.deepEqual(await recoverCanceledCartPayment(cart,scope,[],writer),{unlocked:true});
  await pg.exec(`update commerce.payment_session set metadata=jsonb_set(metadata,'{snowforce_cart_cancellation,phase}','"reserved"'::jsonb)`);
  assert.deepEqual(await cancelUnpaidCartPayment({...cart,payment_collection:null},scope,preview.token,[],writer),{status:'canceled'});
  assert.equal(cancelCalls,1);
  const final=await pg.query('select s.id,s.data,s.metadata,s.status,l.deleted_at from commerce.payment_session s join commerce.cart_payment_collection l on l.payment_collection_id=s.payment_collection_id');
  assert.equal(final.rows.length,1);assert.equal(final.rows[0].status,'canceled');assert.ok(final.rows[0].deleted_at);assert.deepEqual(final.rows[0].data,saved.rows[0].data);assert.equal(final.rows[0].metadata.existing_history,'preserved');
  await pg.exec("insert into commerce.order_cart(cart_id) values('cart_fixture')");
  assert.notEqual((await cancelUnpaidCartPayment({...cart,payment_collection:null},scope,preview.token,[],writer)).status,'canceled');assert.equal(cancelCalls,1);
 }finally{await pg.close();}
});
