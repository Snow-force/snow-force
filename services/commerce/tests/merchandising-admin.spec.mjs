import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const workspaceRequire = createRequire(new URL("../../../package.json", import.meta.url));
const { JSDOM } = workspaceRequire("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:9000/app/products/prod_fixture" });
for (const key of ["window", "document", "HTMLElement", "Node", "MutationObserver"]) globalThis[key] = key === "window" ? dom.window : key === "document" ? dom.window.document : dom.window[key];
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
require("ts-node/register/transpile-only");
const React = require("react"), { createRoot } = require("react-dom/client");
const { MerchandisingEditor } = require("../src/admin/components/merchandising-editor.tsx");
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const record = (fields = { kind: "product", brand: "OLD" }) => ({ id: fields.kind === "category" ? "pcat_fixture" : fields.kind === "collection" ? "pcol_fixture" : "prod_fixture", fingerprint: "a".repeat(64), fields });
async function mount(t, initial, handler) {
  const previous = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options = {}) => { const call = { url, options, body: options.body ? JSON.parse(options.body) : null }; calls.push(call); return handler ? handler(call) : response(initial); };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); globalThis.fetch = previous; });
  await React.act(async () => root.render(React.createElement(MerchandisingEditor, { key: initial.id, kind: initial.fields.kind, id: initial.id })));
  const element = suffix => { const node = container.querySelector(`#merch-${initial.fields.kind}-${initial.id}-${suffix}`); assert.ok(node, `Missing ${suffix}`); return node; };
  const button = label => { const node = [...container.querySelectorAll("button")].find(item => item.textContent.includes(label)); assert.ok(node, `Missing ${label}`); return node; };
  return { container, calls, element, button,
    async click(label) { await React.act(async () => button(label).click()); },
    async input(suffix, value) { await React.act(async () => { const node = element(suffix), proto = node.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value); node.dispatchEvent(new dom.window.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); },
  };
}
test("native product widget loads without writes and saves only validated brand data", async t => {
  const initial = record();
  const app = await mount(t, initial, call => response(call.body ? { ...initial, fingerprint: "b".repeat(64), fields: call.body.fields } : initial));
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0].options.credentials, "include");
  await app.input("brand", "NEW"); await app.click("Save merchandising");
  assert.deepEqual(app.calls[1].body, { expected_fingerprint: initial.fingerprint, fields: { kind: "product", brand: "NEW" } });
  assert.ok(app.container.textContent.includes("Saved.")); assert.equal(app.element("brand").disabled, false);
});
test("lost save response locks editing and retries exactly the original command", async t => {
  const initial = record(); let posts = 0;
  const app = await mount(t, initial, call => { if (!call.body) return response(initial); if (++posts === 1) throw new Error("lost response"); return response({ ...initial, fields: call.body.fields }); });
  await app.input("brand", "NEW"); await app.click("Save merchandising");
  assert.equal(app.element("brand").disabled, true); assert.equal(app.button("Reload").disabled, true);
  await app.click("Retry save"); assert.deepEqual(app.calls[1].body, app.calls[2].body);
  assert.equal(app.element("brand").disabled, false); assert.ok(app.container.textContent.includes("Saved."));
});
test("conflicting edits require reload; mismatched success data remains uncertain", async t => {
  const initial = record(); let conflict = true;
  const app = await mount(t, initial, call => !call.body ? response(initial) : conflict ? response({}, 409) : response({ ...initial, fields: { kind: "product", brand: "UNRELATED" } }));
  await app.input("brand", "NEW"); await app.click("Save merchandising");
  assert.equal(app.button("Save merchandising").disabled, true); assert.ok(app.container.textContent.includes("Data changed."));
  conflict = false; await app.click("Reload"); await app.input("brand", "NEW"); await app.click("Save merchandising");
  assert.equal(app.element("brand").disabled, true); assert.ok(app.container.textContent.includes("Save outcome unknown"));
});
test("category placement and curated sale collections can be managed in their native widgets", async t => {
  for (const initial of [record({ kind: "category", name_zh: "", image: "", section: "auto" }), record({ kind: "collection", name_zh: "", image: "", section: "featured", rank: 0, promotion_code: "" })]) {
    const app = await mount(t, initial, call => response(call.body ? { ...initial, fields: call.body.fields } : initial));
    await app.input("zh", "雪具"); await app.input("section", initial.fields.kind === "category" ? "women" : "sale");
    if (initial.fields.kind === "collection") { await app.input("rank", "3"); await app.input("promotion", "SNOW10"); }
    await app.input("image", "javascript:alert(1)"); await app.click("Save merchandising");
    assert.equal(app.calls.length, 1); assert.ok(app.container.textContent.includes("Check the image URL"));
    await app.input("image", "https://images.example.com/snow.jpg"); await app.click("Save merchandising");
    assert.equal(app.calls[1].body.fields.name_zh, "雪具"); assert.ok(app.container.textContent.includes("Saved."));
  }
});
