import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const rootRequire = createRequire(new URL("../../../package.json", import.meta.url));
const { JSDOM } = rootRequire("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:9000/app/snowforce-after-sales" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
require("ts-node/register/transpile-only");
const React = require("react"), { createRoot } = require("react-dom/client");
const Page = require("../src/admin/routes/snowforce-after-sales/page.tsx").default;
const key = "22222222-2222-4222-8222-222222222222";
function fixture({ exception = true, reason = "size", status = "pending" } = {}) {
  return { request: { id: key, order_id: "order_fixture", kind: "return", reason, description: "Please review my gear return.", status, version: 1, customer_message: "", internal_note: "", items: [{ id: "ordli_fixture", quantity: 1 }], return_carrier: "", return_tracking_number: "", created_at: "2026-10-22T08:00:00.000Z", native_id: null }, funds: null, candidates: [], items: [{ id: "ordli_fixture", quantity: 1, title: "Gear", variant: "M" }], timing: { policyVersion: 1, returnWindowDays: 30, approvedDispatchDays: 14, requestedOn: "2026-10-22", requiresException: exception, dispatchBy: status === "approved" ? "2026-11-05" : null, lines: [{ id: "ordli_fixture", status: exception ? "expired" : "within_window", earliestDeadline: "2026-10-20", latestDeadline: "2026-10-20" }] } };
}
const ok = data => new Response(JSON.stringify(data), { status: 200 });
async function mount(t, data, mutate = () => ok({})) {
  const previousFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "POST") { const body = JSON.parse(options.body); calls.push(body); return mutate(body); }
    if(url.endsWith("/refunds"))return ok({case_id:key,version:data.request.version,can_prepare:false,execution_enabled:false,items:[],shipping_available:false,fees:[],plans:[]});
    return url.includes("?status=") ? ok({ requests: [data.request], count: 1 }) : ok(data);
  };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); globalThis.fetch = previousFetch; });
  await React.act(async () => root.render(React.createElement(Page)));
  const button = text => { const match = [...container.querySelectorAll("button")].find(value => value.textContent.includes(text)); assert.ok(match, text); return match; };
  const click = async value => { await React.act(async () => value.click()); };
  await click(button("Please review my gear return."));
  return { calls, container, button, click, async edit(id, value) { const field = container.querySelector(`#${id}`); assert.ok(field, id); await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(field, value); field.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); } };
}
test("ordinary expiry is visible and approval requires a fresh exception checkbox and a reason", async t => {
  const ui = await mount(t, fixture());
  assert.match(ui.container.textContent, /Purchase policy v1/); assert.match(ui.container.textContent, /2026-10-20/);
  await ui.edit("review-message", "Please follow these return instructions.");
  assert.equal(ui.button("Approve").disabled, true); assert.equal(ui.button("Decline").disabled, false);
  await ui.click(ui.container.querySelector("#policy-exception")); assert.equal(ui.button("Approve").disabled, true);
  await ui.edit("review-note", "Courtesy exception after checking delivery records."); assert.equal(ui.button("Approve").disabled, false);
  await ui.click(ui.button("Approve"));
  assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].policyException, true); assert.equal(ui.calls[0].version, 1);
  assert.match(ui.calls[0].internalNote, /Courtesy/);
});
test("an ordinary timely request needs no exception; a decline never submits one", async t => {
  const ui = await mount(t, fixture({ exception: false }));
  assert.equal(ui.container.querySelector("#policy-exception"), null);
  await ui.edit("review-message", "Approved within the original window."); await ui.click(ui.button("Approve"));
  assert.equal(ui.calls[0].policyException, false);
});
test("quality cases explain preserved rights and approved cases show dispatch evidence instructions", async t => {
  const ui = await mount(t, fixture({ exception: false, reason: "quality", status: "approved" }));
  assert.match(ui.container.textContent, /consumer rights/); assert.match(ui.container.textContent, /2026-11-05/);
  assert.match(ui.container.textContent, /tracking entry alone is not proof/);
  assert.equal(ui.container.querySelector("#policy-exception"), null);
});
test("refresh after a server conflict clears a previous exception confirmation", async t => {
  const ui = await mount(t, fixture(), () => new Response("{}", { status: 409 }));
  await ui.edit("review-message", "Please return the gear as agreed.");
  await ui.edit("review-note", "Approved a courtesy exception."); await ui.click(ui.container.querySelector("#policy-exception"));
  await ui.click(ui.button("Approve")); assert.ok(ui.container.querySelector('[role="alert"]'));
  await ui.click(ui.button("Please review my gear return."));
  assert.equal(ui.container.querySelector("#policy-exception").checked, false); assert.equal(ui.button("Approve").disabled, true);
});
test("declining an overdue request does not send the checked approval exception", async t => {
  const ui = await mount(t, fixture()); await ui.edit("review-message", "The ordinary window has ended.");
  await ui.click(ui.container.querySelector("#policy-exception")); await ui.click(ui.button("Decline"));
  assert.equal(ui.calls[0].decision, "rejected"); assert.equal(ui.calls[0].policyException, false);
});
test("approved exceptions remain readable in the staff review record", async t => {
  const data = fixture({ status: "approved" });
  data.request.internal_note = "[Purchase-policy exception approved by staff]\nCourtesy exception for a delayed carrier delivery.";
  const ui = await mount(t, data);
  assert.match(ui.container.textContent, /Internal review note/);
  assert.match(ui.container.textContent, /Courtesy exception for a delayed carrier delivery/);
  assert.equal(ui.container.querySelector("#policy-exception"), null);
});

test("processing explains individual refunds and tax completion, submits versioned completion and stays open on conflict",async t=>{
  const ui=await mount(t,fixture({status:"processing"}),()=>new Response("{}",{status:409}));
  assert.match(ui.container.textContent,/each Stripe refund, native bookkeeping and tax reversal/);
  assert.match(ui.container.textContent,/equal-value exchanges need no cash refund/);
  assert.match(ui.container.textContent,/all received units/);
  assert.equal(ui.button("Verify and complete").disabled,true);
  await ui.edit("review-message","Return received, refunded and tax reversed.");await ui.click(ui.button("Verify and complete"));
  assert.deepEqual(ui.calls,[{command:"complete",version:1,message:"Return received, refunded and tax reversed."}]);
  assert.match(ui.container.querySelector('[role="alert"]').textContent,/individual refunds\/tax reversals/);assert.ok(ui.button("Verify and complete"));
});
