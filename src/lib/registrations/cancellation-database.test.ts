// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
let db: PGlite;
const booker = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333",
  manager = "44444444-4444-4444-8444-444444444444",
  ticket = "55555555-5555-4555-8555-555555555555";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create table auth.users(id uuid primary key);
 create table public.member_profiles(id uuid primary key,user_id uuid);
 create table public.staff_roles(user_id uuid primary key,role text);
 create table public.events(slug text primary key,allow_cancellation boolean);
 create table public.registrations(id uuid primary key,booker_member_id uuid,member_id uuid,event_slug text,status text,attendance_status text,deposit_amount numeric,refunded_amount numeric,payment_method text,stripe_payment_intent_id text,contact_name text,contact_email text);
 create table public.registration_refunds(id uuid primary key,registration_id uuid,status text,amount numeric,currency text);
 create table public.registration_audit_events(registration_id uuid,actor_id text,action text,created_at timestamptz default now());
 create table public.notifications(profile_id uuid,type text check(type in ('registration_changed')),title text,body text,href text);
 create table public.pending_registrations(id uuid primary key,waiver_participant_id uuid,member_id uuid,fulfilled_registration_id uuid,checkout_attempt jsonb,expires_at timestamptz,hold_expires_at timestamptz,superseded_at timestamptz);
 alter table public.registrations add column waiver_participant_id uuid;
 insert into auth.users values('${admin}'),('${manager}');
 insert into public.member_profiles values('${booker}','${booker}'),('${other}','${other}');
 insert into public.staff_roles values('${admin}','admin'),('${manager}','manager');
 insert into public.events values('event',true);`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261103182503_event_cancellation_approval.sql",
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(`truncate public.registration_cancellation_mail,public.registration_cancellation_requests,public.registration_refunds,public.registration_audit_events,public.notifications,public.registrations,public.pending_registrations;
 update public.events set allow_cancellation=true;
 insert into public.registrations(id,booker_member_id,member_id,event_slug,status,attendance_status,deposit_amount,refunded_amount,payment_method,stripe_payment_intent_id,contact_name,contact_email) values('${ticket}','${booker}','${booker}','event','confirmed','unmarked',99,0,'stripe','pi_test','Rider','rider@example.test');`);
});
async function request() {
  const r = await db.query<{ id: string }>(
    `select public.request_registration_cancellation($1,$2,'Cannot attend') id`,
    [ticket, booker],
  );
  return r.rows[0].id;
}
async function review(id: string, actor = admin, approved = true, amount = 99) {
  return db.query(
    "select public.review_registration_cancellation($1,$2,$3,$4,$5)",
    [id, actor, approved, amount, "Policy reviewed"],
  );
}
it("retains the paid place and returns the same pending request on duplicate submission", async () => {
  const id = await request();
  expect(await request()).toBe(id);
  expect(
    (
      await db.query<{ status: string }>(
        "select status from public.registrations",
      )
    ).rows[0].status,
  ).toBe("confirmed");
  expect(
    (await db.query("select * from public.registration_cancellation_mail"))
      .rows,
  ).toHaveLength(2);
  expect(
    (await db.query("select * from public.registration_refunds")).rows,
  ).toHaveLength(0);
});
it("denies forged ownership, disabled cancellation and the old immediate cancellation RPC", async () => {
  await expect(
    db.query("select public.request_registration_cancellation($1,$2,$3)", [
      ticket,
      other,
      "forged",
    ]),
  ).rejects.toThrow("cancellation_request_unavailable");
  await expect(
    db.query("select public.cancel_event_booking_place(null,$1,$2)", [
      ticket,
      booker,
    ]),
  ).rejects.toThrow("cancellation_request_required");
  await db.exec("update public.events set allow_cancellation=false");
  await expect(request()).rejects.toThrow("cancellation_request_unavailable");
});
it("allows withdrawal only before review; rejection retains capacity and sends a decision", async () => {
  let id = await request();
  await expect(
    db.query("select public.withdraw_registration_cancellation($1,$2)", [
      id,
      other,
    ]),
  ).rejects.toThrow("locked");
  await db.query("select public.withdraw_registration_cancellation($1,$2)", [
    id,
    booker,
  ]);
  id = await request();
  await review(id, admin, false, 0);
  expect(
    (
      await db.query<{ status: string }>(
        "select status from public.registrations",
      )
    ).rows[0].status,
  ).toBe("confirmed");
  await expect(
    db.query("select public.withdraw_registration_cancellation($1,$2)", [
      id,
      booker,
    ]),
  ).rejects.toThrow("locked");
});
it("requires admin and valid amounts, approves once and leaves Stripe execution separate", async () => {
  const id = await request();
  await expect(review(id, manager)).rejects.toThrow("admin_required");
  await expect(review(id, admin, true, 100)).rejects.toThrow(
    "decision_invalid",
  );
  await review(id);
  const c = (
    await db.query<{ refund_operation_id: string; status: string }>(
      "select * from public.registration_cancellation_requests",
    )
  ).rows[0];
  expect(c.status).toBe("approved");
  expect(c.refund_operation_id).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    (
      await db.query<{ status: string }>(
        "select status from public.registrations",
      )
    ).rows[0].status,
  ).toBe("cancelled");
  expect(
    (await db.query("select * from public.registration_refunds")).rows,
  ).toHaveLength(0);
  await expect(review(id)).rejects.toThrow("locked");
});
it("blocks direct staff cancellation when a request already exists and denies managers", async () => {
  await expect(
    db.query("select public.admin_cancel_registration($1,$2,$3)", [
      ticket,
      manager,
      "Admin cancellation",
    ]),
  ).rejects.toThrow("admin_required");
  await request();
  await expect(
    db.query("select public.admin_cancel_registration($1,$2,$3)", [
      ticket,
      admin,
      "Admin cancellation",
    ]),
  ).rejects.toThrow("review_existing_request_first");
});
it("keeps requests and commands inaccessible to anonymous and member database roles", async () => {
  const row = (
    await db.query<{ anon: boolean; member: boolean; command: boolean }>(
      `select has_table_privilege('anon','public.registration_cancellation_requests','SELECT') anon,has_table_privilege('authenticated','public.registration_cancellation_requests','UPDATE') member,has_function_privilege('authenticated','public.review_registration_cancellation(uuid,uuid,boolean,numeric,text)','EXECUTE') command`,
    )
  ).rows[0];
  expect(row).toEqual({ anon: false, member: false, command: false });
});
it("prevents discarding an in-flight unpaid checkout and claims email batches only once", async () => {
  await db.query(
    `insert into public.pending_registrations(id,waiver_participant_id,member_id,checkout_attempt) values($1,$1,$2,'{}')`,
    [ticket, booker],
  );
  await expect(
    db.query("select public.cancel_event_booking_place($1,null,$2)", [
      ticket,
      booker,
    ]),
  ).rejects.toThrow("payment_verification_required_before_cancel");
  await request();
  expect(
    (await db.query("select * from public.claim_cancellation_mail()")).rows,
  ).toHaveLength(2);
  expect(
    (await db.query("select * from public.claim_cancellation_mail()")).rows,
  ).toHaveLength(0);
});
