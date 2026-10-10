import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { initializeCatalogTaxonomy, initialCatalogCategories } = require("../src/lib/catalog-taxonomy-setup.ts");
function fixture() {
  const categories = [], products = ["outerwear", "kids", "goggles", "accessories", "unknown"].map((category, index) => ({ id: `prod_${index}`, metadata: { snowforce_category: category }, categoryIds: [] }));
  products.push({ id: "prod_manual", metadata: { snowforce_category: "outerwear" }, categoryIds: ["pcat_operator"] });
  const f = { categories, products, creates: [], links: [] };
  f.dependencies = {
    categories: async () => structuredClone(categories), products: async () => structuredClone(products),
    create: async input => { f.creates.push(input); const row = { ...input, id: `pcat_${input.handle.replaceAll("-", "")}` }; categories.push(row); return row; },
    add: async (categoryId, productId) => { f.links.push({ categoryId, productId }); products.find(product => product.id === productId).categoryIds.push(categoryId); },
  };
  return f;
}
test("one-time native taxonomy migrates legacy labels without guessing gender or changing manual assignments", async () => {
  const f = fixture(), result = await initializeCatalogTaxonomy(f.dependencies);
  assert.deepEqual(result, { created: 9, linked: 4, preserved: 1, unmapped: 1 });
  assert.equal(f.products[0].categoryIds[0], "pcat_snowapparel");
  assert.equal(f.products[1].categoryIds[0], "pcat_kidssnowapparel");
  assert.deepEqual(f.products.at(-1).categoryIds, ["pcat_operator"]);
  for (const row of f.creates) { assert.equal(row.is_active, true); assert.equal(row.is_internal, false); assert.equal(Object.hasOwn(row, "status"), false); }
  assert.equal(f.links.some(link => ["pcat_men", "pcat_women"].includes(link.categoryId)), false);
  const replay = await initializeCatalogTaxonomy(f.dependencies);
  assert.deepEqual(replay, { created: 0, linked: 0, preserved: 5, unmapped: 1 });
});
test("colliding hidden, inactive or differently parented categories stop before any write", async () => {
  for (const patch of [{ is_active: false }, { is_internal: true }, { parent_category_id: "pcat_operator" }]) {
    const f = fixture(); f.categories.push({ id: "pcat_men", handle: "men", parent_category_id: null, is_active: true, is_internal: false, ...patch });
    await assert.rejects(() => initializeCatalogTaxonomy(f.dependencies), /Review existing category/);
    assert.equal(f.creates.length, 0); assert.equal(f.links.length, 0);
  }
});
test("partial migrations resume through native handles while arbitrary new categories remain untouched", async () => {
  const f = fixture(); f.categories.push({ id: "pcat_operator", handle: "custom-department", parent_category_id: null, is_active: true, is_internal: false });
  const create = f.dependencies.create; let count = 0;
  f.dependencies.create = async input => { if (++count === 4) throw new Error("Interrupted"); return create(input); };
  await assert.rejects(() => initializeCatalogTaxonomy(f.dependencies), /Interrupted/);
  f.dependencies.create = create;
  await initializeCatalogTaxonomy(f.dependencies);
  for (const definition of initialCatalogCategories) assert.equal(f.categories.filter(row => row.handle === definition.handle).length, 1);
  assert.equal(f.categories.find(row => row.handle === "custom-department").id, "pcat_operator");
});
