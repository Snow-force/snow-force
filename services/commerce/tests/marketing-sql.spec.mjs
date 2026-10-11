import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { marketingOperation, marketingWebhook, unsubscribeMarketing, processMarketing, sourceDraft } = require("../src/lib/marketing.ts");
const { unsubscribeToken } = require("../src/lib/marketing-policy.ts");
const { POST: internalPost } = require("../src/api/internal/marketing/route.ts");
const { signMarketing } = require("../src/lib/marketing-policy.ts");
const campaignId = "123e4567-e89b-42d3-a456-426614174001", sendKey = "123e4567-e89b-42d3-a456-426614174002";
const content = { subject: "Future ride", preheader: "Mammoth", heading: "Join us", body: "Ride together", image: "", button: "View event", path: "/events/future-ride" };
const originalFetch = global.fetch;
let pg, scope, contacts, providerCalls, provider, sourceUnavailable, eventPublic;
function connection(database) { return { raw: async (sql, values = []) => { let index = 0; return database.query(sql.replace(/\?/g, () => `$${++index}`), values); }, transaction: fn => database.transaction(tx => fn(connection(tx))) }; }
before(async () => {
  pg = new PGlite();
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls; create role snowforce_commerce; create schema commerce authorization snowforce_commerce;");
  await pg.exec(readFileSync(new URL("../../../supabase/migrations/20261011003726_marketing_campaigns.sql", import.meta.url), "utf8"));
  await pg.exec("create table commerce.customer(email text,deleted_at timestamptz); alter table commerce.customer owner to snowforce_commerce; set role snowforce_commerce;");
  await pg.exec("create table commerce.product(id text primary key,title text,handle text,description text,thumbnail text,status text,collection_id text,deleted_at timestamptz); create table commerce.product_collection(id text primary key,title text,handle text,metadata jsonb,deleted_at timestamptz); create table commerce.promotion(id text primary key,code text,is_automatic boolean,status text,\"limit\" integer,used integer,campaign_id text,deleted_at timestamptz); create table commerce.promotion_campaign(id text primary key,starts_at timestamptz,ends_at timestamptz,deleted_at timestamptz); create table commerce.promotion_campaign_budget(id text primary key,campaign_id text,attribute text,\"limit\" integer,used integer,deleted_at timestamptz);");
  const db = connection(pg);
  scope = { resolve: key => { if (key === "__pg_connection__") return db; if (key === "locking") return { execute: async (_key, fn) => fn(new AbortController().signal) }; throw new Error(`Unexpected dependency ${key}`); } };
});
beforeEach(async () => {
  for (const key of ["MARKETING_SHOP_EMAIL_FROM", "MARKETING_EVENT_EMAIL_FROM", "MARKETING_SHOP_REPLY_TO", "MARKETING_EVENT_REPLY_TO"]) delete process.env[key];
  await pg.exec("truncate commerce.snowforce_marketing_campaigns,commerce.snowforce_marketing_recipients,commerce.snowforce_marketing_suppressions,commerce.snowforce_marketing_events,commerce.snowforce_marketing_rate_windows,commerce.snowforce_marketing_nonces cascade;");
  await pg.exec("truncate commerce.product,commerce.product_collection,commerce.promotion,commerce.promotion_campaign,commerce.promotion_campaign_budget;");
  Object.assign(process.env, { SNOWFORCE_STOREFRONT_URL: "https://snow-force.com", MARKETING_ENABLED: "true", MARKETING_INTERNAL_SECRET: "fixture-marketing-internal-secret-32", MARKETING_UNSUBSCRIBE_SECRET: "fixture-marketing-unsubscribe-secret-32", MARKETING_RESEND_API_KEY: "fixture-provider-key", MARKETING_EMAIL_FROM: "SnowForce <news@notifications.snow-force.com>", MARKETING_REPLY_TO: "hello@snow-force.com", MARKETING_POSTAL_ADDRESS: "123 Main St", MARKETING_SENDS_PER_MINUTE: "5" });
  contacts = [{ email: "member@example.com", sources: ["member", "event", "shop"], subscribed: true, optedOut: false }]; providerCalls = []; sourceUnavailable = false; eventPublic = true;
  provider = async () => new Response(JSON.stringify({ id: `email_${providerCalls.length}` }));
  global.fetch = async (url, options) => {
    if (url === "https://snow-force.com/api/marketing/source") {
      if (sourceUnavailable) return new Response(null, { status: 503 });
      const command = JSON.parse(JSON.parse(options.body).body);
      return new Response(JSON.stringify(command.action === "event" ? { source: { kind: "event", id: "future-ride" }, ...content, publishable: eventPublic } : { contacts }));
    }
    assert.equal(url, "https://api.resend.com/emails"); providerCalls.push({ key: options.headers["Idempotency-Key"], body: options.body }); return provider();
  };
});
after(async () => { global.fetch = originalFetch; await pg.close(); });
async function queue() {
  const created = await marketingOperation(scope, "event", "staff", { action: "create", source: { kind: "event", id: "future-ride" }, requestKey: campaignId });
  assert.equal(created.campaign.id, campaignId);
  const preview = await marketingOperation(scope, "event", "staff", { action: "preview", id: campaignId, version: 1 });
  return marketingOperation(scope, "event", "staff", { action: "send", id: campaignId, version: 1, requestKey: sendKey, audienceHash: preview.audienceHash });
}
async function recipients() { return (await pg.query("select * from commerce.snowforce_marketing_recipients order by email")).rows; }
test("personal newcomer codes are excluded from sources and rejected when selected directly or copied", async () => {
  const code = "WELCOME-" + "A".repeat(32);
  await pg.query("insert into commerce.promotion(id,code,is_automatic,status,\"limit\",used) values('promo_personal',$1,false,'active',1,0)", [code]);
  const sources = await marketingOperation(scope, "shop", "staff", { action: "sources" });
  assert.equal(sources.sources.some(source => source.id === "promo_personal"), false);
  await assert.rejects(sourceDraft(scope, { kind: "promotion", id: "promo_personal" }), /Personal welcome/);
  await assert.rejects(marketingOperation(scope, "shop", "staff", { action: "create", source: { kind: "promotion", id: "promo_personal" }, requestKey: campaignId }), /Personal welcome/);
  assert.equal((await pg.query("select count(*)::int as count from commerce.snowforce_marketing_campaigns")).rows[0].count, 0);
});
test("real event and shop drafts deliver tests with separate reply addresses and independent readiness", async () => {
  process.env.MARKETING_SHOP_REPLY_TO = "shop@example.com";
  process.env.MARKETING_EVENT_REPLY_TO = "events@example.com";
  process.env.MARKETING_EMAIL_FROM = "SnowForce <noreply@notifications.snow-force.com>";
  await marketingOperation(scope, "event", "staff", { action: "create", source: { kind: "event", id: "future-ride" }, requestKey: campaignId });
  await pg.exec("insert into commerce.product values ('prod_email','Gear','gear','New gear',null,'published',null,null);");
  await marketingOperation(scope, "shop", "staff", { action: "create", source: { kind: "product", id: "prod_email" }, requestKey: sendKey });
  await marketingOperation(scope, "event", "staff", { action: "test", id: campaignId, version: 1, email: "test@example.com" });
  await marketingOperation(scope, "shop", "staff", { action: "test", id: sendKey, version: 1, email: "test@example.com" });
  assert.deepEqual(providerCalls.map(call => JSON.parse(call.body).reply_to), ["events@example.com", "shop@example.com"]);
  assert.ok(providerCalls.every(call => JSON.parse(call.body).from === process.env.MARKETING_EMAIL_FROM));
  process.env.MARKETING_EVENT_REPLY_TO = "";
  assert.equal((await marketingOperation(scope, "event", "staff", { action: "list" })).ready, false);
  assert.equal((await marketingOperation(scope, "shop", "staff", { action: "list" })).ready, true);
  await assert.rejects(marketingOperation(scope, "event", "staff", { action: "test", id: campaignId, version: 1, email: "test@example.com" }));
  assert.equal(providerCalls.length, 2);
});
test("migration denies public customer-data access and atomically enqueues a unique recipient snapshot", async () => {
  const permissions = await pg.query("select has_table_privilege('anon','commerce.snowforce_marketing_recipients','select') as anonymous,has_table_privilege('authenticated','commerce.snowforce_marketing_campaigns','select') as member");
  assert.deepEqual(permissions.rows[0], { anonymous: false, member: false });
  await queue(); const first = await recipients(); assert.equal(first.length, 1);
  await marketingOperation(scope, "event", "staff", { action: "send", id: campaignId, version: 1, requestKey: sendKey, audienceHash: "0".repeat(64) });
  assert.equal((await recipients()).length, 1);
  await assert.rejects(pg.query("insert into commerce.snowforce_marketing_recipients(id,campaign_id,email,sources) values(gen_random_uuid(),$1,'member@example.com','[]')", [campaignId]));
});
test("worker delivers privately with frozen content; duplicate ticks never resend accepted messages", async () => {
  await queue(); await processMarketing(scope); await processMarketing(scope);
  const rows = await recipients(); assert.equal(rows[0].status, "accepted"); assert.equal(providerCalls.length, 1);
  const payload = JSON.parse(providerCalls[0].body); assert.deepEqual(payload.to, ["member@example.com"]);
  assert.ok(payload.headers["List-Unsubscribe"].includes("/api/marketing/unsubscribe?token="));
  assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal((await pg.query("select status from commerce.snowforce_marketing_campaigns")).rows[0].status, "completed");
});
test("unknown provider response resumes with the same key and body and expires into review", async () => {
  await queue(); provider = async () => { throw new Error("Uncertain response"); }; await processMarketing(scope);
  assert.equal((await recipients())[0].status, "queued");
  await pg.exec("update commerce.snowforce_marketing_recipients set next_attempt_at=now(); truncate commerce.snowforce_marketing_rate_windows;");
  await processMarketing(scope); assert.deepEqual(providerCalls[0], providerCalls[1]);
  await pg.exec("update commerce.snowforce_marketing_recipients set next_attempt_at=now(),first_attempt_at=now()-interval '24 hours'; truncate commerce.snowforce_marketing_rate_windows;");
  await processMarketing(scope); assert.equal((await recipients())[0].status, "attention"); assert.equal(providerCalls.length, 2);
});
test("queued unsubscribes and fresh member opt-outs prevent any provider request", async () => {
  await queue(); await unsubscribeMarketing(scope, unsubscribeToken("member@example.com", process.env.MARKETING_UNSUBSCRIBE_SECRET)); await processMarketing(scope);
  assert.equal((await recipients())[0].status, "suppressed"); assert.equal(providerCalls.length, 0);
  await pg.exec("truncate commerce.snowforce_marketing_suppressions; update commerce.snowforce_marketing_recipients set status='queued',next_attempt_at=now(); truncate commerce.snowforce_marketing_rate_windows;");
  contacts[0].optedOut = true; await processMarketing(scope); assert.equal((await recipients())[0].status, "suppressed"); assert.equal(providerCalls.length, 0);
});
test("events unpublished after queuing cannot be promoted", async () => {
  await queue(); eventPublic = false; await processMarketing(scope);
  assert.equal(providerCalls.length, 0); assert.equal((await recipients())[0].error_code, "source_unavailable");
});
test("early, duplicate and out-of-order delivery events preserve hard suppression", async () => {
  await queue(); provider = async () => { await marketingWebhook(scope, { id: "event_early", type: "email.delivered", emailId: "email_1" }); return new Response(JSON.stringify({ id: "email_1" })); };
  await processMarketing(scope); assert.equal((await recipients())[0].status, "delivered");
  await marketingWebhook(scope, { id: "event_bounce", type: "email.bounced", emailId: "email_1", bounceType: "Permanent" });
  await marketingWebhook(scope, { id: "event_bounce", type: "email.bounced", emailId: "email_1", bounceType: "Permanent" });
  await marketingWebhook(scope, { id: "event_late", type: "email.delivered", emailId: "email_1" });
  assert.equal((await recipients())[0].status, "bounced");
  assert.equal((await pg.query("select reason from commerce.snowforce_marketing_suppressions")).rows[0].reason, "bounced");
  assert.equal((await pg.query("select count(*)::int as count from commerce.snowforce_marketing_events")).rows[0].count, 3);
});
test("transient bounces do not unsubscribe customers and later delivery can recover", async () => {
  await queue(); await processMarketing(scope);
  await marketingWebhook(scope, { id: "event_soft", type: "email.bounced", emailId: "email_1", bounceType: "Transient" });
  assert.equal((await recipients())[0].status, "failed");
  assert.equal((await pg.query("select count(*)::int as count from commerce.snowforce_marketing_suppressions")).rows[0].count, 0);
  await marketingWebhook(scope, { id: "event_recovered", type: "email.delivered", emailId: "email_1" });
  assert.equal((await recipients())[0].status, "delivered");
});
test("rate budget is shared across repeated worker invocations; source failure cannot send", async () => {
  contacts.push({ ...contacts[0], email: "second@example.com" }); process.env.MARKETING_SENDS_PER_MINUTE = "1";
  await queue(); await processMarketing(scope); await processMarketing(scope); assert.equal(providerCalls.length, 1);
  await pg.exec("truncate commerce.snowforce_marketing_rate_windows;"); sourceUnavailable = true; await processMarketing(scope);
  assert.equal(providerCalls.length, 1); assert.ok((await recipients()).some(row => row.status === "queued"));
});
test("replayed internal requests are rejected before business operations", async () => {
  const body = signMarketing({ kind: "event", actor: "staff", command: { action: "list" } }, process.env.MARKETING_INTERNAL_SECRET);
  let code = 200; const res = { status(value) { code = value; return res; }, json(value) { return value; } };
  await internalPost({ body, scope }, res); await internalPost({ body, scope }, res); assert.equal(code, 409);
  await assert.rejects(internalPost({ body: { ...body, signature: "0".repeat(64) }, scope }, res));
});
test("shop sources use the real storefront product path and promotions require a visible active collection", async () => {
  await pg.exec("insert into commerce.product_collection values('pcol_gear','Snow gear','gear','{\"snowforce_navigation_section\":\"sale\",\"snowforce_promotion_code\":\"SNOW10\"}',null); insert into commerce.product values('prod_gear','Snow jacket','snow-jacket','Stay warm',null,'published','pcol_gear',null); insert into commerce.promotion values('promo_gear','SNOW10',false,'active',100,0,null,null);");
  const product = await sourceDraft(scope, { kind: "product", id: "prod_gear" }); assert.equal(product.content.path, "/shop/snow-jacket"); assert.equal(product.publishable, true);
  assert.equal((await sourceDraft(scope, { kind: "collection", id: "pcol_gear" })).publishable, true);
  const promotion = await sourceDraft(scope, { kind: "promotion", id: "promo_gear" }); assert.equal(promotion.publishable, true); assert.ok(promotion.content.body.includes("SNOW10"));
  const sources = await marketingOperation(scope, "shop", "admin", { action: "sources" }); assert.equal(sources.sources.length, 3);
  await pg.exec("update commerce.promotion set status='draft';"); assert.equal((await sourceDraft(scope, { kind: "promotion", id: "promo_gear" })).publishable, false);
  await pg.exec("update commerce.promotion set status='active',used=100;"); assert.equal((await sourceDraft(scope, { kind: "promotion", id: "promo_gear" })).publishable, false);
  await pg.exec("update commerce.product_collection set metadata=metadata||'{\"snowforce_navigation_section\":\"hidden\"}';"); assert.equal((await sourceDraft(scope, { kind: "collection", id: "pcol_gear" })).publishable, false);
  await pg.exec("update commerce.product set status='draft';"); assert.equal((await sourceDraft(scope, { kind: "product", id: "prod_gear" })).publishable, false);
  await pg.exec("insert into commerce.promotion values('promo_direct','DIRECT10',false,'active',100,0,null,null);");
  const direct = await sourceDraft(scope, { kind: "promotion", id: "promo_direct" }); assert.equal(direct.publishable, true); assert.equal(direct.content.path, "/shop/sale"); assert.ok(direct.content.body.includes("DIRECT10"));
});
test("changed promotion codes after queueing cannot send stale offers", async () => {
  await pg.exec("insert into commerce.promotion values('promo_direct','DIRECT10',false,'active',100,0,null,null);");
  await marketingOperation(scope, "shop", "admin", { action: "create", source: { kind: "promotion", id: "promo_direct" }, requestKey: campaignId });
  const preview = await marketingOperation(scope, "shop", "admin", { action: "preview", id: campaignId, version: 1 });
  await marketingOperation(scope, "shop", "admin", { action: "send", id: campaignId, version: 1, requestKey: sendKey, audienceHash: preview.audienceHash });
  await pg.exec("update commerce.promotion set code='NEW10';");
  await processMarketing(scope); assert.equal(providerCalls.length, 0); assert.equal((await recipients())[0].error_code, "source_unavailable");
});
test("test delivery is explicit, tagged and cannot claim success on provider failures", async () => {
  await marketingOperation(scope, "event", "staff", { action: "create", source: { kind: "event", id: "future-ride" }, requestKey: campaignId });
  const command = { action: "test", id: campaignId, version: 1, email: "admin@example.com" };
  assert.equal((await marketingOperation(scope, "event", "staff", command)).accepted, true);
  assert.ok(JSON.parse(providerCalls[0].body).subject.startsWith("[TEST]"));
  provider = async () => new Response(null, { status: 503 }); await assert.rejects(marketingOperation(scope, "event", "staff", command));
  assert.equal((await recipients()).length, 0);
});
