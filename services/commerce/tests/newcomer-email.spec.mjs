import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { queueNewcomerEmail, processNewcomerEmails, renderNewcomerEmail, newcomerEmailConfiguration, applyNewcomerEmailEvents } = require("../src/lib/newcomer-email.ts");
const { newcomerCode } = require("../src/lib/newcomer-policy.ts");
const job = require("../src/jobs/newcomer-emails.ts");
const { marketingWebhook } = require("../src/lib/marketing.ts");
const member = "123e4567-e89b-42d3-a456-426614174001", code = newcomerCode(member), email = "member@example.com", customer = "cus_member";
const env = { NEWCOMER_EMAIL_ENABLED: "true", NEWCOMER_RESEND_API_KEY: "fixture-private-key", NEWCOMER_EMAIL_FROM: "SnowForce <welcome@example.com>", NEWCOMER_REPLY_TO: "hello@example.com", SNOWFORCE_STOREFRONT_URL: "https://snowforce.test", MARKETING_POSTAL_ADDRESS: "Address <script>bad</script>", MARKETING_UNSUBSCRIBE_SECRET: "fixture-unsubscribe-secret-over-32", MARKETING_SENDS_PER_MINUTE: "30" };
beforeEach(() => { Object.assign(process.env, env); });
test("welcome emails inherit only the shop contact address and permit an explicit welcome override", () => {
  const config = { ...env, NEWCOMER_EMAIL_FROM: undefined, NEWCOMER_REPLY_TO: undefined, MARKETING_SHOP_EMAIL_FROM: "SnowForce <noreply@example.com>", MARKETING_SHOP_REPLY_TO: "shop@example.com", MARKETING_EVENT_REPLY_TO: "events@example.com" };
  const sender = newcomerEmailConfiguration(config);
  assert.equal(sender.reply, "shop@example.com");
  assert.equal(sender.from, "SnowForce <noreply@example.com>");
  const payload = renderNewcomerEmail(email, code, new Date("2026-11-10T00:00:00Z"), sender);
  assert.equal(payload.reply_to, "shop@example.com");
  assert.ok(payload.text.includes("shop@example.com"));
  assert.equal(newcomerEmailConfiguration({ ...config, NEWCOMER_REPLY_TO: "welcome@example.com" }).reply, "welcome@example.com");
});
async function fixture() {
  const pg = new PGlite();
  await pg.exec('create schema commerce; create role snowforce_commerce; grant usage on schema commerce to snowforce_commerce; create role anon; create role authenticated; create role service_role;');
  for (const name of ["20261011025512_newcomer_email_limits.sql", "20261011030617_newcomer_welcome_emails.sql"]) await pg.exec(readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
  await pg.exec(`create table commerce.promotion(id text,code text,status text,used int,deleted_at timestamptz);
    create table commerce.snowforce_marketing_rate_windows(minute timestamptz primary key,attempts int);
    create table commerce.snowforce_marketing_suppressions(email text primary key,reason text);
    create table commerce.snowforce_marketing_events(id text primary key,email_id text,type text,processed boolean default false,created_at timestamptz default now());
    create table commerce.snowforce_marketing_recipients(id uuid,provider_id text,email text,status text,error_code text);`);
  await pg.query("insert into commerce.snowforce_newcomer_claims(member_id,email_hash,customer_id,code) values($1,$2,$3,$4)", [member, "a".repeat(64), customer, code]);
  await pg.query("insert into commerce.promotion values('promo_fixture',$1,'active',0,null)", [code]);
  const adapter = connection => ({ raw: (sql, values) => { let index = 0; return connection.query(sql.replace(/\?/g, () => `$${++index}`), values); }, transaction: op => pg.transaction(tx => op(adapter(tx))) });
  const db = adapter(pg), signal = new AbortController(); let tail = Promise.resolve();
  const scope = { resolve: key => key === "locking" ? { execute: (_key, op) => { const next = tail.then(() => op(signal.signal)); tail = next.catch(() => {}); return next; } } : db };
  const endsAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await queueNewcomerEmail(scope, member, customer, "Member@Example.com", code, endsAt);
  return { pg, db, scope, signal, endsAt, row: async () => (await pg.query("select * from commerce.snowforce_newcomer_emails")).rows[0] };
}

test("configuration fails closed and welcome template contains the personal code, bilingual rules and escaped content", () => {
  assert.equal(newcomerEmailConfiguration({}), null);
  for (const changes of [{ NEWCOMER_EMAIL_FROM: "x\r\nBcc:other@example.com" }, { NEWCOMER_EMAIL_FROM: "SnowForce <onboarding@resend.dev>" }, { NEWCOMER_REPLY_TO: "invalid" }, { MARKETING_UNSUBSCRIBE_SECRET: "short" }, { MARKETING_SENDS_PER_MINUTE: "121" }, { SNOWFORCE_STOREFRONT_URL: "http://evil.test" }, { NEWCOMER_RESEND_API_KEY: "" }, { MARKETING_POSTAL_ADDRESS: "" }]) assert.equal(newcomerEmailConfiguration({ ...env, ...changes }), null);
  const message = renderNewcomerEmail(email, code, new Date("2026-12-01T00:00:00Z"), newcomerEmailConfiguration(env));
  assert.deepEqual(message.to, [email]); assert.match(message.text, /10% off regular-price/); assert.match(message.text, /无最低消费/); assert.match(message.text, /每人、每个账户及已验证邮箱仅限一次/); assert.match(message.text, /2026-12-01/);
  assert.match(message.html, new RegExp(code)); assert.ok(!message.html.includes("<script>")); assert.match(message.html, /&lt;script&gt;/); assert.equal(message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});
test("queues one email per issued code, freezes the first registered destination and sends once across workers", async () => {
  const f = await fixture();
  try {
    await Promise.all([queueNewcomerEmail(f.scope, member, customer, email, code, f.endsAt), queueNewcomerEmail(f.scope, member, customer, "changed@example.com", code, f.endsAt)]);
    assert.equal((await f.pg.query("select count(*)::int as n from commerce.snowforce_newcomer_emails")).rows[0].n, 1); assert.equal((await f.row()).email, email);
    let calls = 0; const send = async (message, key) => { calls++; assert.deepEqual(message.to, [email]); assert.equal(key, `newcomer-welcome/${code}`); return { status: "accepted", id: "email_fixture" }; };
    await Promise.all([processNewcomerEmails(f.scope, send), processNewcomerEmails(f.scope, send)]); assert.equal(calls, 1); assert.equal((await f.row()).status, "accepted");
    assert.equal(await queueNewcomerEmail(f.scope, member, customer, email, code, f.endsAt), "accepted");
    await f.pg.exec("set role anon"); await assert.rejects(f.pg.query("select * from commerce.snowforce_newcomer_emails"));
  } finally { await f.pg.close(); }
});
test("transient sends reuse the exact payload and key; expired uncertainty and permanent errors never auto-resend", async () => {
  const f = await fixture();
  try {
    const calls = []; const send = async (message, key) => { calls.push({ message, key }); return { status: "retry", code: "network_unknown" }; };
    await processNewcomerEmails(f.scope, send); assert.equal((await f.row()).status, "queued");
    await f.pg.exec("update commerce.snowforce_newcomer_emails set next_attempt_at=now()-interval '1 second'");
    process.env.NEWCOMER_EMAIL_FROM = "Changed <changed@example.com>"; await processNewcomerEmails(f.scope, send); assert.deepEqual(calls[0], calls[1]);
    await f.pg.exec("update commerce.snowforce_newcomer_emails set first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 second'");
    await processNewcomerEmails(f.scope, send); assert.equal(calls.length, 2); assert.equal((await f.row()).status, "attention");
    await f.pg.exec("update commerce.snowforce_newcomer_emails set status='queued',first_attempt_at=null,next_attempt_at=now()");
    await processNewcomerEmails(f.scope, async () => ({ status: "failed", code: "http_422" })); assert.equal((await f.row()).status, "failed");
    await processNewcomerEmails(f.scope, send); assert.equal(calls.length, 2);
  } finally { await f.pg.close(); }
});
test("lost acceptance persistence retries the original logical send instead of creating a new email", async () => {
  const f = await fixture();
  try {
    let failOnce = true, actualDeliveries = 0; const accepted = new Map();
    const db = { ...f.db, raw: async (sql, values) => { if (failOnce && sql.includes("set status='accepted'")) { failOnce = false; throw new Error("DB unavailable after send"); } return f.db.raw(sql, values); } };
    const scope = { resolve: key => key === "locking" ? f.scope.resolve(key) : db };
    const send = async (_message, key) => { if (!accepted.has(key)) { actualDeliveries++; accepted.set(key, "email_once"); } return { status: "accepted", id: accepted.get(key) }; };
    await processNewcomerEmails(scope, send); assert.equal((await f.row()).status, "queued");
    await f.pg.exec("update commerce.snowforce_newcomer_emails set next_attempt_at=now()-interval '1 second'"); await processNewcomerEmails(scope, send);
    assert.equal(actualDeliveries, 1); assert.equal((await f.row()).status, "accepted");
  } finally { await f.pg.close(); }
});
test("invalid offers, hard suppression, exhausted budgets and lost leases stop before provider calls", async () => {
  const f = await fixture(); const send = () => assert.fail("must not send");
  try {
    await f.pg.query("insert into commerce.snowforce_marketing_suppressions values($1,'bounced')", [email]); await processNewcomerEmails(f.scope, send); assert.equal((await f.row()).status, "suppressed");
    assert.equal(await queueNewcomerEmail(f.scope, member, customer, email, code, f.endsAt), "unavailable");
    await f.pg.exec("delete from commerce.snowforce_marketing_suppressions; update commerce.snowforce_newcomer_emails set status='queued'; update commerce.promotion set used=1");
    await processNewcomerEmails(f.scope, send); assert.equal((await f.row()).status, "expired");
    await f.pg.exec("update commerce.promotion set used=0; update commerce.snowforce_newcomer_emails set status='queued'; insert into commerce.snowforce_marketing_rate_windows values(date_trunc('minute',now()),30) on conflict(minute) do update set attempts=30;");
    await processNewcomerEmails(f.scope, send); assert.equal((await f.row()).status, "queued");
    await f.pg.exec("delete from commerce.snowforce_marketing_rate_windows"); f.signal.abort(); await processNewcomerEmails(f.scope, send);
    process.env.NEWCOMER_EMAIL_ENABLED = "false"; await processNewcomerEmails({ resolve: () => assert.fail("disabled") }, send); await job.default({ resolve: () => assert.fail("disabled") });
  } finally { await f.pg.close(); }
});
test("early and duplicate welcome webhooks reconcile delivery and suppress hard bounces without changing coupon usage", async () => {
  const f = await fixture();
  try {
    await marketingWebhook(f.scope, { id: "evt_bounce", emailId: "email_fixture", type: "email.bounced", bounceType: "Permanent" });
    assert.equal((await f.pg.query("select processed from commerce.snowforce_marketing_events")).rows[0].processed, false);
    await processNewcomerEmails(f.scope, async () => ({ status: "accepted", id: "email_fixture" }));
    assert.equal((await f.row()).delivery_status, "bounced");
    await marketingWebhook(f.scope, { id: "evt_bounce", emailId: "email_fixture", type: "email.bounced", bounceType: "Permanent" });
    await marketingWebhook(f.scope, { id: "evt_late", emailId: "email_fixture", type: "email.delivered" });
    assert.equal((await f.row()).delivery_status, "bounced"); assert.equal((await f.pg.query("select reason from commerce.snowforce_marketing_suppressions")).rows[0].reason, "bounced");
    assert.equal(await queueNewcomerEmail(f.scope, member, customer, email, code, f.endsAt), "unavailable");
    assert.equal((await f.pg.query("select used from commerce.promotion")).rows[0].used, 0);
    await applyNewcomerEmailEvents(f.db);
  } finally { await f.pg.close(); }
});
test("scheduled worker logs a generic error and retains queue state when infrastructure is unavailable", async () => {
  const errors = []; await job.default({ resolve: key => { if (key === "logger") return { error: message => errors.push(message) }; throw new Error("private credentials"); } });
  assert.deepEqual(errors, ["Welcome email worker unavailable; queued messages are retained."]); assert.equal(job.config.schedule, "* * * * *");
});
