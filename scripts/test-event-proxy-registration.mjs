// Isolated PostgreSQL acceptance tests. Never reads .env.local or connects remotely.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "services/commerce/package.json"));
const { Client } = require("pg");
const bin = process.env.EVENT_TEST_PG_BIN ?? path.join(root, ".cache/tooling/postgresql/pgsql/bin");
const directory = path.join(root, ".cache", `event-proxy-registration-${randomUUID()}`);
mkdirSync(directory, { recursive: true });
const pgdata = path.join(directory, "pgdata");
const port = await new Promise((resolve, reject) => {
  const server = net.createServer(); server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
});
function run(command, args) {
  const result = spawnSync(path.join(bin, command + (process.platform === "win32" ? ".exe" : "")), args,
    { encoding: "utf8", windowsHide: true, timeout: 45000, stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout}`);
}
const config = { host: "127.0.0.1", port, user: "event_test", database: "postgres" };
assert.equal(config.host, "127.0.0.1");
run("initdb", ["-D", pgdata, "-U", config.user, "-A", "trust", "--encoding=UTF8", "--locale=C"]);
run("pg_ctl", ["-D", pgdata, "-l", path.join(directory, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"]);
const db = new Client(config);
const checks = [];
const booker = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const user = "20000000-0000-4000-8000-000000000001";
async function check(name, work) { await work(); checks.push(name); console.log(`PASS ${name}`); }
async function rejects(sql, values, reason) { await assert.rejects(db.query(sql, values), reason); }
async function event(slug, capacity = 0, max = 5) {
  await db.query("insert into events(slug,status,registration_state,capacity,allow_proxy_registrations,max_proxy_registrations) values($1,'published','open',$2,true,$3)", [slug, capacity, max]);
}
async function pending(slug, { member = booker, key = randomUUID(), kind = "proxy", expires = "2099-01-01", attempt = null } = {}) {
  return (await db.query(`insert into pending_registrations(event_slug,member_id,participant_key,registration_kind,contact_name,contact_email,consent_given,token_hash,expires_at,hold_expires_at,checkout_attempt,waiver_text_en,waiver_text_sha)
    values($1,$2,$3,$4,'Friend','payer@example.test',true,$5,$6,$6,$7,'Event waiver','waiver-sha') returning *`,
  [slug, member, kind === "self" ? "self" : key, kind, randomUUID(), expires, attempt])).rows[0];
}
async function promote(p, { session = null, intent = null } = {}) {
  return (await db.query(`insert into registrations(event_slug,member_id,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,consent_given,pending_registration_id,client_request_key,stripe_checkout_session_id,stripe_payment_intent_id)
    values($1,$2,$3,$4,$5,$6,$7,true,$8::uuid,$8::text,$9,$10) returning *`, [p.event_slug,p.registration_kind === "proxy" ? null : p.member_id,p.member_id,p.registration_kind,p.registration_kind === "proxy" ? "pending" : "not_required",p.contact_name,p.contact_email,p.id,session,intent])).rows[0];
}
try {
  await db.connect();
  const snapshot = JSON.parse(readFileSync(path.join(root, "docs/event-proxy-registration-schema-baseline-20261022.json"), "utf8"));
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') $$;
    create function private.is_staff() returns boolean language sql stable as $$ select false $$;
    create table member_profiles(id uuid primary key, user_id uuid not null);
    create sequence waiver_acceptances_id_seq;`);
  for (const table of ["events", "registrations", "pending_registrations", "waiver_acceptances"]) {
    const columns = snapshot.columns.filter((c) => c.table_name === table).map((c) =>
      `${c.column_name} ${c.data_type}${c.column_default ? ` default ${c.column_default}` : ""}${c.is_nullable === "NO" ? " not null" : ""}`);
    await db.query(`create table public.${table} (${columns.join(",")}); alter table public.${table} enable row level security;`);
  }
  for (const c of snapshot.constraints.filter((c) => !c.definition.startsWith("FOREIGN KEY"))) await db.query(`alter table ${c.table_name} add constraint ${c.conname} ${c.definition}`);
  for (const c of snapshot.constraints.filter((c) => c.definition.startsWith("FOREIGN KEY"))) await db.query(`alter table ${c.table_name} add constraint ${c.conname} ${c.definition}`);
  const originalEvents = readFileSync(path.join(root, "supabase/migrations/20260525090000_rebuild_modular_events.sql"), "utf8");
  const questionTables = originalEvents.slice(originalEvents.indexOf("create table event_registration_questions"), originalEvents.indexOf("create table registrations"));
  await db.query(questionTables);
  await db.query(`create table merchant_booth_programs(id uuid primary key default gen_random_uuid(), event_slug text unique, enabled boolean, payment_instructions_en text, payment_instructions_zh text, updated_at timestamptz default now());
    create table merchant_booth_plans(id uuid primary key,booth_program_id uuid,name_en text,name_zh text,description_en text,description_zh text,price_amount numeric,price_currency text,updated_at timestamptz);
    create table merchant_physical_booths(id uuid primary key,booth_program_id uuid,booth_plan_id uuid,booth_code text,updated_at timestamptz);
    create table stripe_webhook_events(event_id text primary key,event_type text,created_at timestamptz default now());`);
  const aggregateMigration = readFileSync(path.join(root, "supabase/migrations/20260723223333_merchant_profile_owner_writes_and_booth_program_save.sql"), "utf8");
  await db.query(aggregateMigration.slice(aggregateMigration.indexOf("create function public.save_event_aggregate")));
  const constraintNames = new Set(snapshot.constraints.map((c) => c.conname));
  for (const i of snapshot.indexes.filter((i) => !constraintNames.has(i.indexname))) await db.query(i.indexdef);
  for (const p of snapshot.policies) await db.query(`create policy "${p.policyname}" on ${p.tablename} for ${p.cmd}${p.qual ? ` using (${p.qual})` : ""}${p.with_check ? ` with check (${p.with_check})` : ""}`);
  await db.query(`grant usage on schema public,auth to authenticated,anon,service_role;
    grant select on member_profiles,registrations,events to authenticated;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    insert into member_profiles values('${booker}','${user}'),('${other}','20000000-0000-4000-8000-000000000002');
    insert into events(slug,status,registration_state) values('legacy','published','open');
    insert into registrations(event_slug,member_id,contact_name,contact_email,status) values('legacy','${booker}','Legacy','payer@example.test','cancelled');`);
  const checkoutMigration = readFileSync(path.join(root, "supabase/migrations/20260909041600_persist_registration_checkout.sql"), "utf8");
  await db.query(checkoutMigration.slice(checkoutMigration.indexOf("create or replace function private.protect_pending_checkout")));
  await db.query("insert into pending_registrations(event_slug,member_id,contact_name,contact_email,token_hash,created_at,expires_at) values('legacy',$1,'Old form','payer@example.test','old-form','2026-01-01','2026-01-02')",[other]);
  const proxyMigration = readFileSync(path.join(root,"supabase/migrations/20261022194930_event_proxy_registration_v1.sql"),"utf8");
  await check("migration blocks obsolete production coupon semantics before writing schema",async () => {
    await assert.rejects(db.query(proxyMigration),/Apply 20260823071209/); await db.query("rollback");
    assert.equal((await db.query("select count(*) from information_schema.columns where table_name='registrations' and column_name='booker_member_id'")).rows[0].count,"0");
  });
  const originalCoupons = readFileSync(path.join(root,"supabase/migrations/20260728040746_add_event_coupon_codes.sql"),"utf8");
  await db.query(originalCoupons.slice(0,originalCoupons.indexOf("alter table public.pending_registrations")));
  await db.query("alter table event_coupon_codes add column event_slug text references events(slug)");
  await db.query(readFileSync(path.join(root,"supabase/migrations/20260823071209_allow_configurable_coupon_redemptions.sql"),"utf8"));
  await db.query(proxyMigration);
  await db.query(readFileSync(path.join(root,"supabase/migrations/20261023220840_event_proxy_approval.sql"),"utf8"));

  await check("migration does not revive abandoned legacy forms; trip invitations cover the event week",async () => {
    assert.equal((await db.query("select hold_expires_at <= clock_timestamp() as expired from pending_registrations where token_hash='old-form'")).rows[0].expired,true);
    await event("future-trip"); await db.query("update events set event_date=current_date+60 where slug='future-trip'");
    const ticket=await promote(await pending("future-trip"));
    await db.query("select issue_registration_guest_invitation($1,$2,now()+interval '30 days','booker')",[ticket.id,"f".repeat(64)]);
    assert.equal((await db.query("select expires_at >= now()+interval '66 days' as valid_through_trip from registration_guest_invitations where registration_id=$1",[ticket.id])).rows[0].valid_through_trip,true);
  });

  await check("current open event pricing and approval matrix preserves payment, consent and review separately",async () => {
    for (const [slug,model,amount,approval] of [["metroslopes","full_prepay",118,true],["mammoth-opening","deposit",99,true],["mammoth-thanksgiving","deposit",99,false]]) {
      await event(slug,10);
      await db.query("update events set requires_approval=$2,payment_model=$3,deposit_amount=$4,full_payment_amount=$5 where slug=$1",[slug,approval,model,model === "deposit" ? amount : null,model === "full_prepay" ? amount : null]);
      const ticket = await promote(await pending(slug),{ session: `cs_${slug}`,intent: `pi_${slug}` });
      assert.equal(ticket.approval_status,approval ? "pending" : "not_required");
      const token = randomUUID().replaceAll("-","").repeat(2);
      await db.query("select issue_registration_guest_invitation($1,$2,'2099-01-01','booker')",[ticket.id,token]);
      await db.query("select respond_registration_guest_invitation($1,true,'Attendee','attendee')",[token]);
      if (approval) {
        await rejects("select checkin_registration_guest($1,'staff')",[ticket.id],/registration_approval_required/);
        await db.query("update events set requires_approval=false where slug=$1",[slug]);
        await rejects("select checkin_registration_guest($1,'staff')",[ticket.id],/registration_approval_required/);
        await db.query("select review_proxy_registration($1,true,'staff')",[ticket.id]);
        await db.query("select review_proxy_registration($1,true,'staff')",[ticket.id]);
        assert.equal(Number((await db.query("select count(*) from registration_audit_events where registration_id=$1 and action='guest_approved'",[ticket.id])).rows[0].count),1);
      }
      await db.query("select checkin_registration_guest($1,'staff')",[ticket.id]);
    }
  });
  await check("rejecting a paid approval releases its place, retains finance, revokes invitations and forbids reactivation",async () => {
    await event("approval-rejection",1); await db.query("update events set requires_approval=true where slug='approval-rejection'");
    const ticket = await promote(await pending("approval-rejection"),{ session: "cs_reject",intent: "pi_reject" });
    await db.query("update registrations set deposit_amount=99,deposit_status='paid' where id=$1",[ticket.id]);
    await db.query("select issue_registration_guest_invitation($1,$2,'2099-01-01','booker')",[ticket.id,"e".repeat(64)]);
    await db.query("select review_proxy_registration($1,false,'staff')",[ticket.id]);
    const row = (await db.query("select * from registrations where id=$1",[ticket.id])).rows[0];
    assert.equal(row.status,"cancelled"); assert.equal(row.approval_status,"rejected"); assert.equal(Number(row.deposit_amount),99); assert.equal(row.stripe_payment_intent_id,"pi_reject");
    assert.equal((await db.query("select status from registration_guest_invitations where registration_id=$1",[ticket.id])).rows[0].status,"revoked");
    await rejects("update registrations set status='confirmed' where id=$1",[ticket.id],/rejected_registration_must_remain_cancelled/);
    await db.query("update pending_registrations set fulfilled_registration_id=$2 where id=$1",[ticket.pending_registration_id,ticket.id]);
    await pending("approval-rejection");
    await db.query("set role authenticated");
    await rejects("select review_proxy_registration($1,true,'spoofed')",[ticket.id],/permission denied/);
    await db.query("reset role");
  });

  await check("transactional editor RPC persists rollout settings", async () => {
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const core = (await db.query("select * from events where slug='legacy'")).rows[0];
    const changed = (await db.query("select (save_event_aggregate($1,'[]','[]',null,'{}')).*", [{ ...core,slug: "editor-test",allow_proxy_registrations: true,max_proxy_registrations: 3 }])).rows[0];
    assert.equal(changed.allow_proxy_registrations,true); assert.equal(changed.max_proxy_registrations,3);
  });

  await check("legacy identity backfill and default-off flag", async () => {
    const row = (await db.query("select * from registrations where event_slug='legacy'")).rows[0];
    assert.equal(row.booker_member_id, booker); assert.equal(row.attendee_email, "payer@example.test");
    assert.equal((await db.query("select allow_proxy_registrations from events where slug='legacy'")).rows[0].allow_proxy_registrations, false);
    await assert.rejects(pending("legacy"), /proxy_registration_disabled/);
  });
  await check("cancelled self can rebook; active self cannot duplicate", async () => {
    const p = await pending("legacy", { kind: "self" }); await promote(p);
    await rejects("insert into registrations(event_slug,member_id,contact_name,contact_email) values('legacy',$1,'Self','another@example.test')", [booker], /registrations_one_active_member_per_event/);
  });
  await check("one payer can book same-name friends sharing a contact email", async () => {
    await event("friends"); const a = await pending("friends"); const b = await pending("friends");
    const first = await promote(a, { session: "cs_a", intent: "pi_a" }); const second = await promote(b, { session: "cs_b", intent: "pi_b" });
    assert.notEqual(first.id, second.id); assert.equal(first.member_id, null); assert.equal(first.booker_member_id, booker);
    await rejects("update registrations set contact_name='Replacement' where id=$1", [first.id], /proxy_attendee_identity_locked/);
    const snapshot = await pending("friends");
    await rejects("insert into registrations(event_slug,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,consent_given,answers,pending_registration_id) values('friends',$1,'proxy','pending','Friend','payer@example.test',true,'{\"level\":\"replaced\"}',$2)",[booker,snapshot.id],/registration_pending_identity_mismatch/);
    await rejects("update registrations set attendance_status='attended' where id=$1", [first.id], /attendee_authorization_required/);
    await rejects("insert into registrations(event_slug,member_id,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,consent_given,pending_registration_id) values('friends',null,$1,'proxy','pending','Friend','payer@example.test',true,$2)", [booker,a.id], /registrations_pending_once/);
  });
  await check("last seat concurrency and manual writer use the same lock", async () => {
    await event("last-seat", 1);
    const clients = Array.from({ length: 6 }, () => new Client(config)); await Promise.all(clients.map((c) => c.connect()));
    try {
      const results = await Promise.allSettled(clients.map((c) => c.query(`insert into pending_registrations(event_slug,member_id,participant_key,registration_kind,contact_name,contact_email,token_hash,expires_at)
        values('last-seat',$1,$2,'proxy','Friend','payer@example.test',$3,now()+interval '30 minutes')`, [booker,randomUUID(),randomUUID()])));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert(results.filter((r) => r.status === "rejected").every((r) => /registration_capacity_exceeded/.test(r.reason.message)));
      await rejects("insert into registrations(event_slug,contact_name,contact_email) values('last-seat','Manual','payer@example.test')", [], /registration_capacity_exceeded/);
    } finally { await Promise.all(clients.map((c) => c.end())); }
  });
  await check("proxy cap includes active holds and confirmed friends, not self", async () => {
    await event("cap", 0, 2); await promote(await pending("cap", { kind: "self" }));
    await promote(await pending("cap")); await pending("cap");
    await assert.rejects(pending("cap"), /proxy_registration_limit/);
  });
  await check("expired unused holds release; uncertain Stripe checkout retains the seat", async () => {
    await event("holds", 1); await pending("holds", { expires: "2020-01-01" });
    const p = await pending("holds", { attempt: { id: "attempt", params: {} } });
    await db.query("update pending_registrations set hold_expires_at='2020-01-01' where id=$1", [p.id]);
    await rejects("update pending_registrations set contact_name='Replacement' where id=$1", [p.id], /Checkout registration details are locked/);
    await assert.rejects(pending("holds"), /registration_capacity_exceeded/);
    await promote(p); // Converts its own hold without double-counting.
    await event("release",1);
    const expired = await pending("release",{ attempt: { id: "expiry-attempt",sessionId: "cs-expired",params: {} } });
    assert.equal((await db.query("select release_registration_checkout_hold($1,'wrong-attempt','cs-expired') as released",[expired.id])).rows[0].released,false);
    assert.equal((await db.query("select release_registration_checkout_hold($1,'expiry-attempt','cs-expired') as released",[expired.id])).rows[0].released,true);
    await pending("release");
  });
  await check("invitation rotation, adult and guardian signatures, replay and guest check-in", async () => {
    await event("invite"); const p = await pending("invite"); const r = await promote(p);
    const first = "a".repeat(64), second = "b".repeat(64);
    await db.query("select issue_registration_guest_invitation($1,$2,'2099-01-01',$3)", [r.id,first,booker]);
    await db.query("select issue_registration_guest_invitation($1,$2,'2099-01-01',$3)", [r.id,second,booker]);
    await rejects("select respond_registration_guest_invitation($1,true,'Adult Name','attendee')", [first], /invitation_unavailable/);
    await rejects("select checkin_registration_guest($1,'staff')", [r.id], /attendee_authorization_required/);
    await db.query("select respond_registration_guest_invitation($1,true,'Adult Name','attendee')", [second]);
    await rejects("select respond_registration_guest_invitation($1,true,'Adult Name','attendee')", [second], /invitation_unavailable/);
    await db.query("select checkin_registration_guest($1,'staff')", [r.id]); await db.query("select checkin_registration_guest($1,'staff')", [r.id]);
    assert.equal(Number((await db.query("select count(*) from registration_audit_events where registration_id=$1 and action='guest_checkin'", [r.id])).rows[0].count),1);
    const guardian = await promote(await pending("invite"));
    await db.query("select issue_registration_guest_invitation($1,$2,'2099-01-01',$3)", [guardian.id,"c".repeat(64),booker]);
    await db.query("select respond_registration_guest_invitation($1,true,'Guardian Name','guardian')", ["c".repeat(64)]);
  });
  await check("booker RLS isolates records and guest RPCs deny anonymous/authenticated callers", async () => {
    await db.query("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    const own = (await db.query("select * from registrations")).rows;
    assert(own.length > 0); assert(own.every((r) => r.booker_member_id === booker || r.member_id === booker));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["20000000-0000-4000-8000-000000000002"]);
    assert.equal((await db.query("select * from registrations")).rowCount,0);
    await rejects("select * from registration_guest_invitations", [], /permission denied/);
    await rejects("select checkin_registration_guest(gen_random_uuid(),'spoofed')", [], /permission denied/);
    await db.query("reset role");
  });
  await check("single-use and multi-use coupons share the atomic capacity guard", async () => {
    await event("coupon",0,10);
    await db.query("insert into event_coupon_codes(code,discount_type,discount_value,max_redemptions,event_slug) values('SINGLE','percent',100,1,'coupon'),('MULTI','percent',100,2,'coupon')");
    const create = (coupon) => db.query(`insert into registrations(event_slug,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,coupon_code,deposit_status,deposit_amount)
      values('coupon',$1,'proxy','pending','Friend','payer@example.test',$2,'waived',0)`,[booker,coupon]);
    await create("SINGLE"); await assert.rejects(create("SINGLE"),/redemption limit/);
    await create("MULTI"); await create("MULTI"); await assert.rejects(create("MULTI"),/redemption limit/);
    assert.equal(Number((await db.query("select count(*) from registrations where event_slug='coupon'")).rows[0].count),3);
  });
  await check("turning the event flag off stops new friends while existing checkout holds can complete",async () => {
    await event("rollback"); const p = await pending("rollback");
    await db.query("update events set allow_proxy_registrations=false where slug='rollback'");
    await assert.rejects(pending("rollback"),/proxy_registration_disabled/);
    await db.query("update pending_registrations set checkout_attempt=$1 where id=$2",[{ id: "attempt",params: {} },p.id]);
    assert.equal((await promote(p)).registration_kind,"proxy");
  });
  if (process.argv.includes("--stripe")) {
    const { verifyStripeSandbox } = await import("./test-event-proxy-stripe.mjs");
    await verifyStripeSandbox({ root, db, config, directory, booker });
    checks.push("real Stripe sandbox separate checkouts, duplicate fulfillment and per-attendee refunds");
  } else if (process.argv.includes("--web")) {
    const { verifyProxyApprovalBrowser }=await import("./test-event-proxy-browser.mjs");
    await verifyProxyApprovalBrowser({root,db,config,directory,booker});
    checks.push("real local Next approval journey and bilingual ticket gating");
  }
  writeFileSync(path.join(root, "output/event-proxy-registration-db-acceptance-20261023.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), target: "isolated localhost PostgreSQL", productionWrites: 0, checks,
  }, null, 2));
  console.log(`${checks.length} PostgreSQL acceptance groups passed; production writes: 0`);
} finally {
  await db.end(); run("pg_ctl", ["-D", pgdata, "-m", "fast", "-w", "stop"]);
}
