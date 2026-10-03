import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const workspaceRequire = createRequire(new URL("../../../package.json", import.meta.url));
// The workspace already uses jsdom for its website UI tests; render the actual
// Medusa components with their own React 18 runtime, without mocking hooks/UI.
const { JSDOM } = workspaceRequire("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:9000/app/snowforce-policies" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
require("ts-node/register/transpile-only");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { initialShopPolicyState } = require("../src/lib/shop-policy.ts");
const Page = require("../src/admin/routes/snowforce-policies/page.tsx").default;

const clone = (value) => structuredClone(value);
function fixture({ persisted = true, complete = true } = {}) {
  const state = initialShopPolicyState();
  if (persisted) { state.revision = 1; state.draft.version = 1; state.draft.updated_at = "2026-10-01T18:00:00.000Z"; state.draft.updated_by = "staff_fixture"; }
  if (complete) {
    state.draft.content.seller_name = "Fixture Seller LLC";
    state.draft.content.customer_service_email = "support@example.com";
    state.draft.content.copy.consumer_rights = { zh: "本政策不限制法定消费者权利。请通过售后申请联系客服。", en: "This policy preserves statutory consumer rights. Contact support through your order request." };
  }
  return { store_id: "store_fixture", persisted, state };
}
function publicationResponse(base, request) {
  const result = clone(base);
  const version = request.expected_revision + 1;
  result.state.revision = version;
  result.state.draft.version = version;
  result.state.published_version = version;
  result.state.publications.push({ version, effective_at: "2026-10-01T19:00:00.000Z", published_at: "2026-10-01T19:00:00.000Z", published_by: "staff_fixture", content: clone(result.state.draft.content) });
  result.state.save_receipts.push({ request_id: request.request_id, digest: "0".repeat(64), revision: version });
  result.replayed = false;
  result.applied_revision = version;
  return result;
}
const ok = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
async function mount(t, handler) {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(url, "/admin/snowforce/policies");
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push(body);
    return handler(body, calls.length);
  };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); globalThis.fetch = previousFetch; });
  await React.act(async () => root.render(React.createElement(Page)));
  return {
    calls, container,
    button(label) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent.includes(label)); assert.ok(button, `Missing button: ${label}`); return button; },
    field(id) { const field = container.querySelector(`#${id}`); assert.ok(field, `Missing field: ${id}`); return field; },
    async click(element) { await React.act(async () => element.click()); },
    async edit(id, value) {
      const field = this.field(id);
      const prototype = field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      await React.act(async () => { Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value); field.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    },
  };
}

test("proposal defaults and incomplete seller details cannot publish, while blank drafts can be saved", async (t) => {
  let response = fixture({ persisted: false, complete: false });
  const ui = await mount(t, (body) => {
    if (!body) return ok(response);
    assert.equal(body.command, "save_draft");
    assert.equal(body.content.seller_name, "");
    response = { ...clone(response), persisted: true };
    response.state.revision = 1; response.state.draft.version = 1;
    return ok(response);
  });
  assert.equal(ui.button("Publish now").disabled, true);
  assert.equal(ui.field("policy-publication-review").disabled, true);
  await ui.click(ui.button("Save draft"));
  assert.equal(ui.calls.length, 2);
  assert.equal(ui.button("Publish now").disabled, true);
  assert.match(ui.container.textContent, /Draft saved/);
});

test("unsaved edits require a separate save and renewed bilingual/operational review", async (t) => {
  let response = fixture();
  const ui = await mount(t, (body) => {
    if (!body) return ok(response);
    assert.equal(body.command, "save_draft");
    response = clone(response); response.state.revision++; response.state.draft.version++;
    response.state.draft.content = clone(body.content);
    return ok(response);
  });
  await ui.click(ui.field("policy-publication-review"));
  assert.equal(ui.button("Publish now").disabled, false);
  await ui.edit("policy-requests-en", "Updated request conditions for the next publication.");
  assert.equal(ui.field("policy-publication-review").checked, false);
  assert.equal(ui.button("Publish now").disabled, true);
  await ui.click(ui.button("Publish now"));
  assert.equal(ui.calls.length, 1, "disabled publication must not save or publish edits");
  await ui.click(ui.button("Save draft"));
  assert.equal(ui.button("Publish now").disabled, true);
  assert.equal(ui.field("policy-publication-review").disabled, false);
  await ui.click(ui.field("policy-publication-review"));
  assert.equal(ui.button("Publish now").disabled, false);
});

test("the default consumer-rights placeholder must be completed even when seller details are present", async (t) => {
  const response = fixture({ complete: false });
  response.state.draft.content.seller_name = "Fixture Seller LLC";
  response.state.draft.content.customer_service_email = "support@example.com";
  const ui = await mount(t, () => ok(response));
  assert.equal(ui.field("policy-publication-review").disabled, true);
  assert.equal(ui.button("Publish now").disabled, true);
  assert.match(ui.container.textContent, /unfinished consumer-rights copy/);
  await ui.click(ui.button("Publish now"));
  assert.equal(ui.calls.filter(Boolean).length, 0);
});

test("publication sends only the saved revision and review confirmation, then shows its effective version", async (t) => {
  const response = fixture();
  const ui = await mount(t, (body) => {
    if (!body) return ok(response);
    assert.deepEqual(Object.keys(body).sort(), ["command", "confirm_review", "expected_revision", "request_id"]);
    assert.equal(body.command, "publish"); assert.equal(body.confirm_review, true); assert.equal(body.expected_revision, 1);
    assert.match(body.request_id, /^[a-f0-9-]{36}$/);
    return ok(publicationResponse(response, body));
  });
  await ui.click(ui.field("policy-publication-review"));
  await ui.click(ui.button("Publish now"));
  assert.match(ui.container.textContent, /Policy version 2 is effective/);
  assert.match(ui.container.textContent, /Published version: 2/);
  assert.equal(ui.button("Publish now").disabled, true);
  await ui.edit("policy-requests-zh", "后续尚未发布的草稿编辑。");
  assert.match(ui.container.textContent, /Published version: 2/);
  assert.equal(ui.button("Publish now").disabled, true);
  assert.equal(ui.calls.length, 2);
});

test("an uncertain network result locks editing and retries the original publication request", async (t) => {
  const response = fixture();
  let first;
  const ui = await mount(t, (body) => {
    if (!body) return ok(response);
    if (!first) { first = clone(body); throw new TypeError("Fixture connection interrupted"); }
    assert.deepEqual(body, first, "uncertain retry must preserve both request ID and expected revision");
    return ok({ ...publicationResponse(response, body), replayed: true });
  });
  await ui.click(ui.field("policy-publication-review"));
  await ui.click(ui.button("Publish now"));
  assert.match(ui.container.textContent, /Publication is unconfirmed/);
  assert.equal(ui.field("policy-seller").disabled, true);
  assert.equal(ui.button("Save draft").disabled, true);
  await ui.click(ui.button("Reload"));
  assert.equal(ui.field("policy-seller").disabled, true, "a read without a receipt cannot discard the uncertain request");
  await ui.click(ui.button("Retry publication"));
  assert.match(ui.container.textContent, /Policy version 2 is effective/);
  assert.equal(ui.field("policy-seller").disabled, false);
  assert.deepEqual(ui.calls.filter(Boolean), [first, first]);
});

test("reload confirms a lost response by its receipt and does not publish again", async (t) => {
  let response = fixture();
  const ui = await mount(t, (body) => {
    if (!body) return ok(response);
    response = publicationResponse(response, body);
    throw new TypeError("Fixture response lost after commit");
  });
  await ui.click(ui.field("policy-publication-review"));
  await ui.click(ui.button("Publish now"));
  await ui.click(ui.button("Reload"));
  assert.match(ui.container.textContent, /Policy version 2 is effective/);
  assert.equal(ui.field("policy-seller").disabled, false);
  assert.equal(ui.calls.filter(Boolean).length, 1);
});

test("server failures and a missing confirmation record keep the same publish key for retry", async (t) => {
  const response = fixture();
  let first;
  let attempts = 0;
  const ui = await mount(t, (body) => {
    if (!body) return ok(response);
    attempts++;
    if (!first) first = clone(body);
    assert.deepEqual(body, first);
    if (attempts === 1) return new Response("{}", { status: 503 });
    if (attempts === 2) return ok({ ...clone(response), applied_revision: 2 });
    return ok(publicationResponse(response, body));
  });
  await ui.click(ui.field("policy-publication-review"));
  await ui.click(ui.button("Publish now"));
  assert.equal(ui.field("policy-seller").disabled, true);
  await ui.click(ui.button("Retry publication"));
  assert.match(ui.container.textContent, /confirmation is missing/);
  assert.equal(ui.field("policy-seller").disabled, true);
  await ui.click(ui.button("Retry publication"));
  assert.match(ui.container.textContent, /Policy version 2 is effective/);
  assert.equal(ui.calls.filter(Boolean).length, 3);
});

test("a revision conflict requires fresh review and never silently saves or republishes", async (t) => {
  const response = fixture();
  const ui = await mount(t, (body) => body ? new Response("{}", { status: 409 }) : ok(response));
  await ui.click(ui.field("policy-publication-review"));
  await ui.click(ui.button("Publish now"));
  assert.match(ui.container.textContent, /Policy changed/);
  assert.equal(ui.field("policy-publication-review").checked, false);
  assert.equal(ui.field("policy-seller").disabled, false);
  assert.equal(ui.button("Publish now").disabled, true);
  assert.equal(ui.calls.filter(Boolean).length, 1);
});
