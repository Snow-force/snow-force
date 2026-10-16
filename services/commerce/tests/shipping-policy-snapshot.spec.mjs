import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {fixture} from './fixtures/tax-source.mjs';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const {readCartShippingPolicy,readCartShippingPolicySnapshot}=require('../src/lib/shipping-coverage.ts');

test('shipping snapshot rejects incomplete cart and malformed option before resolving data',async()=>{
  const {cart}=fixture(),scope={resolve:()=>assert.fail('must not resolve data')};
  for(const patch of [{shipping_address:null},{shipping_methods:[]},{shipping_methods:[{shipping_option_id:'so_bad-id'}]}])await assert.rejects(()=>readCartShippingPolicySnapshot({...cart,...patch},scope));
});

test('real PostgreSQL shipping snapshot preserves native coverage, pricing and soft deletion checks in one read',async()=>{
  const pg=new PGlite(),f=fixture(),queries=[];
  const db={raw:(sql,values=[])=>{queries.push(sql);let index=0;return pg.query(sql.replace(/\?/g,()=>'$'+(++index)),values);}};
  const scope={resolve:key=>key==='__pg_connection__'?db:assert.fail('unexpected dependency')};
  try{
    await pg.exec(`create schema commerce;
      create table commerce.shipping_option(id text,provider_id text,price_type text,shipping_option_type_id text,service_zone_id text,deleted_at text);
      create table commerce.shipping_option_type(id text,code text,deleted_at text);
      create table commerce.service_zone(id text,deleted_at text);
      create table commerce.geo_zone(id text,type text,country_code text,province_code text,service_zone_id text,deleted_at text);
      create table commerce.shipping_option_price_set(shipping_option_id text,price_set_id text,deleted_at text);
      create table commerce.price_set(id text,deleted_at text);
      create table commerce.price(id text,price_set_id text,currency_code text,amount numeric,deleted_at text);
      create table commerce.price_rule(id text,price_id text,attribute text,operator text,value text,deleted_at text);
      insert into commerce.shipping_option values('so_fixture','snowforce_us_snowforce','calculated','sotype_fixture','serzo_fixture',null);
      insert into commerce.shipping_option_type values('sotype_fixture','snowforce-us-standard',null);
      insert into commerce.service_zone values('serzo_fixture',null);
      insert into commerce.geo_zone values('geo_fixture','province','us','ca','serzo_fixture',null);
      insert into commerce.shipping_option_price_set values('so_fixture','ps_fixture',null);
      insert into commerce.price_set values('ps_fixture',null);
      insert into commerce.price values('price_base','ps_fixture','usd',9.95,null),('price_free','ps_fixture','usd',0,null);
      insert into commerce.price_rule values('prule_fixture','price_free','item_total','gte','100',null);`);
    const native=await readCartShippingPolicy(f.cart,f.scope);
    assert.deepEqual(await readCartShippingPolicySnapshot(f.cart,scope),native);
    assert.equal(queries.length,1);
    for(const table of ['shipping_option','shipping_option_type','service_zone','geo_zone','shipping_option_price_set','price_set','price','price_rule']){
      await pg.exec('begin');
      try{await pg.exec('update commerce.'+table+" set deleted_at='retired'");await assert.rejects(()=>readCartShippingPolicySnapshot(f.cart,scope),table+' deletion must not be ignored');}
      finally{await pg.exec('rollback');}
    }
    for(const sql of ["update commerce.shipping_option set provider_id='other'","update commerce.shipping_option set price_type='flat'","update commerce.shipping_option_type set code='other'","update commerce.geo_zone set province_code='ny'","update commerce.geo_zone set country_code='ca'","update commerce.price set currency_code='cad'","update commerce.price_rule set operator='lte'","insert into commerce.price values('price_extra','ps_fixture','usd',5,null)"]){
      await pg.exec('begin');try{await pg.exec(sql);await assert.rejects(()=>readCartShippingPolicySnapshot(f.cart,scope));}finally{await pg.exec('rollback');}
    }
    await pg.exec("update commerce.price set amount=10 where id='price_base'; update commerce.price_rule set value='125'");
    assert.deepEqual(await readCartShippingPolicySnapshot(f.cart,scope),{fee_cents:1000,free_threshold_cents:12500},'each check sees current native prices');
    await pg.exec("insert into commerce.price values('price_retired','ps_fixture','cad',100,'retired'); insert into commerce.geo_zone values('geo_retired','province','ca','on','serzo_fixture','retired')");
    assert.deepEqual(await readCartShippingPolicySnapshot(f.cart,scope),{fee_cents:1000,free_threshold_cents:12500});
    await assert.rejects(()=>readCartShippingPolicySnapshot({...f.cart,shipping_methods:[{shipping_option_id:'so_missing'}]},scope));
    await assert.rejects(()=>readCartShippingPolicySnapshot(f.cart,{resolve:()=>({raw:async()=>({rows:[{option:f.option},{option:f.option}]})})}));
  }finally{await pg.close();}
});
