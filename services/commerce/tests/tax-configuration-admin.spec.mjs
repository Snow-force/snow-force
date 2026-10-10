import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { configuration, contract, warehouseFixture, shippingCodeFixture, businessPolicyMetadata, configuredMetadata } from "./fixtures/tax-configuration.mjs";

const require = createRequire(import.meta.url);
const workspaceRequire = createRequire(new URL("../../../package.json", import.meta.url));
const { JSDOM } = workspaceRequire("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:9000/app/snowforce-tax-configuration" });
for (const key of ["window", "document", "HTMLElement", "Node", "MutationObserver"]) {
  globalThis[key] = key === "window" ? dom.window : key === "document" ? dom.window.document : dom.window[key];
}
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
require("ts-node/register/transpile-only");
const React = require("react");
const { createRoot } = require("react-dom/client");
const Page = require("../src/admin/routes/snowforce-tax-configuration/page.tsx").default;
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function projection(state = configuration.initialTaxConfiguration("sloc_fixture"), persisted = false) {
  const store = { id: "store_fixture", metadata: { ...businessPolicyMetadata(), snowforce_fulfillment_location_id: "sloc_fixture" }, database_now: new Date().toISOString() };
  return { store_id: store.id, persisted, state, ...configuration.taxConfigurationResources(store, warehouseFixture()) };
}
function saved(previous, command) {
  const publication = configuredMetadata().snowforce_tax_configuration.publications[0];
  const { revision, reviewed_by, ...context } = publication;
  const result = configuration.applyTaxConfiguration(previous.state, command, "user_fixture", command.command === "activate" ? { ...context, content: previous.state.draft, source_fingerprint: command.source_fingerprint } : undefined);
  return { ...previous, persisted: true, ...result };
}
function handler(initial = projection()) {
  let current = initial;
  return call => {
    if (call.url.includes("/codes")) return response({ codes: [shippingCodeFixture()], fetched_at: new Date().toISOString() });
    if (call.body) current = saved(current, call.body);
    return response(current);
  };
}
async function mount(t, handle) {
  const calls = [], previous = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url, body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    return handle(call, calls);
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); globalThis.fetch = previous; });
  await React.act(async () => root.render(React.createElement(Page)));
  const element = id => { const field = container.querySelector(`#${id}`); assert.ok(field, `Missing ${id}`); return field; };
  const button = text => { const field = [...container.querySelectorAll("button")].find(item => item.textContent.includes(text)); assert.ok(field, `Missing ${text}`); return field; };
  return {
    container, calls, element, button,
    async click(text) { await React.act(async () => button(text).click()); },
    async check(id) { await React.act(async () => element(id).click()); },
    async input(id, value) {
      await React.act(async () => {
        const field = element(id);
        const prototype = field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : field.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value);
        field.dispatchEvent(new dom.window.Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      });
    },
    async fill() {
      await this.input("business-seller", "Fixture seller");
      await this.input("business-permit-type", "ongoing");
      await this.input("business-permit-from", "2025-01-01");
      await this.click("Load official categories");
      await this.input("business-shipping-code", shippingCodeFixture().id);
      await this.input("business-review-note", "Verified fixture business permit, obligations and shipping category conditions.");
      for (const id of ["business-permit", "business-obligations", "business-shipping-review"]) await this.check(id);
    }
  };
}

test("Admin initially reads an unconfirmed draft without writes or automatic shipping classification", async t => {
  const app = await mount(t, handler());
  assert.equal(app.calls.length, 1);
  assert.equal(app.element("business-seller").value, "");
  assert.equal(app.element("business-shipping-code").value, "");
  assert.ok(app.container.textContent.includes("1 Test Street"));
  for (const id of ["business-permit", "business-obligations", "business-shipping-review", "business-confirm"]) assert.equal(app.element(id).checked, false);
  assert.equal(app.button("Activate business tax configuration").disabled, true);
  await app.click("Save draft");
  assert.equal(app.calls.filter(call => call.body).length, 1);
  assert.ok(app.container.textContent.includes("Draft saved. Payment availability is unchanged."));
  assert.equal(app.button("Activate business tax configuration").disabled, true);
});
test("activation requires a saved complete draft and explicit final review; records authoritative history", async t => {
  const app = await mount(t, handler());
  await app.fill();
  assert.equal(app.element("business-confirm").disabled, true);
  await app.click("Save draft");
  assert.equal(app.button("Activate business tax configuration").disabled, true);
  await app.check("business-confirm");
  assert.equal(app.button("Activate business tax configuration").disabled, false);
  await app.click("Activate business tax configuration");
  const command = app.calls.filter(call => call.body)[1].body;
  assert.equal(command.command, "activate");
  assert.equal(command.expected_revision, 1);
  assert.equal(command.source_fingerprint, projection().source_fingerprint);
  assert.equal(command.confirm_review, true);
  assert.ok(app.container.textContent.includes("Checkout still requires complete tax and payment verification."));
  assert.ok(app.container.textContent.includes("user_fixture"));
  assert.equal(app.element("business-confirm").checked, false);
});
test("an uncertain write locks edits and retries the original command and UUID", async t => {
  const normal = handler();
  let posts = 0;
  const app = await mount(t, call => { if (call.body && ++posts === 1) { normal(call); throw new Error("connection lost after commit"); } return normal(call); });
  await app.fill(); await app.click("Save draft");
  assert.ok(app.container.textContent.includes("Outcome is unconfirmed"));
  assert.equal(app.element("business-seller").disabled, true);
  assert.equal(app.element("business-permit").disabled, true);
  assert.equal(app.button("Reload").disabled, true);
  await app.click("Retry original request");
  const attempts = app.calls.filter(call => call.body);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.ok(app.container.textContent.includes("Draft saved."));
});
test("a malformed or receipt-mismatched 200 response cannot claim success or unlock editing", async t => {
  const app = await mount(t, call => call.body ? response({ ...saved(projection(), call.body), state: { ...saved(projection(), call.body).state, receipts: [] } }) : response(projection()));
  await app.click("Save draft");
  assert.ok(app.container.textContent.includes("Outcome is unconfirmed"));
  assert.equal(app.element("business-review-note").disabled, true);
  assert.ok(!app.container.textContent.includes("Draft saved."));
});
test("conflict retains entered facts without claiming a saved draft; reload adopts current warehouse", async t => {
  let conflict = false;
  const app = await mount(t, call => {
    if (call.body) { conflict = true; return response({}, 409); }
    if (conflict) return response({ ...projection(), warehouse: { ...warehouseFixture(), address: { ...warehouseFixture().address, address_1: "Changed native address" } }, source_fingerprint: "a".repeat(64) });
    return handler()(call);
  });
  await app.fill(); await app.click("Save draft");
  assert.ok(app.container.textContent.includes("Data changed. Reload and review."));
  assert.equal(app.element("business-seller").value, "Fixture seller");
  assert.equal(app.button("Activate business tax configuration").disabled, true);
  await app.click("Reload");
  assert.ok(app.container.textContent.includes("Changed native address"));
  assert.equal(app.element("business-seller").value, "");
});
test("missing published seller, invalid warehouse or absent review cannot enable activation", async t => {
  const state = configuredMetadata().snowforce_tax_configuration;
  const invalid = { ...projection(state, true), policy_seller_name: null, policy_version: null, warehouse: { ...warehouseFixture(), address: { ...warehouseFixture().address, postal_code: "" } } };
  const app = await mount(t, handler(invalid));
  assert.equal(app.element("business-confirm").disabled, true);
  assert.equal(app.button("Activate business tax configuration").disabled, true);
});
test("official category failure does not choose a fallback or mutate configuration", async t => {
  const app = await mount(t, call => call.url.includes("/codes") ? response({}, 503) : response(projection()));
  await app.click("Load official categories");
  assert.ok(app.container.textContent.includes("Official shipping categories unavailable"));
  assert.equal(app.element("business-shipping-code").value, "");
  assert.ok(app.calls.every(call => !call.body));
  assert.equal(contract.adminTaxConfigurationSchema.safeParse(projection()).success, true);
});

test("expired temporary and undated permits cannot enable activation in the Admin form", async t => {
  const app = await mount(t, handler());
  await app.fill();
  await app.input("business-permit-type", "temporary");
  await app.input("business-permit-through", "2025-01-02");
  await app.click("Save draft");
  assert.equal(app.element("business-confirm").disabled, true);
  assert.equal(app.button("Activate business tax configuration").disabled, true);
  assert.equal(app.calls.filter(call => call.body?.command === "activate").length, 0);
  await app.input("business-permit-through", "2099-01-01");
  await app.input("business-permit-from", "");
  await app.click("Save draft");
  assert.equal(app.button("Activate business tax configuration").disabled, true);
});
