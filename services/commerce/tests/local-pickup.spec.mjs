import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeCart } from "./fixtures/tax-source.mjs";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const pickup = require("../src/lib/local-pickup.ts");
const { shippingPriceRecords, pickupShippingPolicy } = require("../src/lib/shipping-policy.ts");
const { assertCartShippingCoverage } = require("../src/lib/shipping-coverage.ts");
const { createPickupPost } = require("../src/api/store/snowforce/checkout/[id]/pickup/route.ts");
const { createPickupSetupPost, GET: pickupSettings } = require("../src/api/admin/snowforce/shipping/pickup/route.ts");
const Provider = require("../src/modules/snowforce-fulfillment/service.ts").default;
process.env.JWT_SECRET = "fixture-pickup-signing-secret-at-least-32-characters";
const offer = { id: "so_pickup", locationId: "sloc_fixture", name: "Fixture warehouse", address: { address_1: "1 Fixture Plaza", address_2: null, city: "Irvine", province: "ca", postal_code: "92614", country_code: "us" } };
const contact = { name: "Test Rider", phone: "5551234567", appointmentConfirmed: true };
function fixture() {
  const fixtureOffer = structuredClone(offer);
  const f = { cart: nativeCart(79.95, 0, 0), calls: [], store: { default_location_id: offer.locationId, default_sales_channel_id: "sc_fixture", metadata: { snowforce_fulfillment_location_id: offer.locationId, snowforce_pickup_option_id: offer.id } }, location: { id: offer.locationId, name: offer.name, address: offer.address, fulfillment_sets: [{ id: "fs_fixture", type: "pickup" }], fulfillment_providers: [{ id: "snowforce_us_snowforce" }], sales_channels: [{ id: "sc_fixture" }] }, option: { id: offer.id, provider_id: "snowforce_us_snowforce", price_type: "calculated", type: { code: "snowforce-local-pickup" }, prices: shippingPriceRecords(pickupShippingPolicy).map(({ rules, ...price }) => ({ ...price, price_rules: rules })), service_zone: { fulfillment_set_id: "fs_fixture", geo_zones: [{ type: "country", country_code: "us", province_code: null }] }, rules: [{ attribute: "enabled_in_store", operator: "eq", value: "true" }, { attribute: "is_return", operator: "eq", value: "false" }] } };
  f.location.address = fixtureOffer.address;
  f.cart.shipping_address = pickup.pickupAddress(fixtureOffer, contact);
  f.cart.shipping_methods[0].shipping_option_id = offer.id;
  f.cart.metadata[pickup.pickupConfirmationKey] = pickup.sealPickupConfirmation(f.cart, offer, contact);
  f.scope = { resolve: key => key === "locking" ? { execute: async (key, run) => { f.calls.push(key); return run(); } } : { graph: async ({ entity }) => { f.calls.push(entity); return { data: [structuredClone(entity === "cart" ? f.cart : entity === "store" ? f.store : entity === "stock_location" ? f.location : f.option)] }; } } };
  return f;
}
test("pickup uses the configured point, exact zero pricing, native channel and warehouse links", async () => {
  const f = fixture();
  assert.deepEqual(await pickup.readPickupOffer(f.scope), offer);
  await assertCartShippingCoverage(f.cart, f.scope);
  const provider = new Provider();
  assert.equal((await provider.calculatePrice({ id: "snowforce-local-pickup", snowforce_option_id: offer.id }, { amount: 999 }, { snowforce_shipping_quotes: { [offer.id]: { policy: pickupShippingPolicy, item_cents: 7995 } } })).calculated_amount, 0);
  await assert.rejects(() => provider.calculatePrice({ id: "snowforce-local-pickup", snowforce_option_id: offer.id }, {}, { snowforce_shipping_quotes: { [offer.id]: { policy: { fee_cents: 995, free_threshold_cents: 10000 }, item_cents: 10000 } } }));
  for (const mutate of [f => f.store.default_location_id = "sloc_other", f => f.location.sales_channels = [], f => f.location.fulfillment_sets[0].type = "shipping", f => f.location.address.province = "ny", f => f.option.prices[0].amount = 1, f => f.option.rules[0].value = "false", f => f.option.service_zone.geo_zones = []]) {
    const changed = fixture(); mutate(changed);
    await assert.rejects(() => pickup.readPickupOffer(changed.scope));
    await assert.rejects(() => assertCartShippingCoverage(changed.cart, changed.scope));
  }
  const unset = fixture(); delete unset.store.metadata.snowforce_pickup_option_id;
  assert.equal(await pickup.readPickupOffer(unset.scope), null);
});
test("customer-writable metadata cannot grant free delivery or impersonate another appointment", async () => {
  const f = fixture();
  for (const change of [{ id: "cart_other" }, { customer_id: "cus_other" }, { region_id: "reg_other" }, { shipping_address: { ...f.cart.shipping_address, address_1: "Customer home" } }, { shipping_methods: [{ ...f.cart.shipping_methods[0], amount: 0.01 }] }, { metadata: { [pickup.pickupConfirmationKey]: { ...f.cart.metadata[pickup.pickupConfirmationKey], signature: "a".repeat(64) } } }, { metadata: null }]) {
    assert.throws(() => pickup.verifyPickupConfirmation({ ...f.cart, ...change }, offer));
    await assert.rejects(() => assertCartShippingCoverage({ ...f.cart, ...change }, f.scope));
  }
  assert.throws(() => pickup.sealPickupConfirmation(f.cart, offer, { ...contact, appointmentConfirmed: false }));
  assert.throws(() => pickup.sealPickupConfirmation(f.cart, offer, { ...contact, address_1: "Home", amount: 0 }));
  assert.throws(() => pickup.verifyPickupConfirmation(f.cart, { ...offer, address: { ...offer.address, postal_code: "90001" } }));
});
test("pickup mutation verifies ownership, retires the quote and refuses existing payments", async () => {
  const f = fixture(), events = [], response = { json: value => events.push(value) };
  const handler = createPickupPost({ save: async (_scope, cart, savedOffer, savedContact) => { events.push("save"); f.cart.metadata[pickup.pickupConfirmationKey] = pickup.sealPickupConfirmation(cart, savedOffer, savedContact); } }, async () => events.push("withdraw"));
  const req = { body: contact, params: { id: f.cart.id }, auth_context: { actor_id: f.cart.customer_id, actor_type: "customer" }, scope: f.scope };
  await handler(req, response);
  assert.deepEqual(events, ["withdraw", "save", { status: "pickup-saved" }]);
  for (const body of [{ ...contact, appointmentConfirmed: false }, { ...contact, optionId: "so_other" }, { ...contact, price: 0 }]) await assert.rejects(() => handler({ ...req, body }, response));
  events.length = 0;
  await assert.rejects(() => handler({ ...req, auth_context: { actor_id: "cus_other" } }, response));
  assert.deepEqual(events, []);
  f.cart.payment_collection = { id: "paycol_fixture", amount: 79.95, currency_code: "usd", payment_sessions: [{ id: "payses_fixture", provider_id: "pp_stripe_stripe", amount: 79.95, currency_code: "usd", status: "pending", data: null }] };
  await assert.rejects(() => handler(req, response));
  assert.deepEqual(events, []);
});
test("order snapshots retain a verified historical pickup point and reject changed paid amounts", () => {
  const f = fixture();
  assert.equal(pickup.orderPickupSelected(f.cart, 0), true);
  assert.throws(() => pickup.orderPickupSelected(f.cart, 1));
  assert.throws(() => pickup.orderPickupSelected({ ...f.cart, customer_id: "cus_other" }, 0));
  assert.equal(pickup.orderPickupSelected({ ...f.cart, shipping_methods: [{ shipping_option_id: "so_delivery", amount: 9.95 }] }, 995), false);
});
test("pickup configuration requires staff, explicit review and a verified saved option", async () => {
  const f = fixture(), calls = [], res = { json: value => calls.push(value), setHeader: () => {} };
  const post = createPickupSetupPost(async () => { calls.push("configure"); }, async () => offer);
  const req = { auth_context: { actor_type: "user", actor_id: "user_fixture" }, scope: f.scope, body: { confirm_review: true } };
  for (const auth of [undefined, { actor_type: "customer", actor_id: "cus_fixture" }]) {
    await assert.rejects(() => post({ ...req, auth_context: auth }, res));
    await assert.rejects(() => pickupSettings({ ...req, auth_context: auth }, res));
  }
  for (const body of [{}, { confirm_review: false }, { confirm_review: true, amount: 0 }, { confirm_review: true, locationId: "sloc_other" }]) await assert.rejects(() => post({ ...req, body }, res));
  assert.deepEqual(calls, []);
  await post(req, res);
  assert.deepEqual(calls, ["configure", { pickupOffer: offer }]);
  await assert.rejects(() => createPickupSetupPost(async () => {}, async () => null)(req, res));
});
test("pickup metadata saves preserve concurrent tax and policy reviews and reject moved warehouses", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec("create schema commerce; create table commerce.store(id text primary key,metadata jsonb,updated_at timestamptz,deleted_at timestamptz)");
    const metadata = { snowforce_fulfillment_location_id: "sloc_fixture", snowforce_service_zone_id: "serzo_fixture", snowforce_shop_policy: { revision: 4 }, snowforce_tax_configuration: { revision: 3 } };
    await db.query("insert into commerce.store(id,metadata)values($1,$2::jsonb)", ["store_fixture", JSON.stringify(metadata)]);
    const connection = { raw: async (sql, values) => { let i = 0; return db.query(sql.replace(/\?/g, () => "$" + ++i), values); } };
    const input = { storeId: "store_fixture", locationId: "sloc_fixture", serviceZoneId: "serzo_fixture", optionId: "so_pickup" };
    await pickup.persistPickupOption(connection, input);
    assert.deepEqual((await db.query("select metadata from commerce.store")).rows[0].metadata, { ...metadata, snowforce_pickup_option_id: "so_pickup" });
    await pickup.persistPickupOption(connection, input);
    for (const changed of [{ ...input, locationId: "sloc_other" }, { ...input, serviceZoneId: "serzo_other" }, { ...input, optionId: "so_other" }]) await assert.rejects(() => pickup.persistPickupOption(connection, changed));
  } finally { await db.close(); }
});
