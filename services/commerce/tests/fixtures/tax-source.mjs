import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { configuredMetadata, warehouseFixture } from "./tax-configuration.mjs";
import { productFixture, stateFixture } from "./tax-classification.mjs";
import { setupReaderFixture } from "./tax-setup.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { decorateCartTotals } = require("@medusajs/utils");
const service = require("../../src/lib/tax-quote-source.ts");
const { shippingPriceRecords } = require("../../src/lib/shipping-policy.ts");
const { taxQuoteInputSchema } = require("../../src/lib/tax-quote-contract.ts");
const auth = { actor_type: "customer", actor_id: "cus_fixture" };
function nativeCart(price = 110, discount = 10.01, shipping = 9.95) {
  // Exercise the installed native amount engine, not a second implementation of its totals.
  return JSON.parse(JSON.stringify(decorateCartTotals({
    id: "cart_fixture", customer_id: "cus_fixture", region_id: "reg_fixture", currency_code: "usd", email: "fixture@example.test", completed_at: null,
    metadata: { ignored_browser_claim: { california_permit_confirmed: true, tax_code: "txcd_00000000", amount_cents: 1 } },
    shipping_address: { first_name: "Fixture", last_name: "Rider", address_1: "1 Test Street", address_2: "", city: "Fixture city", province: "ca", postal_code: "92614", country_code: "us", phone: "5551234567" },
    items: [{ id: "cali_fixture", variant_id: "variant_fixture", title: "Fixture jacket", product_handle: "fixture", product_title: "Fixture jacket", variant_title: "M", thumbnail: null, metadata: null, quantity: 1, unit_price: price, is_tax_inclusive: false, is_custom_price: false, tax_lines: [], adjustments: discount ? [{ id: "caliadj_fixture", amount: discount, is_tax_inclusive:false }] : [] }],
    shipping_methods: [{ id: "casm_fixture", shipping_option_id: "so_fixture", name: "US standard", amount: shipping, is_tax_inclusive: false, tax_lines: [], adjustments: [] }], payment_collection: null,
  })));
}
function fixture(cart = nativeCart()) {
  const product = productFixture();
  const metadata = { ...configuredMetadata(), snowforce_tax_classifications: { [product.id]: stateFixture(product) } };
  const f = { cart, metadata, product, warehouse: warehouseFixture(), date: new Date().toISOString(), privateReads: 0, graphCalls: [], providerCalls: 0, cartReads: 0, onCartRead: null, onAccount: null, failDb: false };
  f.region = { currency_code: "usd", countries: [{ iso_2: "us" }] };
  f.option = { id: "so_fixture", provider_id: "snowforce_us_snowforce", type: { code: "snowforce-us-standard" }, price_type: "calculated", prices: shippingPriceRecords({ fee_cents: 995, free_threshold_cents: 10000 }).map(({ rules, ...row }) => ({ ...row, price_rules: rules })), service_zone: { geo_zones: taxQuoteInputSchema.shape.collecting_states.element.options.map(state => ({ type: "province", country_code: "us", province_code: state.toLowerCase() })) } };
  const graph = async request => {
    f.graphCalls.push(request);
    if (request.entity === "cart") { f.cartReads++; f.onCartRead?.(f.cartReads); return { data: [structuredClone(f.cart)] }; }
    if (request.entity === "region") return { data: [structuredClone(f.region)] };
    if (request.entity === "shipping_option") return { data: [structuredClone(f.option)] };
    assert.fail("Unexpected graph entity");
  };
  const db = { raw: async sql => {
    f.privateReads++; if (f.failDb) throw new Error("private-database-detail");
    if (sql.includes("as settings")) return { rows: [{ id: "store_fixture", settings: f.metadata.snowforce_tax_classifications, database_now: f.date }] };
    if (sql.startsWith("select id,metadata,clock_timestamp()")) return { rows: [{ id: "store_fixture", metadata: structuredClone(f.metadata), database_now: f.date }] };
    if (sql.includes("from commerce.stock_location l left join")) return { rows: f.warehouse ? [structuredClone(f.warehouse)] : [] };
    if (sql.includes("from commerce.cart_line_item li left join")) return { rows: f.cart.items.map(line => ({ id: line.id, variant_id: line.variant_id, product_id: line.variant_id ? f.product.id : null })) };
    if (sql.includes("from commerce.product p")) return { rows: [structuredClone(f.product)] };
    assert.fail("Unexpected private query");
  }, transaction: () => assert.fail("Source reader must never open a write transaction") };
  const reader = setupReaderFixture();
  for (const key of ["account", "settings", "registrations"]) { const original = reader[key]; reader[key] = async (...args) => { f.providerCalls++; if (key === "account") f.onAccount?.(); return original(...args); }; }
  f.setup = reader;
  f.scope = { resolve: key => key === "query" ? { graph } : key === "__pg_connection__" ? db : key === "snowforce_tax_setup_reader" ? f.setup : assert.fail("Unexpected dependency") };
  return f;
}
async function read(f, actor = auth, id = f.cart.id, signals = []) {
  const previous = process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try { process.env.COMMERCE_TAX_POLICY_CONFIRMED = "true"; return await service.readCartTaxQuoteSource(f.scope, actor, id, signals); }
  finally { if (previous === undefined) delete process.env.COMMERCE_TAX_POLICY_CONFIRMED; else process.env.COMMERCE_TAX_POLICY_CONFIRMED = previous; }
}

export {auth,nativeCart,fixture,read};
