import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { ContainerRegistrationKeys } = require("@medusajs/framework/utils");
const policy = require("../src/lib/shop-policy.ts");
const routes = require("../src/api/admin/snowforce/policies/route.ts");
const publicRoute = require("../src/api/store/snowforce/policies/route.ts");
const key = "11111111-1111-4111-8111-111111111111";
const secondKey = "22222222-2222-4222-8222-222222222222";
const at = "2026-10-01T18:00:00.000Z";
const later = "2026-10-02T18:00:00.000Z";
const clone = (value) => structuredClone(value);
const command = (change = {}) => ({ command: "save_draft", request_id: key, expected_revision: 0, content: policy.initialShopPolicyState().draft.content, ...change });
function readyContent() {
  const content = policy.initialShopPolicyState().draft.content;
  content.seller_name = "Fixture seller LLC"; content.customer_service_email = "support@example.test";
  content.copy.consumer_rights = { en: "This policy preserves statutory consumer rights. Contact the listed support email.", zh: "本政策保留法定消费者权利，请通过所列邮箱联系售后。" };
  return content;
}
const publish = (change = {}) => ({ command: "publish", request_id: secondKey, expected_revision: 1, confirm_review: true, ...change });
function setup(metadata = { snowforce_returns_location_id: "sloc_fixture", snowforce_service_zone_id: "serzo_fixture", preserved: { currency: "usd" } }) {
  let stores = [{ id: "store_fixture", metadata: clone(metadata) }];
  let writes = 0;
  let rejectCas = false;
  const queries = [];
  let previousTransaction = Promise.resolve();
  const db = {
    transaction: async (operation) => {
      const earlier = previousTransaction;
      let release;
      previousTransaction = new Promise((resolve) => { release = resolve; });
      await earlier;
      const snapshot = clone(stores);
      try { return await operation(db); }
      catch (error) { stores = snapshot; throw error; }
      finally { release(); }
    },
    raw: async (sql, bindings = []) => {
      queries.push({ sql, bindings });
      if (sql.startsWith("select id,metadata")) return { rows: clone(stores) };
      if (sql.startsWith("update commerce.store")) {
        assert.equal(stores.length, 1);
        assert.equal(bindings[1], stores[0].id);
        const currentRevision = stores[0].metadata?.[policy.shopPolicyMetadataKey]?.revision ?? 0;
        if (rejectCas || String(currentRevision) !== bindings[2]) return { rows: [] };
        stores[0].metadata = { ...stores[0].metadata, [policy.shopPolicyMetadataKey]: JSON.parse(bindings[0]) };
        writes++;
        return { rows: clone(stores) };
      }
      assert.fail(`Unexpected database operation: ${sql}`);
    },
  };
  const scope = { resolve: (name) => {
    assert.equal(name, ContainerRegistrationKeys.PG_CONNECTION);
    return db;
  } };
  return { scope, queries, get stores() { return stores; }, set stores(value) { stores = value; }, get writes() { return writes; }, set rejectCas(value) { rejectCas = value; } };
}

test("first read provides a fresh unpublished proposal without inventing a seller or writing data", async () => {
  const c = setup();
  const response = await policy.adminShopPolicy(c.scope, "user_staff");
  assert.equal(response.persisted, false);
  assert.equal(response.state.revision, 0);
  assert.equal(response.state.published_version, null);
  assert.deepEqual(response.state.publications, []);
  assert.equal(response.state.draft.content.seller_name, "");
  assert.equal(response.state.draft.content.customer_service_email, "");
  assert.equal(response.state.draft.content.terms.return_window_days, 30);
  assert.equal(response.state.draft.content.terms.approved_dispatch_days, 14);
  assert.match(response.state.draft.content.copy.return_address.en, /1 Park Plaza, #600 Office 44, Irvine, CA 92614/);
  assert.equal(c.writes, 0);
  response.state.draft.content.terms.return_window_days = 60;
  assert.equal(policy.initialShopPolicyState().draft.content.terms.return_window_days, 30);
});

test("staff is required on GET and POST before resolving database or exposing policy drafts", async () => {
  for (const handler of [routes.GET, routes.POST]) {
    for (const actorId of [undefined, "", " "]) {
      await assert.rejects(() => handler({ scope: { resolve: () => assert.fail("must not resolve DB") }, auth_context: { actor_id: actorId }, body: command() }, { json: () => assert.fail("must not expose draft") }));
    }
  }
});

test("strict bounded draft input rejects publication, enrollment and malformed term or text changes", () => {
  assert.equal(policy.saveShopPolicyDraftSchema.safeParse(command()).success, true);
  for (const change of [{ command: "publish" }, { effective_at: at }, { expected_revision: -1 }, { request_id: "reuse" }, { enable_deadlines: true }]) assert.equal(policy.saveShopPolicyDraftSchema.safeParse(command(change)).success, false);
  for (const value of [0, -1, 1.5, 366, NaN, "30"]) {
    const input = command(); input.content.terms.return_window_days = value;
    assert.equal(policy.saveShopPolicyDraftSchema.safeParse(input).success, false);
  }
  for (const change of [{ customer_service_email: "invalid" }, { seller_name: "x".repeat(201) }, { undeclared: true }]) {
    const input = command(); Object.assign(input.content, change);
    assert.equal(policy.saveShopPolicyDraftSchema.safeParse(input).success, false);
  }
  for (const text of ["", " ", "x".repeat(2001)]) {
    const input = command(); input.content.copy.requests.zh = text;
    assert.equal(policy.saveShopPolicyDraftSchema.safeParse(input).success, false);
  }
  const input = command(); input.content.terms.processing_business_days_min = 5;
  assert.equal(policy.saveShopPolicyDraftSchema.safeParse(input).success, false);
});

test("saving writes only the private Store key under a row lock and CAS, preserving all operational metadata", async () => {
  const c = setup();
  const previousMetadata = clone(c.stores[0].metadata);
  const input = command(); input.content.terms.return_window_days = 45; input.content.copy.requests.zh = "这份新版仍未发布。";
  const result = await policy.saveShopPolicyDraft(c.scope, "user_staff", input);
  assert.equal(result.persisted, true);
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.draft.version, 1);
  assert.equal(result.state.draft.updated_by, "user_staff");
  assert.equal(result.state.draft.content.terms.return_window_days, 45);
  assert.equal(result.state.published_version, null);
  assert.equal(result.replayed, false);
  for (const [name, value] of Object.entries(previousMetadata)) assert.deepEqual(c.stores[0].metadata[name], value);
  assert.equal(c.writes, 1);
  assert.ok(c.queries.some(({ sql }) => sql.includes("for update")));
  const update = c.queries.find(({ sql }) => sql.startsWith("update"));
  assert.match(update.sql, /jsonb_set/);
  assert.match(update.sql, /metadata->'snowforce_shop_policy'->>'revision'/);
  assert.equal(policy.publishedShopPolicy(c.stores[0].metadata, at), null);
  assert.throws(() => policy.createShopPolicyOrderSnapshot(c.stores[0].metadata, at));
});

test("same uncertain save retries once, while reuse with different details or revision fails", async () => {
  const c = setup();
  const input = command();
  await policy.saveShopPolicyDraft(c.scope, "user_staff", input);
  const replay = await policy.saveShopPolicyDraft(c.scope, "user_staff", clone(input));
  assert.equal(replay.replayed, true);
  assert.equal(replay.applied_revision, 1);
  assert.equal(c.writes, 1);
  for (const changed of [command({ expected_revision: 1 }), command({ content: { ...input.content, seller_name: "Changed seller" } })]) await assert.rejects(() => policy.saveShopPolicyDraft(c.scope, "user_staff", changed));
  assert.equal(c.writes, 1);
  await policy.saveShopPolicyDraft(c.scope, "user_second", command({ request_id: secondKey, expected_revision: 1 }));
  const olderRetry = await policy.saveShopPolicyDraft(c.scope, "user_staff", input);
  assert.equal(olderRetry.applied_revision, 1);
  assert.equal(olderRetry.state.revision, 2);
  assert.equal(c.writes, 2);
});

test("two administrators using the same revision cannot overwrite each other", async () => {
  const c = setup();
  const results = await Promise.allSettled([
    policy.saveShopPolicyDraft(c.scope, "user_first", command()),
    policy.saveShopPolicyDraft(c.scope, "user_second", command({ request_id: secondKey })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(c.writes, 1);
  assert.equal(c.stores[0].metadata[policy.shopPolicyMetadataKey].revision, 1);
});

test("zero-row CAS writes, malformed saved state and ambiguous store configuration fail closed", async () => {
  const c = setup(); c.rejectCas = true;
  await assert.rejects(() => policy.saveShopPolicyDraft(c.scope, "user_staff", command()));
  assert.equal(c.writes, 0);
  for (const stored of [null, { revision: 5 }, { ...policy.initialShopPolicyState(), schema_version: 2 }]) {
    const bad = setup({ [policy.shopPolicyMetadataKey]: stored });
    await assert.rejects(() => policy.adminShopPolicy(bad.scope, "user_staff"));
    await assert.rejects(() => policy.saveShopPolicyDraft(bad.scope, "user_staff", command()));
    assert.equal(bad.writes, 0);
  }
  for (const stores of [[], [{ id: "store_first", metadata: null }, { id: "store_second", metadata: null }]]) {
    const ambiguous = setup(); ambiguous.stores = stores;
    await assert.rejects(() => policy.adminShopPolicy(ambiguous.scope, "user_staff"));
  }
});

test("editing a draft preserves publication history and never changes the customer projection", async () => {
  const state = policy.initialShopPolicyState();
  state.revision = 1; state.draft.version = 1;
  state.published_version = 1;
  state.publications = [{ version: 1, published_at: at, effective_at: at, published_by: "user_publisher", content: clone(state.draft.content) }];
  const c = setup({ [policy.shopPolicyMetadataKey]: state });
  const input = command({ expected_revision: 1 }); input.content.copy.requests.en = "Private next-version proposal"; input.content.terms.return_window_days = 60;
  await policy.saveShopPolicyDraft(c.scope, "user_editor", input);
  const saved = c.stores[0].metadata[policy.shopPolicyMetadataKey];
  assert.deepEqual(saved.publications, state.publications);
  const publicPolicy = policy.publishedShopPolicy(c.stores[0].metadata, later);
  assert.equal(publicPolicy.version, 1);
  assert.equal(publicPolicy.content.terms.return_window_days, 30);
  for (const privateName of ["draft", "updated_by", "published_by", "save_receipts", "request_id"]) assert.ok(!JSON.stringify(publicPolicy).includes(privateName));
  assert.ok(!JSON.stringify(publicPolicy).includes("Private next-version proposal"));
});

test("purchase snapshots are independent values and future-effective records do not become terms early", () => {
  const state = policy.initialShopPolicyState(); state.revision = 1; state.draft.version = 1; state.published_version = 1;
  state.publications = [{ version: 1, published_at: at, effective_at: later, published_by: "user_publisher", content: clone(state.draft.content) }];
  const metadata = { [policy.shopPolicyMetadataKey]: state };
  assert.equal(policy.publishedShopPolicy(metadata, at), null);
  assert.throws(() => policy.createShopPolicyOrderSnapshot(metadata, at));
  const snapshot = policy.createShopPolicyOrderSnapshot(metadata, later);
  assert.equal(snapshot.purchased_at, later);
  state.publications[0].content.terms.return_window_days = 7;
  state.publications[0].content.copy.requests.en = "Changed current policy";
  assert.equal(snapshot.content.terms.return_window_days, 30);
  assert.ok(!snapshot.content.copy.requests.en.includes("Changed current policy"));
  assert.throws(() => policy.publishedShopPolicy(metadata, "not-a-date"));
});

test("policy state rejects duplicate or dangling publication and save versions", () => {
  const state = policy.initialShopPolicyState();
  assert.equal(policy.shopPolicyStateSchema.safeParse({ ...state, published_version: 1 }).success, false);
  assert.equal(policy.shopPolicyStateSchema.safeParse({ ...state, revision: 1 }).success, false);
  const publication = { version: 1, published_at: at, effective_at: at, published_by: "user_staff", content: state.draft.content };
  assert.equal(policy.shopPolicyStateSchema.safeParse({ ...state, publications: [publication] }).success, false);
  const valid = { ...state, revision: 1, draft: { ...state.draft, version: 1 }, published_version: 1, publications: [publication] };
  assert.equal(policy.shopPolicyStateSchema.safeParse(valid).success, true);
  assert.equal(policy.shopPolicyStateSchema.safeParse({ ...valid, publications: [publication, publication] }).success, false);
});

test("scheduled revisions preserve the preceding effective terms and never apply a later publication retroactively", () => {
  const state = policy.initialShopPolicyState(); state.revision = 3; state.draft.version = 3; state.published_version = 3;
  const original = clone(state.draft.content);
  const replacement = clone(original); replacement.terms.return_window_days = 60;
  state.publications = [
    { version: 1, published_at: at, effective_at: at, published_by: "user_staff", content: original },
    { version: 2, published_at: at, effective_at: later, published_by: "user_staff", content: replacement },
    { version: 3, published_at: later, effective_at: at, published_by: "user_staff", content: clone(replacement) },
  ];
  const metadata = { [policy.shopPolicyMetadataKey]: state };
  assert.equal(policy.publishedShopPolicy(metadata, at).version, 1);
  assert.equal(policy.createShopPolicyOrderSnapshot(metadata, at).content.terms.return_window_days, 30);
  assert.equal(policy.publishedShopPolicy(metadata, later).version, 3);
});

test("installed native Store surface has no customer store route or allowed Store relation to expose private metadata", () => {
  const nativeRoot = new URL("../node_modules/@medusajs/medusa/dist/api/store/", import.meta.url);
  assert.ok(!readdirSync(nativeRoot).includes("stores"));
  for (const entity of ["products", "regions", "orders", "carts", "shipping-options"]) {
    const config = readFileSync(new URL(`${entity}/query-config.js`, nativeRoot), "utf8");
    assert.ok(!/['"]store[.]['"]|['"]store\.metadata['"]|['"]\*store['"]/.test(config));
  }
  const model = readFileSync(new URL("../node_modules/@medusajs/store/dist/models/store.js", import.meta.url), "utf8");
  assert.match(model, /default_region_id: utils_1\.model\.text\(\)/);
  assert.match(model, /default_sales_channel_id: utils_1\.model\.text\(\)/);
});

test("publication requires a saved reviewed draft, a real seller, support email and completed copy", async () => {
  const c = setup();
  await assert.rejects(() => policy.changeShopPolicy(c.scope, "user_staff", publish({ expected_revision: 0 })));
  for (const content of [policy.initialShopPolicyState().draft.content, { ...readyContent(), seller_name: "" }, { ...readyContent(), customer_service_email: "" }, { ...readyContent(), copy: policy.initialShopPolicyState().draft.content.copy }]) {
    const state = policy.initialShopPolicyState(); state.revision = 1; state.draft.version = 1; state.draft.content = content;
    assert.throws(() => policy.applyShopPolicyPublication(state, publish(), "user_staff", at));
  }
  assert.equal(policy.publishShopPolicySchema.safeParse(publish({ confirm_review: false })).success, false);
  assert.equal(policy.publishShopPolicySchema.safeParse(publish({ effective_at: at })).success, false);
  assert.equal(c.writes, 0);
});

test("publishing preserves private metadata and immutable history, with distinct command idempotency", async () => {
  const c = setup();
  await policy.changeShopPolicy(c.scope, "user_editor", command({ content: readyContent() }));
  const result = await policy.changeShopPolicy(c.scope, "user_publisher", publish());
  assert.equal(result.state.revision, 2);
  assert.equal(result.state.published_version, 2);
  const original = clone(result.state.publications[0]);
  assert.equal(original.published_at, original.effective_at);
  assert.equal(original.published_by, "user_publisher");
  assert.equal(c.stores[0].metadata.preserved.currency, "usd");
  const replay = await policy.changeShopPolicy(c.scope, "user_publisher", publish());
  assert.equal(replay.replayed, true); assert.equal(c.writes, 2);
  await assert.rejects(() => policy.changeShopPolicy(c.scope, "user_staff", publish({ request_id: key })));
  await assert.rejects(() => policy.changeShopPolicy(c.scope, "user_staff", command({ request_id: secondKey, expected_revision: 2, content: readyContent() })));
  const nextContent = readyContent(); nextContent.terms.return_window_days = 60;
  await policy.changeShopPolicy(c.scope, "user_editor", command({ request_id: "33333333-3333-4333-8333-333333333333", expected_revision: 2, content: nextContent }));
  assert.deepEqual(c.stores[0].metadata[policy.shopPolicyMetadataKey].publications[0], original);
  const projection = await policy.publicShopPolicy(c.scope);
  assert.equal(projection.content.terms.return_window_days, 30);
  assert.ok(!JSON.stringify(projection).includes("user_publisher"));
});

test("concurrent publishers cannot duplicate publication and an identical draft cannot be republished", async () => {
  const c = setup(); await policy.saveShopPolicyDraft(c.scope, "user_editor", command({ content: readyContent() }));
  const outcomes = await Promise.allSettled([policy.changeShopPolicy(c.scope, "user_a", publish()), policy.changeShopPolicy(c.scope, "user_b", publish({ request_id: "33333333-3333-4333-8333-333333333333" }))]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(c.stores[0].metadata[policy.shopPolicyMetadataKey].publications.length, 1);
  await assert.rejects(() => policy.changeShopPolicy(c.scope, "user_a", publish({ request_id: "44444444-4444-4444-8444-444444444444", expected_revision: 2 })));
});

test("the public endpoint exposes only effective terms and explicitly disables caching", async () => {
  const c = setup(); let body; let cache;
  await publicRoute.GET({ scope: c.scope }, { setHeader: (key, value) => { assert.equal(key, "Cache-Control"); cache = value; }, json: (value) => { body = value; } });
  assert.deepEqual(body, { policy: null }); assert.equal(cache, "no-store");
  await policy.saveShopPolicyDraft(c.scope, "user_editor", command({ content: readyContent() }));
  await policy.changeShopPolicy(c.scope, "user_editor", publish());
  await publicRoute.GET({ scope: c.scope }, { setHeader: () => {}, json: (value) => { body = value; } });
  assert.equal(body.policy.version, 2);
  for (const secret of ["user_editor", "preserved", "save_receipts", "draft", key]) assert.ok(!JSON.stringify(body).includes(secret));
});
