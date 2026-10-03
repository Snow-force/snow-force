import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { draftManifestSchema, draftProductInput, importDraftManifest } = require("../src/lib/draft-manifest.ts");
const draft = { handle: "fixture-jacket", brand: "VECTOR", category: "outerwear", name: { en: "Jacket", zh: "雪服" }, description: { en: "Description", zh: "介绍" }, image: "https://snow-force.com/shop/fixture.webp", candidate_colors: [{ en: "Black", zh: "黑色" }], candidate_sizes: ["S", "M"], source: { file: "catalog.pdf", page: 1 } };
test("exports reviewed descriptions without guessing SKU combinations, sale prices or inventory", () => {
  const input = draftProductInput(draftManifestSchema.parse([draft])[0], "sp_fixture");
  assert.equal(input.status, "draft");
  assert.deepEqual(input.variants, []);
  assert.equal(input.metadata.snowforce_name.zh, "雪服");
  assert.equal(input.metadata.snowforce_review_required, true);
  assert.ok(!JSON.stringify(input).includes("referencePrice"));
});
test("rejects pasted prices, unsafe image URLs and duplicate handles", () => {
  for (const value of [[{ ...draft, referencePrice: 100 }], [{ ...draft, image: "http://untrusted.invalid/a" }], [draft, draft]]) assert.equal(draftManifestSchema.safeParse(value).success, false);
});
test("repeated imports preserve products changed by operators", async () => {
  const handles = new Set();
  const deps = { find: async (handle) => handles.has(handle), create: async (product) => { handles.add(product.handle); } };
  assert.deepEqual(await importDraftManifest([draft], deps), { created: 1, skipped: 0 });
  assert.deepEqual(await importDraftManifest([draft], deps), { created: 0, skipped: 1 });
});
test("a failed database write is not counted as an imported draft", async () => {
  await assert.rejects(importDraftManifest([draft], { find: async () => false, create: async () => { throw new Error("unavailable"); } }));
});
