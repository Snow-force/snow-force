import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url),rootRequire=createRequire(new URL("../../../package.json",import.meta.url));
const {JSDOM}=rootRequire("jsdom"),dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost:9000/app/snowforce-after-sales"});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,"navigator",{value:dom.window.navigator,configurable:true});require("ts-node/register/transpile-only");
const React=require("react"),{createRoot}=require("react-dom/client"),Panel=require("../src/admin/components/refund-plans.tsx").default;
const key="123e4567-e89b-42d3-a456-426614174050";
const data=()=>({case_id:key,version:3,can_prepare:true,execution_enabled:false,items:[{item_id:"ordli_fixture",title:"Original gear",available_quantity:2}],shipping_available:true,fees:[],plans:[]});
async function mount(t,value,mutate=()=>new Response("{}",{status:200})){
  const previous=globalThis.fetch,calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url,...options});return options.method==="POST"?mutate(JSON.parse(options.body)):new Response(JSON.stringify(value),{status:200});};
  const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
  t.after(async()=>{await React.act(async()=>root.unmount());node.remove();globalThis.fetch=previous;});await React.act(async()=>root.render(React.createElement(Panel,{caseId:key})));
  const button=()=>node.querySelector("button"),edit=async(id,value)=>{const field=node.querySelector(`#${id}`);assert.ok(field,id);await React.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(field,value);field.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});};
  return{node,calls,button,edit,render:async caseId=>React.act(async()=>root.render(React.createElement(Panel,{caseId}))),click:async()=>React.act(async()=>button().click())};
}
test("refund preview explains inactive execution, enforces received quantities and never offers a cash-submit button",async t=>{
  const ui=await mount(t,data());assert.match(ui.node.textContent,/does not issue a refund/);assert.match(ui.node.textContent,/execution is not enabled/);assert.equal(ui.button().disabled,true);
  await ui.edit("refund-qty-ordli_fixture","3");assert.equal(ui.button().disabled,true);
  await ui.edit("refund-qty-ordli_fixture","1.1");assert.equal(ui.button().disabled,true);
  await ui.edit("refund-qty-ordli_fixture","1");assert.equal(ui.button().disabled,false);await ui.click();
  const post=ui.calls.find(call=>call.method==="POST"),body=JSON.parse(post.body);assert.equal(body.input.items[0].quantity,1);assert.equal(body.version,3);assert.equal("amount" in body,false);assert.equal(ui.node.querySelectorAll("button").length,1);
});
test("a lost response retries the same operation identity and reviewed input; changed selections get a fresh operation",async t=>{
  const ui=await mount(t,data(),()=>{throw Error("Fixture lost response");});await ui.edit("refund-qty-ordli_fixture","1");await ui.click();await ui.click();
  const posts=()=>ui.calls.filter(call=>call.method==="POST").map(call=>JSON.parse(call.body));assert.deepEqual(posts()[0],posts()[1]);
  await ui.edit("refund-qty-ordli_fixture","2");await ui.click();assert.notEqual(posts()[2].operation_id,posts()[0].operation_id);assert.ok(ui.node.querySelector('[role="alert"]'));
});
test("delivery fee decisions require a review rationale even when retained",async t=>{
  const value=data();value.fees=[{state:"CO",amount_cents:28}];const ui=await mount(t,value);await ui.edit("refund-qty-ordli_fixture","1");assert.equal(ui.button().disabled,true);
  await ui.edit("refund-fee-CO","Reviewed original delivery fee retention.");assert.equal(ui.button().disabled,false);await ui.click();
  const body=JSON.parse(ui.calls.find(call=>call.method==="POST").body);assert.equal(body.input.fee_decisions[0].refund,false);assert.match(body.input.fee_decisions[0].rationale,/Reviewed/);
});
test("stored plans show separate original goods, tax and shipping amounts and use private fresh reads",async t=>{
  const value=data();value.plans=[{id:key,state:"reserved",total_cents:1052,items:[{item_id:"ordli_fixture",quantity:1,net_cents:1000,sales_tax_cents:52}],shipping_cents:0,shipping_tax_cents:0,fees:[]}];
  const ui=await mount(t,value);assert.match(ui.node.textContent,/\$10.52/);assert.match(ui.node.textContent,/\$0.52/);assert.equal(ui.calls[0].credentials,"include");assert.equal(ui.calls[0].cache,"no-store");
});

test("enabled staff refund requires confirmation and posts only the immutable original plan",async t=>{
  const value=data();value.execution_enabled=true;value.items=[];value.plans=[{id:key,state:"reserved",allocation_fingerprint:"a".repeat(64),total_cents:1052,items:[{item_id:"ordli_fixture",quantity:1,net_cents:1000,sales_tax_cents:52}],shipping_cents:0,shipping_tax_cents:0,fees:[]}];
  const ui=await mount(t,value,()=>{value.executions=[{id:key,state:"ready",tax_state:"ready"}];return new Response("{}",{status:202});});
  const execute=()=>Array.from(ui.node.querySelectorAll("button")).find(button=>button.textContent.includes("Issue refund"));
  assert.ok(execute());assert.equal(execute().disabled,true);assert.doesNotMatch(ui.node.textContent,/execution is not enabled/);
  const check=Array.from(ui.node.querySelectorAll('input[type="checkbox"]')).find(input=>input.closest("label").textContent.includes("Confirm refund"));
  await React.act(async()=>check.click());assert.equal(execute().disabled,false);await React.act(async()=>execute().click());
  const posts=ui.calls.filter(call=>call.method==="POST");assert.equal(posts.length,1);assert.equal(posts[0].url,`/admin/snowforce/after-sales/${key}/refunds/${key}/execute`);
  assert.deepEqual(JSON.parse(posts[0].body),{version:3,allocation_fingerprint:"a".repeat(64),confirmed:true});
  assert.equal(execute(),undefined);assert.match(ui.node.textContent,/Tax reversal: ready/);
});

test("lost execution response retries the same reviewed plan without minting another operation",async t=>{
  const value=data();value.execution_enabled=true;value.items=[];value.plans=[{id:key,state:"started",allocation_fingerprint:"a".repeat(64),total_cents:1052,items:[],shipping_cents:0,shipping_tax_cents:0,fees:[]}];
  const ui=await mount(t,value,()=>{throw new Error("Fixture lost response");});
  const execute=()=>Array.from(ui.node.querySelectorAll("button")).find(button=>button.textContent.includes("Issue refund"));
  const check=Array.from(ui.node.querySelectorAll('input[type="checkbox"]')).find(input=>input.closest("label").textContent.includes("Confirm refund"));
  await React.act(async()=>check.click());await React.act(async()=>execute().click());await React.act(async()=>execute().click());
  const posts=ui.calls.filter(call=>call.method==="POST");assert.equal(posts.length,2);assert.equal(posts[0].url,posts[1].url);assert.equal(posts[0].body,posts[1].body);assert.ok(ui.node.querySelector('[role="alert"]'));
});

test("existing or malformed plans never offer another funds action",async t=>{
  const value=data();value.execution_enabled=true;value.plans=[{id:key,state:"started",allocation_fingerprint:"a".repeat(64),total_cents:1052,items:[],shipping_cents:0,shipping_tax_cents:0,fees:[]},{id:"bad",state:"reserved",allocation_fingerprint:"bad",total_cents:100,items:[],shipping_cents:0,shipping_tax_cents:0,fees:[]}];value.executions=[{id:key,state:"reconcile_required",tax_state:null}];
  const ui=await mount(t,value);assert.equal(Array.from(ui.node.querySelectorAll("button")).some(button=>button.textContent.includes("Issue refund")),false);assert.match(ui.node.textContent,/reconcile_required/);
});

test("switching after-sales cases aborts a pending funds command and ignores its late response",async t=>{
  const value=data();value.execution_enabled=true;value.items=[];value.plans=[{id:key,state:"reserved",allocation_fingerprint:"a".repeat(64),total_cents:1052,items:[],shipping_cents:0,shipping_tax_cents:0,fees:[]}];
  let finish;
  const ui=await mount(t,value,()=>new Promise(resolve=>{finish=resolve;}));
  const check=Array.from(ui.node.querySelectorAll('input[type="checkbox"]')).find(input=>input.closest("label").textContent.includes("Confirm refund"));
  await React.act(async()=>check.click());await React.act(async()=>Array.from(ui.node.querySelectorAll("button")).find(button=>button.textContent.includes("Issue refund")).click());
  const command=ui.calls.find(call=>call.method==="POST");assert.equal(command.signal.aborted,false);
  const next="123e4567-e89b-42d3-a456-426614174051";value.case_id=next;value.execution_enabled=false;value.plans=[];
  await ui.render(next);assert.equal(command.signal.aborted,true);
  const reads=ui.calls.length;
  await React.act(async()=>finish(new Response("{}",{status:202})));
  assert.equal(ui.calls.length,reads);assert.doesNotMatch(ui.node.textContent,/\$10.52/);assert.equal(ui.node.querySelector('[role="alert"]'),null);
});
