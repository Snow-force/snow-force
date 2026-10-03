import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { initialStoreUpdate } = require("../src/lib/store-setup.ts");

test("initializes the native store to USD while preserving unrelated metadata", () => {
  const update = initialStoreUpdate({ metadata: { operator_note: "fixture" } });
  assert.deepEqual(update.supported_currencies, [{ currency_code: "usd", is_default: true }]);
  assert.equal(update.metadata.operator_note, "fixture");
});

test("a repeated setup preserves subsequent operator settings", () => {
  assert.equal(initialStoreUpdate({ metadata: { snowforce_initialized: true } }), null);
});
