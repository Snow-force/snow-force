import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const express=require('express'),{MedusaError}=require('@medusajs/framework/utils');
const {errorHandler,getHttpResponseFromError}=require('../node_modules/@medusajs/framework/dist/http/middlewares/error-handler.js');
const {createCartEditPost}=require('../src/api/store/snowforce/checkout/[id]/edit/route.ts');
const originalMessage='Check the current quote and payment before changing this cart.';
test('real Medusa HTTP error handling preserves the explicit checkout lock contract',async()=>{
 const original=new MedusaError(MedusaError.Types.CONFLICT,originalMessage);
 assert.notEqual(getHttpResponseFromError(original).body.message,originalMessage);
 const app=express();app.use(express.json());let mode='locked',calls=0;
 app.use((req,_res,next)=>{req.scope={resolve:()=>({info:()=>{},error:()=>{}})};next();});
 const handler=createCartEditPost(async()=>{calls++;if(mode==='locked')throw original;if(mode==='unauthorized')throw new MedusaError(MedusaError.Types.UNAUTHORIZED,'Sign in through SnowForce.');if(mode==='unavailable')throw Error('private database failure');return{status:'editable',quote_removed:true,review_required:true};});
 app.post('/store/snowforce/checkout/:id/edit',(req,res,next)=>void handler(req,res).catch(next));app.use(errorHandler());
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const url=`http://127.0.0.1:${server.address().port}/store/snowforce/checkout/cart_fixture/edit`;
  async function send(body={}){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};}
  assert.deepEqual(await send(),{status:409,body:{code:'checkout_locked',type:'conflict',message:originalMessage}});
  assert.equal((await send({intentId:'pi_other'})).status,400);assert.equal(calls,1);
  mode='unauthorized';const unauthorized=await send();assert.equal(unauthorized.status,401);assert.equal(unauthorized.body.code,undefined);
  mode='unavailable';const failed=await send();assert.equal(failed.status,500);assert.notEqual(failed.body.code,'checkout_locked');assert.ok(!JSON.stringify(failed).includes('private database'));
  mode='editable';assert.deepEqual((await send()).body,{status:'editable',quote_removed:true,review_required:true});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
