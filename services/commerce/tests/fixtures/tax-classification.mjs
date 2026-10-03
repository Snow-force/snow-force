import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const tax = require("../../src/lib/tax-classification.ts");
export const productFixture = () => ({ id: "prod_fixture", title: "Fixture snow jacket", status: "published", subtitle: null, description: "An insulated jacket", type_id: null, is_giftcard: false, material: null, hs_code: null, origin_country: null, variants: [{ id: "variant_fixture", title: "Black / M", material: null, hs_code: null, origin_country: null }] });
// Official identifier used only for isolated fixtures, never a default for real products.
export const codeFixture = () => ({ id: "txcd_99999999", name: "General - Tangible Goods", description: "Any tangible or physical good.", requirements: null });
export const actorFixture = { actor_type: "user", actor_id: "user_fixture" };
export const commandFixture = (source = productFixture(), overrides = {}) => ({ request_id: "123e4567-e89b-42d3-a456-426614174001", expected_revision: 0, source_fingerprint: tax.taxProductFingerprint(source), tax_code: codeFixture().id, confirm_review: true, note: "Reviewed fixture physical merchandise and all variants.", ...overrides });
export const stateFixture = (source = productFixture(), command = commandFixture(source)) => tax.applyTaxClassification(null, source, command, codeFixture(), actorFixture.actor_id, "2026-01-01T00:00:00.000Z").state;
export function checkoutTaxRows(sql, value) {
  const source = productFixture(); source.variants[0].id = value.items[0].variant_id;
  if (sql.includes("from commerce.cart_line_item li left join")) return value.items.map(line => ({ id: line.id, variant_id: line.variant_id, product_id: source.id }));
  if (sql.includes("from commerce.product p")) return [source];
  if (sql.includes("as settings")) return [{ id: "store_fixture", settings: { [source.id]: stateFixture(source) }, database_now: "2026-10-02T18:00:00.000Z" }];
  return null;
}
