import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),workspaceRequire=createRequire(new URL('../../../package.json',import.meta.url));
const {JSDOM}=workspaceRequire('jsdom'),dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:9000/app/snowforce-tax-sales'});
for(const key of ['window','document','HTMLElement','Node','MutationObserver'])globalThis[key]=key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key];
globalThis.getComputedStyle=dom.window.getComputedStyle;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});require('ts-node/register/transpile-only');
const React=require('react'),{createRoot}=require('react-dom/client'),Page=require('../src/admin/routes/snowforce-tax-sales/page.tsx').default;
const task={id:'123e4567-e89b-42d3-a456-426614174099',order_id:'order_sale',state:'reconcile_required',attempts:3,total_cents:10995,livemode:false,transaction_id:'tax_sale',created_at:'2026-10-02T12:00:00Z',updated_at:'2026-10-02T12:00:00Z',error_code:'request_aged'};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function mount(t,handler){
  const calls=[],old=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls.push({url,options});return handler(calls.at(-1),calls.length)};
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  t.after(async()=>{await React.act(async()=>root.unmount());container.remove();globalThis.fetch=old});
  await React.act(async()=>root.render(React.createElement(Page)));
  return {container,calls,refresh:async()=>React.act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.includes('Refresh')).click()),submit:async()=>React.act(async()=>container.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))};
}
test('sale admin shows exact USD and staff-only existing-transaction reconciliation, including a prefilled ID',async t=>{
  const app=await mount(t,async call=>call.options.method==='POST'?response({status:'ready'}):response({tasks:[task],unrecorded_orders:[{order_id:'order_partial'}]}));
  assert.match(app.container.textContent,/\$109\.95/);assert.match(app.container.textContent,/Sandbox/);assert.match(app.container.textContent,/Review required/);assert.equal(app.container.querySelector('input').value,'tax_sale');
  assert.equal(app.calls[0].options.cache,'no-store');assert.equal(app.calls[0].options.credentials,'include');
  assert.match(app.container.textContent,/order_partial/);assert.match(app.container.textContent,/Captured orders awaiting tax tasks/);
  await app.submit();assert.equal(app.calls[1].url,`/admin/snowforce/tax/sales/${task.id}`);assert.deepEqual(JSON.parse(app.calls[1].options.body),{transaction_id:'tax_sale'});assert.match(app.container.textContent,/Existing tax sale verified/);
});
test('failed refresh removes stale sale results and ready or running tasks cannot be manually resolved',async t=>{
  const app=await mount(t,async(_call,n)=>n===2?response({},503):response({tasks:[{...task,state:'ready',error_code:null}],unrecorded_orders:[]}));
  assert.equal(app.container.querySelectorAll('form').length,0);await app.refresh();assert.match(app.container.textContent,/could not be loaded/);assert.doesNotMatch(app.container.textContent,/order_sale/);await app.refresh();assert.match(app.container.textContent,/Recorded/);
});
test('unsuccessful reconciliation reports review required without suggesting another tax creation',async t=>{
  const app=await mount(t,async call=>call.options.method==='POST'?response({status:'reconcile_required'}):response({tasks:[task],unrecorded_orders:[]}));await app.submit();assert.match(app.container.textContent,/Review the account, sale and line amounts/);assert.equal(app.calls.filter(c=>c.options.method==='POST').length,1);
});
