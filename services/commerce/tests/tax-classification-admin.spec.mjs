import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { productFixture, codeFixture } from "./fixtures/tax-classification.mjs";
const require = createRequire(import.meta.url), workspaceRequire = createRequire(new URL("../../../package.json",import.meta.url));
const { JSDOM } = workspaceRequire("jsdom"), dom = new JSDOM("<!doctype html><html><body></body></html>",{ url:"http://localhost:9000/app/snowforce-tax" });
for (const key of ["window","document","HTMLElement","Node","MutationObserver"]) globalThis[key]=key === "window" ? dom.window : key === "document" ? dom.window.document : dom.window[key];
globalThis.getComputedStyle=dom.window.getComputedStyle; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(globalThis,"navigator",{ value:dom.window.navigator,configurable:true });
require("ts-node/register/transpile-only");
const React=require("react"), { createRoot }=require("react-dom/client"), tax=require("../src/lib/tax-classification.ts"), Page=require("../src/admin/routes/snowforce-tax/page.tsx").default;
const response=(body,status=200)=>new Response(JSON.stringify(body),{ status,headers:{"Content-Type":"application/json"} });
const source=productFixture();
const record=()=>({ id:source.id,title:source.title,status:"draft",variant_count:1,source_fingerprint:tax.taxProductFingerprint(source),state:null,ready:false,unsupported:false });
const page=(products=[record()])=>({ products,count:products.length,offset:0,limit:50 });
function saved(body) { const state=tax.applyTaxClassification(null,source,body,codeFixture(),"user_fixture","2026-10-02T18:00:00.000Z").state; return { product:{...record(),state,ready:true},applied_revision:1,replayed:false }; }
async function mount(t,handler) {
  const calls=[],previous=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{ const call={ url,body:options.body?JSON.parse(options.body):undefined };calls.push(call);return handler(call,calls); };
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  t.after(async()=>{ await React.act(async()=>root.unmount());container.remove();globalThis.fetch=previous; });
  await React.act(async()=>root.render(React.createElement(Page)));
  const element=id=>{const value=container.querySelector(`#${id}`);assert.ok(value,`Missing ${id}`);return value;};
  const button=text=>{const value=[...container.querySelectorAll("button")].find(item=>item.textContent.includes(text));assert.ok(value,`Missing ${text}`);return value;};
  return { container,calls,element,button,async click(text){await React.act(async()=>button(text).click());},async input(id,value){await React.act(async()=>{const field=element(id);const prototype=field.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:field.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,"value").set.call(field,value);field.dispatchEvent(new dom.window.Event(field.tagName==="SELECT"?"change":"input",{bubbles:true}));});},async fill(){await this.click("Load official categories");await this.input("tax-code",codeFixture().id);await this.input("tax-note","Reviewed fixture physical merchandise and all variants.");await React.act(async()=>this.element("tax-confirm").click());} };
}
const defaultHandler=call=>call.url.includes("/codes")?response({codes:[codeFixture()],fetched_at:"2026-10-02T18:00:00.000Z"}):call.body?response(saved(call.body)):response(page());
test("Admin loads product drafts without automatically writing settings or selecting a tax code",async t=>{
  const app=await mount(t,defaultHandler);assert.equal(app.calls.length,1);assert.ok(app.container.textContent.includes("Saving a classification does not enable"));assert.equal(app.button("Save review").disabled,true);assert.equal(app.container.querySelector("#tax-code"),null);
  await app.click("Load official categories");assert.equal(app.element("tax-code").value,"");assert.ok(app.element("tax-code").textContent.includes(codeFixture().name));assert.ok(app.calls.every(call=>!call.body));
});
test("Admin validates review, saves once and displays authoritative review history",async t=>{
  const app=await mount(t,defaultHandler);await app.fill();assert.equal(app.button("Save review").disabled,false);
  await app.click("Save review");assert.equal(app.calls.filter(call=>call.body).length,1);const command=app.calls.find(call=>call.body).body;
  assert.equal(command.confirm_review,true);assert.equal(command.expected_revision,0);assert.equal(command.tax_code,codeFixture().id);assert.equal(command.source_fingerprint,record().source_fingerprint);
  assert.ok(app.container.textContent.includes("Review saved."));assert.ok(app.container.textContent.includes("user_fixture"));assert.equal(app.element("tax-confirm").checked,false);
});
test("uncertain save locks editing and retries the exact same command and UUID",async t=>{
  let posts=0;const app=await mount(t,call=>{if(call.body){if(++posts===1)throw new Error("network failure");return response({...saved(call.body),replayed:true});}return defaultHandler(call);});
  await app.fill();await app.click("Save review");assert.ok(app.container.textContent.includes("Save outcome is unknown"));assert.equal(app.element("tax-product").disabled,true);assert.equal(app.element("tax-note").disabled,true);assert.equal(app.button("Reload").disabled,true);
  await app.click("Retry save");const attempts=app.calls.filter(call=>call.body);assert.deepEqual(attempts[0],attempts[1]);assert.ok(app.container.textContent.includes("Review saved."));
});
test("a stale save is not claimed successful and reload uses the actual new product fingerprint",async t=>{
  let conflict=false;const updated={...record(),source_fingerprint:"a".repeat(64)};
  const app=await mount(t,call=>{if(call.body){conflict=true;return response({},409);}if(conflict&&!call.url.includes("/codes"))return response(page([updated]));return defaultHandler(call);});
  await app.fill();await app.click("Save review");assert.ok(app.container.textContent.includes("Reload and review again"));assert.ok(!app.container.textContent.includes("Review saved."));assert.equal(app.element("tax-confirm").checked,false);
  await app.click("Reload");await app.input("tax-code",codeFixture().id);await app.input("tax-note","Reviewed edited fixture after its content changed.");await React.act(async()=>app.element("tax-confirm").click());await app.click("Save review");assert.equal(app.calls.filter(call=>call.body)[1].body.source_fingerprint,updated.source_fingerprint);
});
test("mismatched successful response remains uncertain and cannot silently switch products",async t=>{
  const app=await mount(t,call=>call.body?response({...saved(call.body),product:{...saved(call.body).product,id:"prod_other"}}):defaultHandler(call));await app.fill();await app.click("Save review");assert.ok(app.container.textContent.includes("Save outcome is unknown"));assert.ok(!app.container.textContent.includes("Review saved."));assert.equal(app.element("tax-product").value,source.id);
});
test("catalog failure and unsupported product never allow saving or invent a fallback category",async t=>{
  const app=await mount(t,call=>call.url.includes("/codes")?response({},503):response(page([{...record(),unsupported:true}])));await app.click("Load official categories");assert.ok(app.container.textContent.includes("Check the commerce Stripe configuration"));assert.equal(app.container.querySelector("#tax-code"),null);assert.equal(app.button("Save review").disabled,true);assert.ok(app.calls.every(call=>!call.body));
});
