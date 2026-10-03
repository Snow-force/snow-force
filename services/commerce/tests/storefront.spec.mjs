import { test } from "node:test";
import assert from "node:assert/strict";
import { storefrontEnvironment } from "../scripts/configure-storefront.mjs";
test("adds only absent storefront configuration without replacing operator credentials", () => {
  const original = "UNRELATED=keep\nMEDUSA_BACKEND_URL=https://commerce.example.com\nSHOP_CART_COOKIE_SECRET=operator-secret\n";
  const result = storefrontEnvironment(original, "pk_fixture", "a".repeat(64));
  assert.deepEqual(result.added, ["MEDUSA_PUBLISHABLE_KEY"]);
  assert.ok(result.content.startsWith(original));
  assert.ok(!result.content.includes("127.0.0.1"));
  assert.deepEqual(storefrontEnvironment(result.content, "pk_different", "b".repeat(64)).added, []);
});
test("does not write malformed keys or secret values into environment files", () => {
  assert.throws(() => storefrontEnvironment("", "pk_fixture\nBAD=1", "a".repeat(64)));
  assert.throws(() => storefrontEnvironment("", "sk_fixture", "a".repeat(64)));
  assert.throws(() => storefrontEnvironment("", "pk_fixture", "short"));
});
