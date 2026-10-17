import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const {createShippingOptionsGet}=require('../src/api/store/snowforce/checkout/[id]/shipping-options/route.ts');
const provider='snowforce_us_snowforce';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const priced=(id='so_delivery',amount=9.95)=>({id,name:'Delivery',calculated_price:{calculated_amount:amount},private_data:'omit'});
const priorFlags=new WeakMap();
function fixture(t,{flag='true',delivery=[{id:'so_delivery',provider_id:provider}],owner='cus_owner'}={}){
  if(!priorFlags.has(t)){const prior=process.env.COMMERCE_SHIPPING_PARALLEL_READS;priorFlags.set(t,prior);t.after(()=>{if(prior===undefined)delete process.env.COMMERCE_SHIPPING_PARALLEL_READS;else process.env.COMMERCE_SHIPPING_PARALLEL_READS=prior;priorFlags.delete(t);});}
  process.env.COMMERCE_SHIPPING_PARALLEL_READS=flag;
  const events=[],f={events,response:null};
  f.req={method:'GET',path:'/store/snowforce/checkout/cart_fixture/shipping-options',params:{id:'cart_fixture'},query:{},auth_context:{actor_id:owner},scope:{resolve:()=>({graph:async input=>{events.push(input.entity);return{data:input.entity==='cart'?[{id:'cart_fixture',customer_id:'cus_owner'}]:delivery};}})}};
  f.res={json:value=>{f.response=value;return value;}};
  return f;
}

test('self-fulfillment inventory and pricing run concurrently and return only their eligible intersection',{timeout:5000},async t=>{
  const f=fixture(t,{delivery:[{id:'so_delivery',provider_id:provider},{id:'so_soldout',provider_id:provider}]}),inventory=deferred(),pricing=deferred(),started=deferred();let priceCalls=0;
  const task=createShippingOptionsGet({list:async()=>{f.events.push('inventory');return inventory.promise;},price:async(_scope,id,ids)=>{priceCalls++;assert.equal(id,'cart_fixture');assert.deepEqual(ids,['so_delivery','so_soldout']);f.events.push('pricing');started.resolve();return pricing.promise;}})(f.req,f.res);
  await started.promise;assert.equal(f.response,null);assert.equal(f.events[0],'cart');
  inventory.resolve([{id:'so_delivery',insufficient_inventory:false},{id:'so_pickup',insufficient_inventory:false},{id:'so_soldout',insufficient_inventory:true}]);
  assert.equal(f.response,null);pricing.resolve([priced(),priced('so_pickup'),priced('so_soldout')]);await task;
  assert.equal(priceCalls,1);assert.deepEqual(f.response,{shipping_options:[{id:'so_delivery',name:'Delivery',calculated_price:{currency_code:'usd',calculated_amount:9.95}}]});
});

test('disabled or non-exact flags retain serial pricing of only inventory-eligible delivery IDs',async t=>{
  for(const flag of ['false','TRUE','1','']){
    const f=fixture(t,{flag}),inventory=deferred();let inventoryDone=false,priceCalls=0;
    const task=createShippingOptionsGet({list:async()=>{await inventory.promise;inventoryDone=true;return[{id:'so_delivery',insufficient_inventory:false}];},price:async(_scope,_id,ids)=>{priceCalls++;assert.equal(inventoryDone,true);assert.deepEqual(ids,['so_delivery']);return[priced()];}})(f.req,f.res);
    await new Promise(setImmediate);assert.equal(priceCalls,0);inventory.resolve();await task;
    assert.equal(f.response.shipping_options.length,1);
  }
});

test('unknown, missing or mixed providers never begin speculative pricing',async t=>{
  for(const delivery of [[{id:'so_delivery',provider_id:'carrier_external'}],[{id:'so_delivery'}],[{id:'so_delivery',provider_id:provider},{id:'so_external',provider_id:'carrier_external'}]]){
    const f=fixture(t,{delivery}),inventory=deferred(),started=deferred();let priceCalls=0,inventoryDone=false;
    const task=createShippingOptionsGet({list:async()=>{started.resolve();const value=await inventory.promise;inventoryDone=true;return value;},price:async(_scope,_id,ids)=>{priceCalls++;assert.equal(inventoryDone,true);assert.deepEqual(ids,['so_delivery']);return[priced()];}})(f.req,f.res);
    await started.promise;await new Promise(setImmediate);assert.equal(priceCalls,0);
    inventory.resolve([{id:'so_delivery',insufficient_inventory:false}]);await task;assert.equal(priceCalls,1);
  }
});

test('all parallel reads settle and no prices are exposed when inventory is insufficient',async t=>{
  const f=fixture(t),pricing=deferred(),started=deferred();
  const task=createShippingOptionsGet({list:async()=>[{id:'so_delivery',insufficient_inventory:true}],price:async()=>{started.resolve();await pricing.promise;throw Error('private price error');}})(f.req,f.res);
  await started.promise;assert.equal(f.response,null);pricing.resolve();await task;assert.deepEqual(f.response,{shipping_options:[]});
});

test('inventory and pricing errors retain their identity and cannot return partial delivery options',async t=>{
  for(const failed of ['inventory','pricing']){
    const f=fixture(t),failure=new Error('private '+failed);
    const task=createShippingOptionsGet({list:async()=>{if(failed==='inventory')throw failure;return[{id:'so_delivery',insufficient_inventory:false}];},price:async()=>{if(failed==='pricing')throw failure;return[priced()];}})(f.req,f.res);
    await assert.rejects(task,error=>error===failure);assert.equal(f.response,null);
  }
});

test('anonymous and foreign customers are rejected before any workflow or delivery lookup',async t=>{
  for(const actor of [undefined,'cus_foreign']){
    const f=fixture(t,{owner:actor});if(actor===undefined)delete f.req.auth_context;let calls=0;
    await assert.rejects(()=>createShippingOptionsGet({list:async()=>{calls++;return[];},price:async()=>{calls++;return[];}})(f.req,f.res));assert.equal(calls,0);assert.ok(!f.events.includes('shipping_option'));assert.equal(f.response,null);
  }
});

test('missing delivery configuration preserves an empty response without pricing',async t=>{
  const f=fixture(t,{delivery:[]});let calls=0;
  await createShippingOptionsGet({list:async()=>[{id:'so_pickup',insufficient_inventory:false}],price:async()=>{calls++;return[];}})(f.req,f.res);
  assert.equal(calls,0);assert.deepEqual(f.response,{shipping_options:[]});
});

test('malformed inventory, prices and negative amounts fail closed',async t=>{
  for(const [listing,prices]of [[[{id:'so_delivery'}],[priced()]],[null,[priced()]],[ [{id:'so_delivery',insufficient_inventory:false}],[priced('so_delivery',-1)]],[ [{id:'so_delivery',insufficient_inventory:false}],[{id:'so_delivery',name:'Delivery',calculated_price:null}]]]){
    const f=fixture(t);await assert.rejects(()=>createShippingOptionsGet({list:async()=>listing,price:async()=>prices})(f.req,f.res));assert.equal(f.response,null);
  }
});

test('a failed delivery lookup observes an already-started inventory rejection without returning data',async t=>{
  const f=fixture(t),inventory=deferred(),failure=new Error('private configuration failure');let calls=0;
  f.req.scope={resolve:()=>({graph:async input=>{if(input.entity==='cart')return{data:[{id:'cart_fixture',customer_id:'cus_owner'}]};throw failure;}})};
  await assert.rejects(()=>createShippingOptionsGet({list:async()=>{await inventory.promise;throw Error('private inventory failure');},price:async()=>{calls++;return[];}})(f.req,f.res),error=>error===failure);
  inventory.resolve();await new Promise(setImmediate);assert.equal(calls,0);assert.equal(f.response,null);
});
