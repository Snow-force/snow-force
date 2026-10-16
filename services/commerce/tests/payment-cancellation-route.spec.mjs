import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const {ContainerRegistrationKeys,Modules}=require('@medusajs/framework/utils');
const {createCancellationRoutes}=require('../src/api/store/snowforce/checkout/[id]/cancel/route.ts');
const {routes}=require('../src/api/middlewares.ts').default;
const {useManagementBoundary}=require('../src/api/management-boundary.ts');
test('cancel GET and POST require a registered customer bearer and stay closed in management mode',async()=>{
 const route=routes.find(row=>row.matcher==='/store/snowforce/checkout/:id/cancel');assert.deepEqual(route.methods,['GET','POST']);
 const jwt=require('jsonwebtoken'),secret='fixture-only-registered-customer-secret';
 for(const claims of [null,{actor_type:'user',actor_id:'user_fixture'},{actor_type:'customer',auth_identity_id:'auth_unregistered'},{actor_type:'customer',actor_id:'cus_fixture',auth_identity_id:'auth_fixture'}]){
  let status,continued=false;const req={headers:claims?{authorization:'Bearer '+jwt.sign(claims,secret)}:{},scope:{resolve:key=>key==='logger'?{debug:()=>{}}:{projectConfig:{http:{jwtSecret:secret}}}}};
  const res={status:code=>{status=code;return res;},json:()=>{}};
  await route.middlewares[0](req,res,()=>{continued=true;});
  assert.equal(continued,claims?.actor_id==='cus_fixture');if(!continued)assert.equal(status,401);
 }
 const saved=process.env.COMMERCE_OPERATING_MODE;process.env.COMMERCE_OPERATING_MODE='management';
 try{for(const method of route.methods)assert.throws(()=>useManagementBoundary({method,path:'/store/snowforce/checkout/cart_fixture/cancel'},{},()=>assert.fail('No financial route')),/administration only/);}
 finally{if(saved===undefined)delete process.env.COMMERCE_OPERATING_MODE;else process.env.COMMERCE_OPERATING_MODE=saved;}
});
function fixture(){
 const cart={id:'cart_fixture',customer_id:'cus_fixture',currency_code:'usd',region_id:'reg_fixture',email:'fixture@example.test',completed_at:null,total:100,subtotal:100,tax_total:0,shipping_total:0,discount_total:0,item_total:100,item_tax_total:0,shipping_address:null,shipping_methods:[],items:[],payment_collection:null};
 const calls=[],locks=[];let result;
 const f={cart,calls,locks,get result(){return result;},cancelResult:{status:'canceled'},recoverResult:{unlocked:true},withdrawFails:false,previewResult:{status:'confirmation-required',token:'a'.repeat(64),amountCents:10000,currency:'usd'}};
 const deps={preview:async(...args)=>{calls.push(['preview',...args]);return f.previewResult;},cancel:async(...args)=>{calls.push(['cancel',...args]);return f.cancelResult;},recover:async(...args)=>{calls.push(['recover',...args]);return f.recoverResult;},withdraw:async(...args)=>{assert.equal(locks.length,0);calls.push(['withdraw',...args]);if(f.withdrawFails)throw Error('retry');return{status:'editable'};}};
 const query={graph:async()=>({data:[cart]})};
 const locking={execute:async(key,fn,options)=>{locks.push(key);try{return await fn(new AbortController().signal);}finally{assert.equal(locks.pop(),key);assert.equal(options.expire,120);}}};
 const scope={resolve:key=>{if(key===ContainerRegistrationKeys.QUERY)return query;if(key===Modules.LOCKING)return locking;throw Error('Unexpected dependency');}};
 f.req={params:{id:cart.id},auth_context:{actor_type:'customer',actor_id:'cus_fixture'},scope,body:{token:'a'.repeat(64),confirmed:true}};
 f.res={json:value=>{result=value;return value;}};f.routes=createCancellationRoutes(deps);return f;
}
test('owned preview cannot cancel or mutate a payment',async()=>{const f=fixture();await f.routes.GET(f.req,f.res);assert.equal(f.result.status,'confirmation-required');assert.deepEqual(f.calls.map(x=>x[0]),['preview']);});
test('explicit current confirmation cancels, recovers under locks and withdraws the quote before editable',async()=>{const f=fixture();await f.routes.POST(f.req,f.res);assert.deepEqual(f.result,{status:'editable'});assert.deepEqual(f.calls.map(x=>x[0]),['cancel','recover','withdraw']);assert.equal(f.calls[0][3],'a'.repeat(64));assert.equal(f.calls[0][4].length,2);});
test('missing confirmation, arbitrary intent IDs and extra fields never reach financial operations',async()=>{for(const body of [{},{token:'a'.repeat(64),confirmed:false},{token:'a'.repeat(64),confirmed:true,intentId:'pi_foreign'},{token:'pi_foreign',confirmed:true}]){const f=fixture();f.req.body=body;await assert.rejects(()=>f.routes.POST(f.req,f.res));assert.equal(f.calls.length,0);}});
test('foreign and completed carts never reach cancellation',async()=>{const f=fixture();f.cart.customer_id='cus_foreign';await assert.rejects(()=>f.routes.POST(f.req,f.res));assert.equal(f.calls.length,0);const complete=fixture();complete.cart.completed_at='2026-10-01';await complete.routes.POST(complete.req,complete.res);assert.equal(complete.result.status,'blocked');assert.equal(complete.calls.length,0);});
test('blocked and uncertain provider results cannot run native recovery or quote withdrawal',async()=>{for(const result of [{status:'blocked',code:'payment-authorized'},{status:'blocked',code:'payment-processing'},{status:'pending',code:'verification-unavailable'}]){const f=fixture();f.cancelResult=result;await f.routes.POST(f.req,f.res);assert.deepEqual(f.result,result);assert.deepEqual(f.calls.map(x=>x[0]),['cancel']);}});
test('remote canceled but local recovery failure returns a recoverable pending result',async()=>{const f=fixture();f.recoverResult={unlocked:false};await f.routes.POST(f.req,f.res);assert.deepEqual(f.result,{status:'pending',code:'recovery-pending'});assert.deepEqual(f.calls.map(x=>x[0]),['cancel','recover']);});
test('quote withdrawal failure or a concurrent replacement payment does not claim editability',async()=>{const f=fixture();f.withdrawFails=true;await f.routes.POST(f.req,f.res);assert.deepEqual(f.result,{status:'pending',code:'recovery-pending'});f.withdrawFails=false;await f.routes.POST(f.req,f.res);assert.deepEqual(f.result,{status:'editable'});});
