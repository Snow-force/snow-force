import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const policy = require("../src/lib/marketing-policy.ts");
const content = { subject: "Future ride", preheader: "Mammoth", heading: "Join <SnowForce>", body: "Ride together\n\n<script>unsafe</script>", image: "https://snow-force.com/gear.jpg", button: "View event", path: "/events/future-ride" };
const secret = "fixture-marketing-signing-secret-at-least-32";
test("event and shop sender identities are independent, including deliberately missing event settings", () => {
  const env = { MARKETING_EMAIL_FROM: "SnowForce <noreply@example.com>", MARKETING_REPLY_TO: "legacy@example.com", MARKETING_EVENT_REPLY_TO: "events@example.com", MARKETING_SHOP_REPLY_TO: "shop@example.com" };
  assert.equal(policy.marketingSender("event", env).reply, "events@example.com");
  assert.equal(policy.marketingSender("shop", env).reply, "shop@example.com");
  assert.equal(policy.marketingSender("event", { ...env, MARKETING_EVENT_REPLY_TO: "" }).reply, "");
  assert.equal(policy.marketingSender("shop", { ...env, MARKETING_SHOP_EMAIL_FROM: "Shop <noreply@shop.example.com>" }).from, "Shop <noreply@shop.example.com>");
});
test("internal protocol rejects altered, expired and malformed signatures", () => {
  const envelope = policy.signMarketing({ action: "list" }, secret, 1000000);
  assert.deepEqual(policy.verifyMarketing(envelope, secret, 1000100).payload, { action: "list" });
  for (const change of [{ body: "{}" }, { nonce: "bad" }, { signature: "x" }, { timestamp: 0 }]) assert.throws(() => policy.verifyMarketing({ ...envelope, ...change }, secret, 1000000));
  assert.throws(() => policy.verifyMarketing(envelope, secret, 1400000));
  assert.throws(() => policy.signMarketing({}, "short"));
  for (const url of ["http://public.example.com", "https://u:p@example.com", "https://example.com/path"]) assert.throws(() => policy.marketingOrigin(url, true));
});
test("rendering escapes content, preserves plain text and disallows unsafe destinations and images", () => {
  const rendered = policy.renderMarketing(content, "https://snow-force.com", "123 Main St", "https://snow-force.com/unsubscribe");
  assert.ok(rendered.html.includes('lang="en"')); assert.ok(rendered.html.includes("&lt;script&gt;")); assert.ok(!rendered.html.includes("<script>"));
  assert.ok(rendered.text.includes("123 Main St")); assert.ok(rendered.text.includes("Unsubscribe:"));
  for (const change of [{ image: "javascript:alert(1)" }, { image: "https://u:p@example.com/a" }, { path: "//attacker.example.com" }, { path: "/events/../admin" }, { subject: "Subject\r\nBcc: attacker@example.com" }]) assert.equal(policy.marketingContent.safeParse({ ...content, ...change }).success, false);
});
test("consent is never inferred from purchase and suppression always wins", () => {
  const contact = { email: "member@example.com", sources: ["shop"], subscribed: false, optedOut: false };
  assert.equal(policy.classifyContact(contact, false), "pending");
  assert.equal(policy.classifyContact({ ...contact, subscribed: true }, false), "eligible");
  assert.equal(policy.classifyContact({ ...contact, subscribed: true, optedOut: true }, false), "suppressed");
  assert.equal(policy.classifyContact({ ...contact, subscribed: true }, true), "suppressed");
});
test("unsubscribe signatures bind the email and never accept tampering", () => {
  const token = policy.unsubscribeToken("MEMBER@example.com", secret);
  assert.equal(policy.verifyUnsubscribe(token, secret), "member@example.com");
  for (const invalid of [token + "x", token + ".extra", "bad.token", "x".repeat(1001)]) assert.throws(() => policy.verifyUnsubscribe(invalid, secret));
  assert.throws(() => policy.verifyUnsubscribe(token, "wrong"));
});
test("provider retries preserve request body and idempotency key without exposing errors", async () => {
  const requests = [], fetcher = async (_url, options) => { requests.push(options); return new Response(JSON.stringify({ id: "email_fixture" })); };
  assert.deepEqual(await policy.deliverMarketing(content, "fixed-key", "fixture-key", fetcher), { status: "accepted", id: "email_fixture" });
  await policy.deliverMarketing(content, "fixed-key", "fixture-key", fetcher);
  assert.deepEqual(requests[0], requests[1]);
  for (const code of [429, 500, 400]) assert.equal((await policy.deliverMarketing(content, "key", "fixture", async () => new Response(null, { status: code }))).status, code === 400 ? "failed" : "retry");
  assert.equal((await policy.deliverMarketing(content, "key", "fixture", async () => { throw new Error("secret@example.com"); })).code, "network_unknown");
  assert.equal((await policy.deliverMarketing(content, "key", "fixture", async () => new Response("{}"))).code, "unknown_response");
  await assert.rejects(policy.deliverMarketing(content, "key", ""));
});
test("migration keeps customer addresses private and enforces unique sends; both editors stay aligned", () => {
  const migration = readFileSync(new URL("../../../supabase/migrations/20261011003726_marketing_campaigns.sql", import.meta.url), "utf8");
  for (const name of ["campaigns", "recipients", "suppressions", "events", "nonces", "rate_windows"]) {
    assert.ok(migration.includes(`alter table commerce.snowforce_marketing_${name} enable row level security`));
    assert.ok(migration.includes(`alter table commerce.snowforce_marketing_${name} owner to snowforce_commerce`));
  }
  assert.ok(migration.includes("unique(campaign_id,email)")); assert.ok(migration.includes("send_key uuid unique"));
  assert.ok(migration.includes("from public,anon,authenticated,service_role")); assert.ok(!migration.includes("security definer"));
  assert.equal(readFileSync(new URL("../../../src/components/admin/marketing-editor.tsx", import.meta.url), "utf8"), readFileSync(new URL("../src/admin/components/marketing-editor.tsx", import.meta.url), "utf8"));
});
