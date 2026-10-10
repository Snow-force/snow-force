import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { californiaPermitValidAt, taxConfigurationContentSchema } = require("../src/lib/tax-configuration-contract.ts");
const content = patch => taxConfigurationContentSchema.parse({ legal_seller_name: "Fixture LLC", stock_location_id: "sloc_fixture", shipping_tax_code: null, california_permit_confirmed: true, obligations_reviewed: false, shipping_tax_treatment_reviewed: false, review_note: "Fixture", california_permit_type: "temporary", california_permit_valid_from: "2026-10-07", california_permit_valid_through: "2027-01-04", ...patch });
test("temporary permits use inclusive California calendar dates including DST boundaries", () => {
  assert.equal(californiaPermitValidAt(content(), "2026-10-07T06:59:59.999Z"), false);
  assert.equal(californiaPermitValidAt(content(), "2026-10-07T07:00:00.000Z"), true);
  assert.equal(californiaPermitValidAt(content(), "2027-01-05T07:59:59.999Z"), true);
  assert.equal(californiaPermitValidAt(content(), "2027-01-05T08:00:00.000Z"), false);
});
test("legacy confirmation alone, future, inverted and incomplete permits cannot authorize checkout", () => {
  for (const patch of [{ california_permit_type: undefined }, { california_permit_valid_from: undefined }, { california_permit_valid_through: null }, { california_permit_confirmed: false }, { california_permit_valid_from: "2027-02-01" }]) assert.equal(californiaPermitValidAt(content(patch), "2026-10-08T20:00:00Z"), false);
  assert.equal(californiaPermitValidAt(content(), "invalid"), false);
  assert.throws(() => content({ california_permit_valid_from: "2026-02-30" }));
});
test("a reviewed ongoing permit can omit an end date but cannot start in the future", () => {
  const ongoing = content({ california_permit_type: "ongoing", california_permit_valid_through: null });
  assert.equal(californiaPermitValidAt(ongoing, "2027-01-05T08:00:00Z"), true);
  assert.equal(californiaPermitValidAt(ongoing, "2026-10-06T20:00:00Z"), false);
});
