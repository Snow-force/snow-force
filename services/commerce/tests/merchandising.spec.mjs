import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { getMerchandising, saveMerchandising } = require("../src/lib/merchandising.ts");
const { publicCollectionPromotions } = require("../src/lib/storefront-promotions.ts");
const auth = { actor_type: "user", actor_id: "user_fixture" };
function fixture() {
  const rows = { prod_fixture: { id: "prod_fixture", handle: "fixture", metadata: { snowforce_brand: "OLD", snowforce_tax: { keep: true } } }, pcat_fixture: { id: "pcat_fixture", handle: "kids", metadata: {} }, pcol_fixture: { id: "pcol_fixture", handle: "sale", metadata: { private_unrelated: "retain" } } };
  const calls = [];
  const db = {
    async raw(sql, bindings) {
      calls.push({ sql, bindings });
      if (sql.startsWith("select id,handle,metadata")) return { rows: rows[bindings[0]] ? [structuredClone(rows[bindings[0]])] : [] };
      if (sql.startsWith("update")) { rows[bindings[1]].metadata = { ...rows[bindings[1]].metadata, ...JSON.parse(bindings[0]) }; return { rows: [] }; }
      assert.fail(`Unexpected query ${sql}`);
    },
    async transaction(action) { const before = structuredClone(rows); try { return await action(db); } catch (error) { Object.assign(rows, before); throw error; } },
  };
  const scope = { resolve(key) { assert.equal(key, "__pg_connection__"); return db; } };
  return { scope, rows, calls };
}
test("merchandising authenticates before database access and rejects mismatched record kinds", async () => {
  const scope = { resolve() { assert.fail("Authenticate before access"); } };
  for (const actor of [undefined, { actor_type: "customer", actor_id: "cus_fixture" }]) {
    await assert.rejects(() => getMerchandising(scope, actor, "product", "prod_fixture"), /Sign in/);
    await assert.rejects(() => saveMerchandising(scope, actor, "product", "prod_fixture", {}), /Sign in/);
  }
  const f = fixture(); const initial = await getMerchandising(f.scope, auth, "product", "prod_fixture");
  const reads = f.calls.length;
  for (const [kind, id] of [["unexpected", "prod_fixture"], ["product", "pcat_fixture"], ["product", "prod_fixture' OR true"]]) await assert.rejects(() => getMerchandising(f.scope, auth, kind, id), /catalog record/);
  assert.equal(f.calls.length, reads);
  await assert.rejects(() => saveMerchandising(f.scope, auth, "product", "prod_fixture", { expected_fingerprint: initial.fingerprint, fields: { kind: "category", name_zh: "", image: "", section: "men" } }), /Check/);
});
test("native brand updates merge only owned metadata under a row lock and replay safely", async () => {
  const f = fixture(); const before = await getMerchandising(f.scope, auth, "product", "prod_fixture");
  const command = { expected_fingerprint: before.fingerprint, fields: { kind: "product", brand: "NEW BRAND" } };
  const result = await saveMerchandising(f.scope, auth, "product", "prod_fixture", command);
  assert.equal(result.fields.brand, "NEW BRAND"); assert.deepEqual(f.rows.prod_fixture.metadata.snowforce_tax, { keep: true });
  assert.ok(f.calls.some(call => call.sql.endsWith("for update")));
  const writes = () => f.calls.filter(call => call.sql.startsWith("update")).length;
  assert.equal(writes(), 1);
  assert.deepEqual(await saveMerchandising(f.scope, auth, "product", "prod_fixture", command), result); assert.equal(writes(), 1);
  await assert.rejects(() => saveMerchandising(f.scope, auth, "product", "prod_fixture", { ...command, fields: { kind: "product", brand: "STALE" } }), /changed/); assert.equal(writes(), 1);
});
test("category placement, collection ordering and promotion references use native metadata", async () => {
  const f = fixture();
  assert.equal((await getMerchandising(f.scope, auth, "collection", "pcol_fixture")).fields.section, "sale");
  for (const [kind, id, fields] of [["category", "pcat_fixture", { kind: "category", name_zh: "雪服", image: "https://images.example.com/gear.jpg", section: "men" }], ["collection", "pcol_fixture", { kind: "collection", name_zh: "季末优惠", image: "", section: "sale", rank: 2, promotion_code: "SNOW10" }]]) {
    const before = await getMerchandising(f.scope, auth, kind, id);
    const saved = await saveMerchandising(f.scope, auth, kind, id, { expected_fingerprint: before.fingerprint, fields });
    assert.deepEqual(saved.fields, fields);
  }
  assert.equal(f.rows.pcol_fixture.metadata.private_unrelated, "retain");
  assert.equal(f.rows.pcol_fixture.metadata.snowforce_promotion_code, "SNOW10");
  const before = await getMerchandising(f.scope, auth, "category", "pcat_fixture");
  for (const image of ["javascript:alert(1)", "http://example.com/a", "https://password@example.com/a"]) await assert.rejects(() => saveMerchandising(f.scope, auth, "category", "pcat_fixture", { expected_fingerprint: before.fingerprint, fields: { ...before.fields, image } }), /Check/);
});
test("public promotion output exposes only opted-in current offers; native dates and budgets filter in SQL", async () => {
  let query;
  const scope = { resolve: () => ({ raw: async sql => { query = sql; return { rows: [{ collection_id: "pcol_fixture", code: "SNOW10", is_automatic: false, ends_at: "2026-12-01T00:00:00Z" }] }; } }) };
  const result = await publicCollectionPromotions(scope);
  assert.equal(result.promotions[0].code, "SNOW10");
  for (const predicate of ["p.status='active'", "snowforce_promotion_code", "cam.starts_at<=clock_timestamp()", "cam.ends_at>clock_timestamp()", "p.used<p.limit", "b.used<b.limit", "<>'hidden'"]) assert.ok(query.includes(predicate), predicate);
  const bad = { resolve: () => ({ raw: async () => ({ rows: [{ ...result.promotions[0], internal_key: "must reject" }] }) }) };
  await assert.rejects(() => publicCollectionPromotions(bad));
});
