import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { authenticateSupabaseIdentity } = require("../src/modules/supabase-auth/identity.ts");
const { verifyCommerceMembership } = require("../src/modules/supabase-auth/membership.ts");
const id = "00000000-0000-4000-8000-000000000001";
const token = "fixture-verified-access-token";
const user = { id, email: "fixture@example.com", email_confirmed_at: "2026-09-30" };
const identity = { id: "auth_fixture", app_metadata: { customer_id: "cus_fixture" } };
const dependencies = (overrides = {}) => ({ verify: async () => user, identities: { retrieve: async () => identity, create: async () => identity }, ...overrides });
test("maps a verified session by immutable Supabase UUID", async () => {
  let key;
  assert.equal((await authenticateSupabaseIdentity(token, dependencies({ identities: { retrieve: async (filter) => { key = filter.entity_id; return identity; } } }))).success, true);
  assert.equal(key, id);
});
test("rejects missing, expired, unverified and anonymous sessions before identity writes", async () => {
  for (const candidate of [null, { ...user, email_confirmed_at: undefined }, { ...user, is_anonymous: true }]) assert.equal((await authenticateSupabaseIdentity(token, dependencies({ verify: async () => candidate, identities: { retrieve: () => assert.fail("must not read identity"), create: () => assert.fail("must not write identity") } }))).success, false);
  assert.equal((await authenticateSupabaseIdentity(null, dependencies())).success, false);
});
test("creates a new identity without password or editable authorization metadata", async () => {
  let created;
  const result = await authenticateSupabaseIdentity(token, dependencies({ identities: { retrieve: async () => { throw { type: "not_found" }; }, create: async (input) => { created = input; return identity; } } }));
  assert.equal(result.success, true);
  assert.deepEqual(created, { entity_id: id, user_metadata: { email: user.email } });
});
test("recovers a concurrent first login through the unique identity", async () => {
  let reads = 0;
  const result = await authenticateSupabaseIdentity(token, dependencies({ identities: { retrieve: async () => { if (++reads === 1) throw { type: "not_found" }; return identity; }, create: async () => { throw new Error("duplicate"); } } }));
  assert.equal(result.success, true);
  assert.equal(reads, 2);
});
test("fails closed on persistence and Supabase errors without leaking them", async () => {
  const result = await authenticateSupabaseIdentity(token, dependencies({ verify: async () => { throw new Error("secret internal connection"); } }));
  assert.equal(result.success, false);
  assert.ok(!result.error.includes("secret"));
});
test("commerce requires the existing verified profile and current privacy consent", async () => {
  const source = { user: async () => user, profile: async (userId) => { assert.equal(userId, id); return { id: "profile_fixture" }; }, consent: async () => ({ accepted: true, accepted_at: "2026-09-30" }) };
  assert.equal((await verifyCommerceMembership(token, source)).id, id);
  for (const overrides of [{ profile: async () => null }, { consent: async () => null }, { consent: async () => ({ accepted: false, accepted_at: "2026-09-30" }) }, { consent: async () => ({ accepted: true, accepted_at: null }) }]) assert.equal(await verifyCommerceMembership(token, { ...source, ...overrides }), null);
});
