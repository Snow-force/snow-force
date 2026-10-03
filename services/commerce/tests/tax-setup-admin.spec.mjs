import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupReaderFixture, setupTime } from "./fixtures/tax-setup.mjs";
const require=createRequire(import.meta.url),workspaceRequire=createRequire(new URL("../../../package.json",import.meta.url));
const {JSDOM}=workspaceRequire("jsdom"),dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost:9000/app/snowforce-tax-setup"});
for(const key of ["window","document","HTMLElement","Node","MutationObserver"])globalThis[key]=key==="window"?dom.window:key==="document"?dom.window.document:dom.window[key];
globalThis.getComputedStyle=dom.window.getComputedStyle;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(globalThis,"navigator",{value:dom.window.navigator,configurable:true});require("ts-node/register/transpile-only");
const React=require("react"),{createRoot}=require("react-dom/client"),setup=require("../src/lib/tax-setup.ts"),Page=require("../src/admin/routes/snowforce-tax-setup/page.tsx").default;
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const payload=async()=>({snapshot:await setup.readStripeTaxSetup(setupReaderFixture(),()=>setupTime),policy_confirmed:false,integration_ready:false,checkout_ready:false});
async function mount(t,handler) {
  const calls=[],previous=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls.push({url,options});return handler(calls.length);};
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  t.after(async()=>{await React.act(async()=>root.unmount());container.remove();globalThis.fetch=previous;});
  await React.act(async()=>root.render(React.createElement(Page)));
  return {container,calls,async reload(){await React.act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent.includes("Check again")).click());}};
}
test("admin tax setup shows actual mode and registrations without offering activation or writes",async t=>{
  const app=await mount(t,async()=>response(await payload()));
  assert.ok(app.container.textContent.includes("Sandbox"));assert.ok(app.container.textContent.includes("taxreg_fixture"));assert.ok(app.container.textContent.includes("checkout remains unavailable"));assert.ok(app.container.textContent.includes("confirmation pending"));
  assert.equal(app.container.querySelectorAll("input,select,textarea").length,0);assert.equal(app.calls[0].url,"/admin/snowforce/tax/setup");assert.equal(app.calls[0].options.cache,"no-store");assert.equal(app.calls[0].options.credentials,"include");
  assert.deepEqual([...app.container.querySelectorAll("a")].map(link=>link.href),["https://dashboard.stripe.com/settings/tax","https://dashboard.stripe.com/tax/locations"]);
  await app.reload();assert.equal(app.calls.length,2);assert.ok(app.calls.every(call=>!call.options.method&&!call.options.body));
});
test("failed refresh discards the previous ready snapshot and a retry can recover",async t=>{
  const app=await mount(t,async count=>count===2?response({},503):response(await payload()));
  await app.reload();assert.ok(app.container.textContent.includes("Verification failed"));assert.ok(!app.container.textContent.includes("taxreg_fixture"));
  await app.reload();assert.ok(app.container.textContent.includes("taxreg_fixture"));assert.ok(!app.container.textContent.includes("Verification failed"));
});
test("blocked and malformed successful responses cannot display a ready checkout",async t=>{
  const value=await payload();value.snapshot.registrations=[];value.snapshot.collecting_states=[];value.snapshot.api_ready=false;value.snapshot.blockers=["california_registration_required"];
  const app=await mount(t,async count=>response(count===1?value:{...value,checkout_ready:true}));
  assert.ok(app.container.textContent.includes("California sales-tax registration is missing"));assert.ok(app.container.textContent.includes("No registrations"));assert.ok(!app.container.textContent.includes("API setup passed"));
  await app.reload();assert.ok(app.container.textContent.includes("Verification failed"));assert.ok(!app.container.textContent.includes("Current review"));
});
