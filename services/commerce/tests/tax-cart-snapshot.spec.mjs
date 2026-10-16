import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {nativeCart} from './fixtures/tax-source.mjs';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const {readOwnedTaxCartSnapshot,OwnedTaxCartSnapshotMissingError}=require('../src/lib/tax-cart-sql.ts');
const {checkoutCartSchema,checkoutFingerprint,paymentStarted}=require('../src/lib/checkout-policy.ts');

test('snapshot identifiers are validated before resolving any database data',async()=>{
  const db={raw:()=>assert.fail('must not query')};
  for(const [cart,owner] of [['cart_bad-id','cus_fixture'],['cart_fixture','other'],['cart_fixture','cus_bad-id']])await assert.rejects(()=>readOwnedTaxCartSnapshot(db,cart,owner));
});

test('real PostgreSQL snapshot preserves native money, filters ownership and deleted rows, and never reads provider secrets',async()=>{
  const pg=new PGlite(),cart=nativeCart(110,10.005,9.95),clone=value=>structuredClone(value);
  await pg.exec('create schema commerce');
  async function table(name,row){
    assert.match(name,/^[a-z_]+$/);
    const entries=Object.entries(row);for(const [key] of entries)assert.match(key,/^[a-z_][a-z0-9_]*$/);
    const type=value=>typeof value==='number'?'numeric':typeof value==='boolean'?'boolean':value&&typeof value==='object'?'jsonb':'text';
    await pg.exec('create table commerce.'+name+'('+entries.map(([key,value])=>'"'+key+'" '+type(value)).join(',')+')');
    await pg.query('insert into commerce.'+name+' values('+entries.map((_,i)=>'$'+(i+1)).join(',')+')',entries.map(([,value])=>value&&typeof value==='object'?JSON.stringify(value):value));
  }
  try{
    const base=clone(cart);delete base.items;delete base.shipping_methods;delete base.shipping_address;delete base.payment_collection;
    await table('cart',{...base,shipping_address_id:'addr_fixture',deleted_at:null});
    await table('cart_address',{...cart.shipping_address,id:'addr_fixture',deleted_at:null});
    const item=clone(cart.items[0]);delete item.adjustments;delete item.tax_lines;
    await table('cart_line_item',{...item,cart_id:cart.id,deleted_at:null});
    await table('cart_line_item_adjustment',{...cart.items[0].adjustments[0],item_id:item.id,deleted_at:null});
    const shipping=clone(cart.shipping_methods[0]);delete shipping.adjustments;delete shipping.tax_lines;
    await table('cart_shipping_method',{...shipping,cart_id:cart.id,deleted_at:null});
    await pg.exec(`create table commerce.cart_line_item_tax_line(id text,item_id text,rate numeric,deleted_at text);
      create table commerce.cart_shipping_method_adjustment(id text,shipping_method_id text,amount numeric,deleted_at text);
      create table commerce.cart_shipping_method_tax_line(id text,shipping_method_id text,rate numeric,deleted_at text);
      create table commerce.credit_line(id text,cart_id text,amount numeric,deleted_at text);
      create table commerce.payment_collection(id text,amount numeric,currency_code text,metadata jsonb,deleted_at text);
      create table commerce.cart_payment_collection(cart_id text,payment_collection_id text,deleted_at text);
      create table commerce.payment_session(id text,payment_collection_id text,provider_id text,amount numeric,currency_code text,status text,data jsonb,metadata jsonb,deleted_at text);`);
    const queries=[];const db={raw:(sql,values=[])=>{queries.push(sql);let i=0;return pg.query(sql.replace(/\?/g,()=>'$'+(++i)),values);}};
    const snapshot=await readOwnedTaxCartSnapshot(db,cart.id,'cus_fixture');
    assert.equal(queries.length,1);assert.equal(checkoutFingerprint(checkoutCartSchema.parse(snapshot)),checkoutFingerprint(checkoutCartSchema.parse(cart)));
    assert.equal(snapshot.items[0].adjustments[0].amount,10.005);
    await assert.rejects(()=>readOwnedTaxCartSnapshot(db,cart.id,'cus_other'),OwnedTaxCartSnapshotMissingError);
    await pg.exec(`insert into commerce.payment_collection values('paycol_fixture',110,'usd','{"client_secret":"collection-must-not-leak"}',null);
      insert into commerce.cart_payment_collection values('cart_fixture','paycol_fixture',null);
      insert into commerce.payment_session values('payses_fixture','paycol_fixture','pp_stripe_stripe',110,'usd','pending','{"client_secret":"provider-must-not-leak"}','{"secret":"metadata-must-not-leak"}',null);`);
    for(const status of ['pending','authorized','captured','canceled','requires_more','error']){
      await pg.query('update commerce.payment_session set status=$1',[status]);
      const current=await readOwnedTaxCartSnapshot(db,cart.id,'cus_fixture');
      assert.equal(paymentStarted(checkoutCartSchema.parse(current)),true);
      assert.equal(current.payment_collection.payment_sessions[0].status,status);
      assert.equal(current.payment_collection.payment_sessions[0].data,null);assert.equal(current.payment_collection.payment_sessions[0].metadata,null);
      assert.ok(!JSON.stringify(current).includes('must-not-leak'));
    }
    await pg.exec("update commerce.payment_session set deleted_at='retired'");
    assert.equal(paymentStarted(checkoutCartSchema.parse(await readOwnedTaxCartSnapshot(db,cart.id,'cus_fixture'))),true,'retired sessions on an active link still prevent quoting');
    assert.ok(queries.every(sql=>!sql.includes('s.data')&&!sql.includes('s.metadata')&&!sql.includes('to_jsonb(p)')));
    await pg.exec("update commerce.cart_payment_collection set deleted_at='retired'; insert into commerce.credit_line values('credit_fixture','cart_fixture',1,null)");
    await assert.rejects(()=>readOwnedTaxCartSnapshot(db,cart.id,'cus_fixture'));
    await pg.exec("delete from commerce.credit_line; update commerce.cart_line_item_adjustment set deleted_at='retired'");
    const withoutDiscount=await readOwnedTaxCartSnapshot(db,cart.id,'cus_fixture');assert.equal(Number(withoutDiscount.discount_total),0);
    await pg.exec("update commerce.cart set deleted_at='retired'");await assert.rejects(()=>readOwnedTaxCartSnapshot(db,cart.id,'cus_fixture'));
  }finally{await pg.close();}
});
