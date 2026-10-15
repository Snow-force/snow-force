import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { fulfillmentManifestSchema, initialGeoZones, uniqueSetupRecord } = require("../src/lib/fulfillment-setup.ts");
const { assertCartShippingCoverage } = require("../src/lib/shipping-coverage.ts");
const { GET: shippingOptionsGET } = require("../src/api/store/snowforce/checkout/[id]/shipping-options/route.ts");
const states = "AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const manifest = { location_name: "Irvine", address: { address_1: "1 Park Plaza", address_2: "#600 Office 44", city: "Irvine", province: "ca", postal_code: "92614", country_code: "us" }, states };
test("initial coverage contains exactly the contiguous states and DC, excluding AK, HI and territories", () => {
  const zones = initialGeoZones(manifest);
  assert.equal(zones.length, 49); assert.equal(new Set(zones.map((value) => value.province_code)).size, 49);
  assert.ok(zones.some((value) => value.province_code === "dc"));
  for (const state of ["AK", "HI", "PR", "invalid", "CA"]) assert.equal(fulfillmentManifestSchema.safeParse({ ...manifest, states: [...states.slice(1), state] }).success, false);
  assert.equal(fulfillmentManifestSchema.safeParse({ ...manifest, address: { ...manifest.address, country_code: "ca" } }).success, false);
  assert.equal(fulfillmentManifestSchema.safeParse({ ...manifest, states: states.slice(1) }).success, false);
});
test("ambiguous initialization stops instead of selecting or overwriting operator records", () => {
  assert.equal(uniqueSetupRecord([], "warehouse"), undefined);
  const existing = { id: "sloc_existing", name: "Operator warehouse" };
  assert.equal(uniqueSetupRecord([existing], "warehouse"), existing);
  assert.throws(() => uniqueSetupRecord([existing, { id: "sloc_other" }], "warehouse"));
});
const prices = [{ currency_code: "usd", amount: 9.95, price_rules: [] }, { currency_code: "usd", amount: 0, price_rules: [{ attribute: "item_total", operator: "gte", value: 100 }] }];
const cart = (province) => ({ item_total: 79.95, item_tax_total: 0, shipping_address: { country_code: "us", province }, shipping_methods: [{ shipping_option_id: "so_fixture", amount: 9.95 }] });
const scope = (zones, id = "so_fixture") => ({ resolve: () => ({ graph: async () => ({ data: [{ id, provider_id: "snowforce_us_snowforce", type: { code: "snowforce-us-standard" }, price_type: "calculated", prices, service_zone: { geo_zones: zones } }] }) }) });
test("payment rejects stale or forged coverage for AK, HI, territories and foreign options", async () => {
  const zones = initialGeoZones(manifest);
  for (const state of ["ca", "CA", "dc", "ny"]) await assertCartShippingCoverage(cart(state), scope(zones));
  for (const state of ["ak", "hi", "pr", "", "unknown"]) await assert.rejects(() => assertCartShippingCoverage(cart(state), scope(zones)));
  await assert.rejects(() => assertCartShippingCoverage(cart("ca"), scope(zones, "so_foreign")));
  await assert.rejects(() => assertCartShippingCoverage(cart("ca"), scope([])));
  await assert.rejects(() => assertCartShippingCoverage({ ...cart("ca"), shipping_methods: [] }, scope(zones)));
  await assert.rejects(() => assertCartShippingCoverage({ ...cart("ca"), shipping_address: null }, scope(zones)));
  await assert.rejects(() => assertCartShippingCoverage(cart("ca"), scope([{ type: "province", country_code: "ca", province_code: "ca" }])));
});
test("operator coverage changes in the database take effect on the next payment check", async () => {
  const zones = [{ type: "province", country_code: "us", province_code: "ca" }];
  const container = scope(zones);
  await assertCartShippingCoverage(cart("ca"), container);
  zones[0].province_code = "ny";
  await assert.rejects(() => assertCartShippingCoverage(cart("ca"), container));
  await assertCartShippingCoverage(cart("ny"), container);
  await assertCartShippingCoverage(cart("ca"), scope([{ type: "country", country_code: "us", province_code: null }]));
  await assert.rejects(() => assertCartShippingCoverage(cart("ca"), scope([{ type: "zip", country_code: "us", province_code: "ca" }])));
});
test("payment rejects a tax-based free-shipping quote and rechecks the live fee", async () => {
  const container = scope(initialGeoZones(manifest));
  const taxed = { ...cart("ca"), item_total: 108.24, item_tax_total: 8.25 };
  await assertCartShippingCoverage(taxed, container);
  await assert.rejects(() => assertCartShippingCoverage({ ...taxed, shipping_methods: [{ shipping_option_id: "so_fixture", amount: 0 }] }, container), /price changed/);
  const threshold = { ...taxed, item_total: 108.25, shipping_methods: [{ shipping_option_id: "so_fixture", amount: 0 }] };
  await assertCartShippingCoverage(threshold, container);
  await assert.rejects(() => assertCartShippingCoverage({ ...threshold, shipping_methods: cart("ca").shipping_methods }, container), /price changed/);
});
test("calculated shipping quote endpoint rejects anonymous and foreign carts before native workflows", async () => {
  const request = (actor) => ({ method: "GET", path: "/store/snowforce/checkout/cart_fixture/shipping-options", params: { id: "cart_fixture" }, query: {}, auth_context: actor ? { actor_id: actor } : undefined, scope: { resolve: () => ({ graph: async () => ({ data: [{ id: "cart_fixture", customer_id: "cus_owner" }] }) }) } });
  for (const actor of [undefined, "cus_other"]) await assert.rejects(() => shippingOptionsGET(request(actor), { json: () => assert.fail("must not return another customer’s delivery quote") }));
});
