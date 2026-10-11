import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { marketingOperation, marketingWebhook, unsubscribeMarketing, marketingPreference, processMarketing } = require("../src/lib/marketing.ts");
const { unsubscribeToken } = require("../src/lib/marketing-policy.ts");
const id = "123e4567-e89b-42d3-a456-426614174001", key = "123e4567-e89b-42d3-a456-426614174002";
const content = { subject: "Future ride", preheader: "Mammoth", heading: "Join us", body: "Ride together", image: "", button: "View event", path: "/events/future-ride" };
const campaign = () => ({ id, surface: "event", source: { kind: "event", id: "future-ride" }, source_fingerprint: createHash("sha256").update(JSON.stringify(content)).digest("hex"), content, version: 1, status: "draft", send_key: null, audience: null, created_at: new Date(), sent_at: null });
function fixture() {
  const state = { campaign: campaign(), recipients: [], calls: [], events: [], sourcePublic: true, contacts: [{ email: "member@example.com", sources: ["member", "event"], subscribed: true, optedOut: false }, { email: "legacy@example.com", sources: ["event"], subscribed: false, optedOut: false }] };
  const db = { transaction: async fn => fn(db), raw: async (sql, values = []) => {
    state.calls.push({ sql, values });
    if (sql.startsWith("select * from commerce.snowforce_marketing_campaigns")) return { rows: state.campaign.id === values[0] && state.campaign.surface === values[1] ? [structuredClone(state.campaign)] : [] };
    if (sql.startsWith("select status,count")) return { rows: state.recipients.length ? [{ status: "queued", count: state.recipients.length }] : [] };
    if (sql.startsWith("select email,status,error_code")) return { rows: [] };
    if (sql.startsWith("select email from commerce.customer")) return { rows: [{ email: "member@example.com" }, { email: "shop@example.com" }] };
    if (sql.startsWith("select email from commerce.snowforce_marketing_suppressions")) return { rows: [] };
    if (sql.startsWith("insert into commerce.snowforce_marketing_recipients")) { state.recipients.push({ email: values[2] }); return { rows: [] }; }
    if (sql.startsWith("update commerce.snowforce_marketing_campaigns set status='queued'")) { Object.assign(state.campaign, { status: "queued", send_key: values[0], audience: JSON.parse(values[1]) }); return { rows: [structuredClone(state.campaign)] }; }
    if (sql.startsWith("update commerce.snowforce_marketing_campaigns set content=")) { Object.assign(state.campaign, { content: JSON.parse(values[0]), version: state.campaign.version + 1 }); return { rows: [structuredClone(state.campaign)] }; }
    if (sql.startsWith("select e.id,r.id")) return { rows: [] };
    if (sql.startsWith("insert into commerce.snowforce_marketing_events")) { state.events.push(values); return { rows: [] }; }
    if (sql.startsWith("insert into commerce.snowforce_marketing_suppressions") || sql.startsWith("delete from commerce.snowforce_marketing_suppressions")) return { rows: [] };
    throw new Error(`Unexpected SQL in fixture: ${sql}`);
  } };
  const scope = { resolve: name => { if (name === "__pg_connection__") return db; throw new Error(`Unexpected dependency ${name}`); } };
  const fetcher = async (url, options) => {
    assert.equal(url, "https://snow-force.com/api/marketing/source");
    const command = JSON.parse(JSON.parse(options.body).body);
    return new Response(JSON.stringify(command.action === "event" ? { source: state.campaign.source, ...content, publishable: state.sourcePublic } : { contacts: state.contacts }));
  };
  return { state, scope, fetcher };
}
function configure() { Object.assign(process.env, { SNOWFORCE_STOREFRONT_URL: "https://snow-force.com", MARKETING_ENABLED: "true", MARKETING_INTERNAL_SECRET: "fixture-internal-secret-at-least-32", MARKETING_UNSUBSCRIBE_SECRET: "fixture-unsubscribe-secret-at-least-32", MARKETING_RESEND_API_KEY: "fixture-key", MARKETING_EMAIL_FROM: "SnowForce <news@notifications.snow-force.com>", MARKETING_REPLY_TO: "hello@snow-force.com", MARKETING_POSTAL_ADDRESS: "123 Main St" }); }
test("preview deduplicates all surfaces, excludes legacy contacts, snapshots eligibility and sends only once", async () => {
  configure(); const f = fixture(), original = global.fetch; global.fetch = f.fetcher;
  try {
    const preview = await marketingOperation(f.scope, "event", "staff", { action: "preview", id, version: 1 });
    assert.deepEqual(preview.counts, { total: 3, eligible: 1, suppressed: 0, pending: 2 });
    const command = { action: "send", id, version: 1, requestKey: key, audienceHash: preview.audienceHash };
    assert.equal((await marketingOperation(f.scope, "event", "staff", command)).campaign.status, "queued");
    await marketingOperation(f.scope, "event", "staff", command);
    assert.deepEqual(f.state.recipients, [{ email: "member@example.com" }]);
    await assert.rejects(marketingOperation(f.scope, "event", "staff", { ...command, requestKey: "123e4567-e89b-42d3-a456-426614174003" }));
  } finally { global.fetch = original; }
});
test("stale audiences, unpublished sources, wrong surfaces and unauthorized actors cannot enqueue", async () => {
  configure(); const f = fixture(), original = global.fetch; global.fetch = f.fetcher;
  const command = { action: "send", id, version: 1, requestKey: key, audienceHash: "0".repeat(64) };
  try {
    await assert.rejects(marketingOperation(f.scope, "event", "", command));
    await assert.rejects(marketingOperation(f.scope, "shop", "staff", { action: "get", id }));
    await assert.rejects(marketingOperation(f.scope, "event", "staff", command));
    f.state.sourcePublic = false;
    await assert.rejects(marketingOperation(f.scope, "event", "staff", command));
    f.state.sourcePublic = true;
    const preview = await marketingOperation(f.scope, "event", "staff", { action: "preview", id, version: 1 });
    f.state.contacts[0].optedOut = true;
    await assert.rejects(marketingOperation(f.scope, "event", "staff", { ...command, audienceHash: preview.audienceHash }));
    assert.equal(f.state.recipients.length, 0);
  } finally { global.fetch = original; }
});
test("versioned draft edits cannot change a sent campaign", async () => {
  const f = fixture();
  assert.equal((await marketingOperation(f.scope, "event", "staff", { action: "save", id, version: 1, content: { ...content, subject: "Updated" } })).campaign.version, 2);
  await assert.rejects(marketingOperation(f.scope, "event", "staff", { action: "save", id, version: 1, content }));
  f.state.campaign.status = "queued";
  await assert.rejects(marketingOperation(f.scope, "event", "staff", { action: "save", id, version: 2, content }));
});
test("early and duplicate webhooks are persisted for reconciliation; subscription changes preserve hard suppressions", async () => {
  configure(); const f = fixture();
  await marketingWebhook(f.scope, { id: "webhook_1", type: "email.delivered", emailId: "email_early" });
  assert.deepEqual(f.state.events[0], ["webhook_1", "email_early", "delivered"]);
  await unsubscribeMarketing(f.scope, unsubscribeToken("member@example.com", process.env.MARKETING_UNSUBSCRIBE_SECRET));
  await marketingPreference(f.scope, "member@example.com", true);
  assert.ok(f.state.calls.some(call => call.sql.includes("reason='unsubscribed'")));
  await assert.rejects(unsubscribeMarketing(f.scope, "tampered"));
});
test("worker fails closed when sending is disabled", async () => {
  configure(); process.env.MARKETING_ENABLED = "false";
  await assert.rejects(processMarketing({ resolve: () => assert.fail("No database or provider access") }));
});
