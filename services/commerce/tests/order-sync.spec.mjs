import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { BigNumber, FulfillmentWorkflowEvents, OrderWorkflowEvents, PaymentEvents } = require("@medusajs/framework/utils");
const { orderSnapshot } = require("../src/lib/order-snapshot.ts");
const { orderMemberId, publishOrderSnapshot } = require("../src/lib/order-sync.ts");
const { eventOrderIds, config } = require("../src/subscribers/member-order-sync.ts");
const { GET } = require("../src/api/store/snowforce/orders/[id]/route.ts");
const owner = "11111111-1111-4111-8111-111111111111";
const at = "2026-10-01T06:30:00Z";
function native() {
  return { id: "order_fixture", customer_id: "cus_fixture", version: 1, display_id: 1001, status: "pending", currency_code: "usd", payment_status: "authorized", fulfillment_status: "not_fulfilled", item_subtotal: new BigNumber("100"), shipping_subtotal: 0, tax_total: "8.5", discount_subtotal: "10", credit_line_total: "5", total: "93.5", created_at: at, updated_at: at,
    items: [{ id: "ordli_fixture", product_handle: "test-gear", product_title: "Test gear", title: "Test gear", variant_title: "M", thumbnail: null, quantity: 2, unit_price: new BigNumber(50), subtotal: new BigNumber(100), detail: { return_received_quantity: 0, return_dismissed_quantity: 0 } }],
    shipping_address: { first_name: "Fixture", last_name: "Rider", address_1: "Test street", address_2: "", city: "Test city", province: "ca", postal_code: "90001", country_code: "us" }, fulfillments: [] };
}
test("maps native BigNumber totals and credit lines without leaking payment provider data", () => {
  const order = orderSnapshot({ ...native(), payment_collections: [{ secret: "must-not-leak" }] }, owner);
  assert.equal(order.total_cents, 9350); assert.equal(order.credit_cents, 500); assert.equal(order.discount_cents, 1000);
  assert.equal(order.user_id, owner); assert.equal(order.status, "processing"); assert.equal(order.shipping_address.state, "CA");
  assert.ok(!JSON.stringify(order).includes("must-not-leak"));
});
test("allocates fractional item cents exactly and records native aggregate rounding", () => {
  const original = native();
  const items = [1, 2, 3].map((n) => ({ ...original.items[0], id: `ordli_${n}`, quantity: 1, unit_price: "0.335", subtotal: "0.335" }));
  const order = orderSnapshot({ ...original, items, item_subtotal: "1.005", shipping_subtotal: "0.005", tax_total: "0.005", discount_subtotal: 0, credit_line_total: 0, total: "1.015" }, owner);
  assert.deepEqual(order.items.map((item) => item.totalCents), [34, 34, 33]);
  assert.equal(order.subtotal_cents, 101); assert.equal(order.total_cents, 102); assert.equal(order.rounding_cents, -1);
});
test("preserves partial refunds and shipments and distinguishes a label from dispatch", () => {
  const fulfillment = { id: "ful_fixture", canceled_at: null, shipped_at: null, delivered_at: null, items: [{ line_item_id: "ordli_fixture" }], labels: [{ id: "label_fixture", tracking_number: "fixture-tracking", tracking_url: "javascript:alert(1)" }], metadata: { carrier: "Fixture carrier" } };
  const partial = orderSnapshot({ ...native(), payment_status: "partially_refunded", fulfillment_status: "partially_shipped", fulfillments: [fulfillment] }, owner);
  assert.equal(partial.status, "shipped"); assert.equal(partial.payment_status, "partially_refunded"); assert.equal(partial.shipments[0].status, "preparing"); assert.equal(partial.shipments[0].trackingUrl, null);
  const delivered = orderSnapshot({ ...native(), fulfillment_status: "delivered", fulfillments: [{ ...fulfillment, shipped_at: at, delivered_at: at }] }, owner);
  assert.equal(delivered.status, "delivered"); assert.equal(delivered.shipments[0].status, "delivered");
  assert.equal(orderSnapshot({ ...native(), fulfillments: [{ ...fulfillment, canceled_at: at }] }, owner).shipments.length, 0);
});
test("rejects inconsistent totals, other currencies, duplicate items and excessive returned quantities", () => {
  for (const change of [{ total: 1 }, { item_subtotal: 99 }, { currency_code: "eur" }, { items: [native().items[0], native().items[0]] }, { items: [{ ...native().items[0], detail: { return_received_quantity: 3 } }] }]) assert.throws(() => orderSnapshot({ ...native(), ...change }, owner));
});
test("uses only immutable provider identities and rejects ambiguous mappings", async () => {
  let sql, values;
  const container = (rows) => ({ resolve: () => ({ raw: async (query, bindings) => { sql = query; values = bindings; return { rows }; } }) });
  assert.equal(await orderMemberId(null, container([])), null);
  assert.equal(await orderMemberId("cus_fixture", container([{ entity_id: owner }])), owner);
  assert.deepEqual(values, ["cus_fixture"]); assert.ok(sql.includes("p.provider='supabase'") && sql.includes("a.deleted_at is null"));
  assert.equal(await orderMemberId("cus_fixture", container([])), null);
  await assert.rejects(() => orderMemberId("cus_fixture", container([{ entity_id: owner }, { entity_id: owner }])));
  await assert.rejects(() => orderMemberId("cus_fixture", container([{ entity_id: "an-email@example.com" }])));
});
test("resolves real native lifecycle payloads including order_id and fulfillment IDs", async () => {
  let sql, values;
  const connection = { raw: async (query, bindings) => { sql = query; values = bindings; return { rows: [{ order_id: "order_fixture" }, { order_id: "order_fixture" }] }; } };
  assert.deepEqual(await eventOrderIds({ name: OrderWorkflowEvents.FULFILLMENT_CREATED, data: { order_id: "order_fixture" } }, connection), ["order_fixture"]);
  assert.deepEqual(await eventOrderIds({ name: FulfillmentWorkflowEvents.SHIPMENT_CREATED, data: { id: "ful_fixture" } }, connection), ["order_fixture"]);
  assert.ok(sql.includes("commerce.order_fulfillment")); assert.deepEqual(values, ["ful_fixture"]);
  await eventOrderIds({ name: PaymentEvents.REFUNDED, data: { id: "pay_fixture" } }, connection);
  assert.ok(sql.includes("commerce.order_payment_collection") && sql.includes("p.deleted_at is null"));
  for (const event of [FulfillmentWorkflowEvents.SHIPMENT_CREATED, FulfillmentWorkflowEvents.DELIVERY_CREATED, OrderWorkflowEvents.RETURN_RECEIVED, PaymentEvents.CAPTURED, PaymentEvents.REFUNDED]) assert.ok(config.event.includes(event));
  await assert.rejects(() => eventOrderIds({ name: OrderWorkflowEvents.PLACED, data: { id: "cart_foreign" } }, connection));
});
test("rejects an anonymous order read before resolving native workflows", async () => {
  await assert.rejects(() => GET({ auth_context: undefined }, { json: () => assert.fail("must not expose orders") }));
});
test("signs the exact bounded projection and rejects redirects or retryable bridge failures", async () => {
  const names = ["COMMERCE_ORDER_SYNC_SECRET", "SNOWFORCE_STOREFRONT_URL", "NODE_ENV"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]])); const originalFetch = global.fetch;
  Object.assign(process.env, { COMMERCE_ORDER_SYNC_SECRET: "c".repeat(48), SNOWFORCE_STOREFRONT_URL: "http://127.0.0.1:3100", NODE_ENV: "development" });
  const snapshot = { order: orderSnapshot(native(), owner), observedAt: at };
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, "http://127.0.0.1:3100/api/shop/order-sync"); assert.equal(options.redirect, "error");
      const expected = createHmac("sha256", process.env.COMMERCE_ORDER_SYNC_SECRET).update(`${options.headers["x-snowforce-timestamp"]}.${options.body}`).digest("hex");
      assert.equal(options.headers["x-snowforce-signature"], expected); return { ok: true };
    };
    await publishOrderSnapshot(snapshot);
    global.fetch = async () => ({ ok: false }); await assert.rejects(() => publishOrderSnapshot(snapshot));
    process.env.NODE_ENV = "production"; await assert.rejects(() => publishOrderSnapshot(snapshot));
    process.env.SNOWFORCE_STOREFRONT_URL = "https://user:password@store.invalid"; await assert.rejects(() => publishOrderSnapshot(snapshot));
  } finally { global.fetch = originalFetch; for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});
