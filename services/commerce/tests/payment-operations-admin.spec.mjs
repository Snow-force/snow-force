import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";

const require = createRequire(import.meta.url), rootRequire = createRequire(new URL("../../../package.json", import.meta.url));
const { JSDOM } = rootRequire("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:9000/app/snowforce-payments" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
require("ts-node/register/transpile-only");
const React = require("react"), { createRoot } = require("react-dom/client");
const Page = require("../src/admin/routes/snowforce-payments/page.tsx").default;
const at = "2026-10-01T00:00:00.000Z";
const fixture = () => ({ id: "payses_fixture", collectionId: "paycol_fixture", cartId: "cart_fixture", customerId: "cus_fixture", amountCents: 2995, currency: "usd", status: "pending", createdAt: at, updatedAt: at, livemode: false, intentId: null, interrupted: true, expired: true, eligible: true, retired: false, fingerprint: "a".repeat(64), association: null });
const preview = record => ({ intentId: "pi_fixture", sessionId: record.id, amountCents: record.amountCents, livemode: record.livemode, status: "requires_payment_method", receivedCents: 0, capturableCents: 0, verifiedFingerprint: "b".repeat(64) });
const associated = record => ({ record: { ...record, intentId: "pi_fixture", interrupted: false, eligible: false, association: { actorId: "user_fixture", intentId: "pi_fixture", associatedAt: at } }, associated: true, replayed: false });
const ok = data => new Response(JSON.stringify(data), { status: 200 });
function deferred() { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; }
async function mount(t, handler, record = fixture()) {
  const calls = [], previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.credentials, "include");
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body, signal: options.signal });
    if (handler) { const result = await handler({ url, body, calls }); if (result !== undefined) return result; }
    return body ? ok({ record, preview: preview(record), associated: false }) : url.includes("?") ? ok({ records: [record], count: 1 }) : ok({ record });
  };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); let mounted = true;
  const ui = {
    calls, container,
    button(label) { const button = [...container.querySelectorAll("button")].find(value => value.textContent.includes(label)); assert.ok(button, label); return button; },
    field(id) { const field = container.querySelector(`#${id}`); assert.ok(field, id); return field; },
    async click(element) { await React.act(async () => element.click()); },
    async edit(id, value) {
      const field = this.field(id), prototype = field.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      await React.act(async () => { Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value); field.dispatchEvent(new dom.window.Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
    },
    async unmount() { if (mounted) { await React.act(async () => root.unmount()); mounted = false; } },
    async review() { await this.click(this.button(record.id)); await this.edit("payment-intent", "pi_fixture"); await this.click(this.button("Verify with Stripe")); },
  };
  t.after(async () => { await ui.unmount(); container.remove(); globalThis.fetch = previousFetch; });
  await React.act(async () => root.render(React.createElement(Page)));
  return ui;
}

test("the real admin component lists USD attempts, inspects first, and requires confirmation before association", async t => {
  const record = fixture();
  const ui = await mount(t, ({ body }) => body?.command === "associate" ? ok(associated(record)) : undefined, record);
  assert.match(ui.container.textContent, /\$29\.95/); assert.match(ui.container.textContent, /Manual review required/);
  assert.doesNotMatch(ui.container.textContent, /CNY|人民币|¥/);
  await ui.click(ui.button(record.id));
  assert.equal(ui.button("Verify with Stripe").disabled, true);
  await ui.edit("payment-intent", "pi_fixture"); await ui.click(ui.button("Verify with Stripe"));
  assert.equal(ui.calls.filter(call => call.body).length, 1); assert.equal(ui.calls.at(-1).body.command, "inspect");
  assert.equal(ui.button("Save association").disabled, true);
  await ui.click(ui.button("Save association")); assert.equal(ui.calls.filter(call => call.body).length, 1);
  await ui.click(ui.field("payment-confirm")); await ui.click(ui.button("Save association"));
  const body = ui.calls.filter(call => call.body).at(-1).body;
  assert.deepEqual(Object.keys(body).sort(), ["command", "confirmed", "fingerprint", "intentId", "requestId", "verifiedFingerprint"]);
  assert.equal(body.command, "associate"); assert.equal(body.confirmed, true); assert.match(body.requestId, /^[a-f0-9-]{36}$/);
  assert.match(ui.container.textContent, /Verified association saved/);
});

test("changing the candidate clears a previous verification and confirmation", async t => {
  const ui = await mount(t); await ui.review(); await ui.click(ui.field("payment-confirm"));
  assert.equal(ui.button("Save association").disabled, false);
  await ui.edit("payment-intent", "pi_other");
  assert.equal(ui.container.querySelector("#payment-confirm"), null);
  assert.ok(![...ui.container.querySelectorAll("button")].some(value => value.textContent.includes("Save association")));
  assert.equal(ui.calls.filter(call => call.body?.command === "associate").length, 0);
});

test("a lost response and incomplete success keep the same association request locked for safe retry", async t => {
  const record = fixture(); let attempt = 0, original;
  const ui = await mount(t, ({ body }) => {
    if (body?.command !== "associate") return undefined;
    attempt++; original ??= structuredClone(body); assert.deepEqual(body, original);
    if (attempt === 1) throw new TypeError("Fixture private credential must not reach UI");
    if (attempt === 2) return ok({ record });
    if (attempt === 3) return new Response("private server error", { status: 503 });
    return ok({ ...associated(record), replayed: true });
  }, record);
  await ui.review(); await ui.click(ui.field("payment-confirm")); await ui.click(ui.button("Save association"));
  assert.match(ui.container.textContent, /result is unconfirmed/i); assert.doesNotMatch(ui.container.textContent, /private credential/);
  for (const field of ["payment-intent", "payment-filter", "payment-confirm"]) assert.equal(ui.field(field).disabled, true);
  assert.equal(ui.button("Reload").disabled, true); assert.equal(ui.button("Verify with Stripe").disabled, true);
  await ui.click(ui.button("Retry association"));
  assert.equal(ui.field("payment-intent").disabled, true); assert.doesNotMatch(ui.container.textContent, /Verified association saved/);
  await ui.click(ui.button("Retry association"));
  assert.match(ui.container.textContent, /result is unconfirmed/i); assert.equal(ui.field("payment-intent").disabled, true); assert.doesNotMatch(ui.container.textContent, /private server error/);
  await ui.click(ui.button("Retry association"));
  assert.match(ui.container.textContent, /Verified association saved/); assert.equal(attempt, 4);
  assert.deepEqual(ui.calls.filter(call => call.body?.command === "associate").map(call => call.body), [original, original, original, original]);
});

test("a conflict clears confirmation and asks for a fresh review without trusting a server error body", async t => {
  const ui = await mount(t, ({ body }) => body?.command === "associate" ? new Response("secret-provider-error", { status: 409 }) : undefined);
  await ui.review(); await ui.click(ui.field("payment-confirm")); await ui.click(ui.button("Save association"));
  assert.match(ui.container.textContent, /Reload and verify again/); assert.doesNotMatch(ui.container.textContent, /secret-provider-error/);
  assert.equal(ui.container.querySelector("#payment-confirm"), null); assert.equal(ui.field("payment-intent").disabled, false);
  await ui.click(ui.button("Verify with Stripe"));
  assert.equal(ui.field("payment-confirm").checked, false); assert.equal(ui.button("Save association").disabled, true);
});

test("double clicks during a pending association send one command and preserve busy controls", async t => {
  const record = fixture(), pending = deferred();
  const ui = await mount(t, ({ body }) => body?.command === "associate" ? pending.promise : undefined, record);
  await ui.review(); await ui.click(ui.field("payment-confirm"));
  const save = ui.button("Save association");
  await React.act(async () => { save.click(); save.click(); });
  assert.equal(ui.calls.filter(call => call.body?.command === "associate").length, 1);
  assert.equal(ui.field("payment-filter").disabled, true); assert.equal(save.disabled, true);
  await React.act(async () => pending.resolve(ok(associated(record))));
  assert.match(ui.container.textContent, /Verified association saved/);
});

test("historic associated attempts are read-only and keep their staff audit visible", async t => {
  const record = associated(fixture()).record; record.retired = true;
  const ui = await mount(t, undefined, record); await ui.click(ui.button(record.id));
  assert.equal(ui.field("payment-intent").disabled, true); assert.equal(ui.field("payment-intent").value, "pi_fixture");
  assert.match(ui.container.textContent, /Association audit: user_fixture/);
  await ui.click(ui.button("Verify with Stripe"));
  assert.equal(ui.container.querySelector("#payment-confirm"), null); assert.match(ui.container.textContent, /cannot be associated here/);
  assert.equal(ui.calls.filter(call => call.body?.command === "associate").length, 0);
});

test("empty, expired login and paginated views remain explicit", async t => {
  let mode = "empty";
  const ui = await mount(t, ({ url, body }) => body ? undefined : mode === "empty" ? ok({ records: [], count: 0 }) : mode === "unauthorized" ? new Response("{}", { status: 401 }) : ok({ records: [fixture()], count: 51 }));
  assert.match(ui.container.textContent, /No payment attempts/); assert.equal(ui.button("Next").disabled, true);
  mode = "unauthorized"; await ui.click(ui.button("Reload")); assert.match(ui.container.textContent, /Sign in to the shop admin again/);
  mode = "page"; await ui.click(ui.button("Reload")); await ui.click(ui.button("Next"));
  assert.match(ui.calls.at(-1).url, /offset=50/); assert.equal(ui.button("Previous").disabled, false);
  await ui.edit("payment-filter", "all"); assert.match(ui.calls.at(-1).url, /filter=all&offset=0/);
});

test("unmount aborts list retrieval and ignores late inspection results", async t => {
  const pending = deferred();
  const ui = await mount(t, ({ body }) => body?.command === "inspect" ? pending.promise : undefined);
  await ui.click(ui.button("payses_fixture")); await ui.edit("payment-intent", "pi_fixture");
  await ui.click(ui.button("Verify with Stripe"));
  await ui.unmount(); assert.equal(ui.calls[0].signal.aborted, true);
  await React.act(async () => pending.resolve(ok({ record: fixture(), preview: preview(fixture()) })));
  assert.equal(ui.container.textContent, ""); assert.equal(ui.calls.filter(call => call.body?.command === "associate").length, 0);
});
