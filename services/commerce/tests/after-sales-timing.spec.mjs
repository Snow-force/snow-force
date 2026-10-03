import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { ContainerRegistrationKeys } = require("@medusajs/framework/utils");
const timing = require("../src/lib/after-sales-timing.ts");
const consent = require("../src/lib/policy-consent.ts");
const policy = require("../src/lib/shop-policy.ts");
process.env.JWT_SECRET = "fixture-policy-signing-key-32-characters-or-longer";
const acceptedAt = "2026-09-01T08:00:00.000Z";
function state() {
  const value = policy.initialShopPolicyState();
  value.revision = 1; value.draft.version = 1; value.published_version = 1;
  value.draft.content.seller_name = "Fixture Seller";
  value.draft.content.customer_service_email = "support@example.test";
  value.draft.content.copy.consumer_rights = { en: "Your statutory rights apply.", zh: "保留法定消费者权利。" };
  value.publications = [{ version: 1, published_at: acceptedAt, effective_at: acceptedAt, published_by: "user_fixture", content: structuredClone(value.draft.content) }];
  return value;
}
function setup() {
  let saved = state();
  const metadata = () => ({ [policy.shopPolicyMetadataKey]: saved });
  const receipt = consent.sealPolicyAcceptance({ id: "cart_fixture", customer_id: "cus_fixture", items: [], shipping_methods: [] }, policy.publishedShopPolicy(metadata(), acceptedAt), acceptedAt);
  const order = { id: "order_fixture", customer_id: "cus_fixture", created_at: "2026-09-01T09:00:00.000Z", metadata: { [consent.policyAcceptanceKey]: receipt }, fulfillments: [{ canceled_at: null, delivered_at: "2026-09-05T18:00:00.000Z", items: [{ line_item_id: "ordli_fixture" }] }] };
  const sqls = [], links = [{ cart_id: "cart_fixture" }];
  const db = { raw: async (sql, bindings) => {
    sqls.push(sql);
    if (sql.startsWith("select cart_id")) { assert.deepEqual(bindings, [order.id]); return { rows: links }; }
    if (sql.startsWith("select id,metadata")) return { rows: [{ id: "store_fixture", metadata: metadata() }] };
    assert.fail(`Unexpected operation: ${sql}`);
  } };
  const scope = { resolve: key => { assert.equal(key, ContainerRegistrationKeys.PG_CONNECTION); return db; } };
  return { order, scope, links, sqls, receipt, get state() { return saved; }, set state(value) { saved = value; } };
}
const items = [{ id: "ordli_fixture" }];
const terms = { version: 1, return_window_days: 30, approved_dispatch_days: 14 };
test("Pacific calendar deadlines include the entire last local date and handle leap years and DST", () => {
  assert.equal(timing.calendarDeadline("2028-02-29T07:00:00.000Z", 1), "2028-02-29");
  assert.equal(timing.calendarDeadline("2026-10-31T23:30:00.000Z", 1), "2026-11-01");
  const c = setup(); c.order.fulfillments[0].delivered_at = "2026-10-02T18:00:00.000Z";
  assert.equal(timing.assessReturnWindow(c.order, items, "size", "2026-11-02T07:59:59.999Z", terms).lines[0].status, "within_window");
  assert.equal(timing.assessReturnWindow(c.order, items, "size", "2026-11-02T08:00:00.000Z", terms).lines[0].status, "expired");
  for (const days of [0, 366, -1, 1.5, "30"]) assert.throws(() => timing.calendarDeadline(acceptedAt, days));
  assert.throws(() => timing.pacificCalendarDate("not a date"));
});
test("expired ordinary requests require explicit staff exceptions with a bounded meaningful note", async () => {
  const c = setup();
  const result = await timing.afterSalesTiming(c.scope, c.order, items, "size", "2026-10-07T18:00:00.000Z");
  assert.equal(result.policyVersion, 1); assert.equal(result.requiresException, true);
  assert.equal(result.lines[0].latestDeadline, "2026-10-05");
  assert.throws(() => timing.assertReturnWindowReview(result, false, "Reviewed the policy"));
  for (const note of ["", " ", "four", "x".repeat(3951)]) assert.throws(() => timing.assertReturnWindowReview(result, true, note));
  assert.doesNotThrow(() => timing.assertReturnWindowReview(result, true, "Approved a courtesy exception."));
  assert.ok(c.sqls.every(sql => sql.startsWith("select")));
});
test("timely submissions remain timely even if staff later review them", async () => {
  const c = setup();
  const result = await timing.afterSalesTiming(c.scope, c.order, items, "other", "2026-10-05T23:00:00.000Z");
  assert.equal(result.requiresException, false); assert.equal(result.lines[0].status, "within_window");
});
test("quality and incorrect-item claims remain reviewable beyond ordinary deadlines", async () => {
  for (const reason of ["quality", "incorrect"]) {
    const c = setup();
    const result = await timing.afterSalesTiming(c.scope, c.order, items, reason, "2026-12-01T18:00:00.000Z");
    assert.equal(result.lines[0].status, "expired"); assert.equal(result.requiresException, false);
    c.order.metadata = null;
    assert.equal((await timing.afterSalesTiming(c.scope, c.order, items, reason, "2026-12-01T18:00:00.000Z")).requiresException, false);
  }
});
test("new policy publications do not shorten purchase terms", async () => {
  const c = setup(); const next = structuredClone(c.state.publications[0]);
  next.version = 2; next.effective_at = next.published_at = "2026-09-10T18:00:00.000Z";
  next.content.terms.return_window_days = 5;
  c.state.revision = c.state.draft.version = c.state.published_version = 2; c.state.publications.push(next);
  const result = await timing.afterSalesTiming(c.scope, c.order, items, "size", "2026-10-01T18:00:00.000Z");
  assert.equal(result.policyVersion, 1); assert.equal(result.returnWindowDays, 30); assert.equal(result.requiresException, false);
});
test("foreign or tampered receipts, ambiguous cart links and signing-key rotation require review", async () => {
  for (const edit of [c => c.order.customer_id = "cus_foreign", c => c.links[0].cart_id = "cart_foreign", c => c.links.push({ cart_id: "cart_other" }), c => c.links.length = 0, c => c.receipt.policy.content.terms.return_window_days = 365, c => c.receipt.accepted_at = "2026-09-02T18:00:00.000Z", c => c.receipt.signature = "f".repeat(64), c => c.order.metadata = null]) {
    const c = setup(); edit(c);
    const result = await timing.afterSalesTiming(c.scope, c.order, items, "size", "2026-10-01T18:00:00.000Z");
    assert.equal(result.policyVersion, null); assert.equal(result.requiresException, true);
  }
  const c = setup(), originalKey = process.env.JWT_SECRET;
  try { process.env.JWT_SECRET = "another-fixture-signing-key-32-characters-or-longer";
    assert.equal((await timing.afterSalesTiming(c.scope, c.order, items, "size", "2026-10-01T18:00:00.000Z")).requiresException, true);
  } finally { process.env.JWT_SECRET = originalKey; }
});
test("a signature alone cannot replace the exact published policy history", async () => {
  const c = setup(); c.state.publications[0].content.terms.return_window_days = 29;
  const result = await timing.afterSalesTiming(c.scope, c.order, items, "size", "2026-10-01T18:00:00.000Z");
  assert.equal(result.policyVersion, null); assert.equal(result.requiresException, true);
  const unavailableScope = { resolve: () => ({ raw: async () => { throw new Error("Database unavailable"); } }) };
  await assert.rejects(() => timing.afterSalesTiming(unavailableScope, c.order, items, "quality", acceptedAt), /Database unavailable/);
});
test("a correctly signed receipt must predate order creation and follow policy effectiveness", () => {
  const c = setup(), cart = { id: "cart_fixture", customer_id: "cus_fixture", items: [], shipping_methods: [] };
  c.order.metadata[consent.policyAcceptanceKey] = consent.sealPolicyAcceptance(cart, c.receipt.policy, "2026-09-02T18:00:00.000Z");
  assert.throws(() => consent.verifyOrderPolicyAcceptance(c.order, "cart_fixture"));
  const laterPolicy = structuredClone(c.receipt.policy); laterPolicy.effective_at = "2026-09-02T00:00:00.000Z";
  c.order.metadata[consent.policyAcceptanceKey] = consent.sealPolicyAcceptance(cart, laterPolicy, acceptedAt);
  assert.throws(() => consent.verifyOrderPolicyAcceptance(c.order, "cart_fixture"));
});
test("split deliveries distinguish all-in-window, all-expired and mixed batches without inventing allocation", () => {
  const c = setup(); c.order.fulfillments.push({ canceled_at: null, delivered_at: "2026-09-20T18:00:00.000Z", items: [{ line_item_id: "ordli_fixture" }] });
  const assess = at => timing.assessReturnWindow(c.order, items, "size", at, terms);
  assert.equal(assess("2026-10-01T18:00:00.000Z").requiresException, false);
  assert.equal(assess("2026-10-10T18:00:00.000Z").lines[0].status, "manual");
  assert.equal(assess("2026-10-21T18:00:00.000Z").lines[0].status, "expired");
  assert.deepEqual(assess("2026-10-10T18:00:00.000Z").lines[0], { id: "ordli_fixture", status: "manual", earliestDeadline: "2026-10-05", latestDeadline: "2026-10-20" });
});
test("canceled or foreign deliveries do not extend the window; unknown and inconsistent dates need review", () => {
  const c = setup(); c.order.fulfillments.push({ canceled_at: "2026-10-01T00:00:00.000Z", delivered_at: "2026-09-30T18:00:00.000Z", items: [{ line_item_id: "ordli_fixture" }] }, { canceled_at: null, delivered_at: "2026-09-30T18:00:00.000Z", items: [{ line_item_id: "ordli_other" }] });
  assert.equal(timing.assessReturnWindow(c.order, items, "size", "2026-10-06T18:00:00.000Z", terms).lines[0].status, "expired");
  for (const deliveredAt of [null, "2026-08-30T00:00:00.000Z", "2026-12-30T00:00:00.000Z"]) {
    c.order.fulfillments[0].delivered_at = deliveredAt;
    assert.equal(timing.assessReturnWindow(c.order, items, "size", "2026-10-06T18:00:00.000Z", terms).lines[0].status, "manual");
  }
});
