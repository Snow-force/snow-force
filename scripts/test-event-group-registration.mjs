// Runs only inside the disposable localhost PostgreSQL harness. Never reads application credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import path from "node:path";

export async function verifyEventGroupRegistration({ root, db, booker, other }) {
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  await db.query(readFileSync(path.join(root, "supabase/migrations/20261024035754_event_group_waiver_v2.sql"), "utf8"));
  assert.equal(Number((await db.query("select count(*) from events where enable_group_form or require_emailed_waiver")).rows[0].count), 0);
  const adultText = "Adult event risk acknowledgement. I personally accept the event risks and activity terms. Separate marketing and image consent is optional.";
  const guardianText = "Parent and legal guardian acknowledgement. I have legal authority for the named child and personally accept these activity terms. Separate image and marketing permissions are optional.";
  async function event(slug, { capacity = 20, approval = false, date = "2099-11-07" } = {}) {
    await db.query("insert into events(slug,status,registration_state,event_date,capacity,allow_proxy_registrations,max_proxy_registrations,payment_model,requires_approval) values($1,'published','open',$2,$3,true,5,'free',$4)", [slug, date, capacity, approval]);
    await db.query("select save_event_waiver_policy($1,'America/Los_Angeles',$2,$3,$4,$5,'staff',true,true)", [slug, adultText, guardianText, sha(adultText), sha(guardianText)]);
  }
  function person(name, { kind = "proxy", dob = "2080-01-01", email = "adult@example.test", guardian = "Legal Parent" } = {}) {
    return { key: randomUUID(), kind, dateOfBirth: dob, attendeeEmail: email, recipientEmail: dob > "2081-11-07" ? "parent@example.test" : email,
      guardianName: guardian, guardianRelationship: "parent", name, identityFingerprint: sha(`${name}|${dob}`), answers: { name, email } };
  }
  async function book(slug, people, { owner = booker, key = randomUUID(), hash = sha(JSON.stringify(people)) } = {}) {
    return (await db.query("select create_event_booking_v2($1,$2,'payer@example.test',$3,$4,'en',$5) as id", [slug, owner, key, hash, JSON.stringify(people)])).rows[0].id;
  }
  async function pending(id) { return (await db.query("select * from pending_registrations where booking_id=$1 order by created_at,id", [id])).rows; }
  async function promote(p, paid = false) {
    return (await db.query(`insert into registrations(event_slug,member_id,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,contact_phone,consent_given,answers,pending_registration_id,client_request_key,deposit_status,deposit_amount,attendee_email)
      values($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10::uuid,$10::text,$11,$12,$13) returning *`, [p.event_slug, p.registration_kind === "self" ? p.member_id : null, p.member_id, p.registration_kind, p.registration_kind === "proxy" ? "pending" : "not_required", p.contact_name, p.contact_email, p.contact_phone, p.answers, p.id, paid ? "paid" : "pending", paid ? 99 : null, p.attendee_email])).rows[0];
  }
  async function assignment(r) { return (await db.query("select * from event_waiver_assignments where registration_id=$1 and is_current", [r.id])).rows[0]; }
  async function invitation(r) {
    const a = await assignment(r); const token = randomBytes(32).toString("hex");
    await db.query("select queue_event_waiver($1,$2,'encrypted-local-fixture','booker')", [a.id, sha(token)]);
    return { a, token };
  }
  async function verify(token) {
    const codeHash = sha(`${token}:123456`), proofHash = sha(randomUUID());
    assert.equal((await db.query("select queue_event_waiver_code($1,$2,'encrypted-local-code') as ok", [sha(token), codeHash])).rows[0].ok, true);
    assert.equal((await db.query("select verify_event_waiver_code($1,$2,$3) as ok", [sha(token), codeHash, proofHash])).rows[0].ok, true);
    return proofHash;
  }
  async function sign(token, proof, name, role = "attendee", member = null, accepted = true) {
    await db.query("select respond_event_waiver($1,$2,$3,$4,$5,true,$6,'ip-digest','ua-digest','encrypted-receipt')", [sha(token), proof, accepted, name, role, member]);
  }
  await event("v2-inflight-v1");
  await db.query("update events set enable_group_form=false,require_emailed_waiver=false where slug='v2-inflight-v1'");
  const legacyInsert = "insert into pending_registrations(event_slug,member_id,registration_kind,participant_key,attendee_email,answers,consent_given,contact_name,contact_email,contact_phone,token_hash,expires_at,hold_expires_at) values('v2-inflight-v1',$1,'proxy',$2,'legacy@example.test','{\"name\":\"Legacy Friend\"}',true,'Legacy Friend','payer@example.test','','legacy-'||gen_random_uuid(),clock_timestamp()+interval '24 hours',clock_timestamp()+interval '30 minutes') returning *";
  const legacyHold = (await db.query(legacyInsert, [booker, randomUUID()])).rows[0];
  await db.query("update events set enable_group_form=true,require_emailed_waiver=true where slug='v2-inflight-v1'");
  const legacyTicket = await promote(legacyHold);
  assert.equal(legacyTicket.waiver_participant_id, null);
  assert.equal(await assignment(legacyTicket), undefined);
  await assert.rejects(db.query(legacyInsert, [booker, randomUUID()]), /use_group_registration_v2/);
  console.log("PASS V2 enrollment preserves in-flight V1 fulfillment while blocking new legacy holds");
  await event("v2-group");
  const a = person("Adult One"), b = person("Adult Two"); const key = randomUUID();
  const group = await book("v2-group", [a, b], { key });
  assert.equal(await book("v2-group", [a, b], { key }), group);
  await assert.rejects(book("v2-group", [a], { key }), /booking_request_locked/);
  const holds = await pending(group); assert.equal(holds.length, 2);
  const first = await promote(holds[0]); const second = await promote(holds[1]);
  assert.equal(first.member_id, null); assert.equal(second.member_id, null); assert.equal(first.booker_member_id, booker);
  const firstPerson = holds[0].contact_name;
  const firstInvite = await invitation(first);
  await assert.rejects(sign(firstInvite.token, sha("unverified"), firstPerson), /waiver_verification_required/);
  const proof = await verify(firstInvite.token);
  await assert.rejects(sign(firstInvite.token, proof, firstPerson, "guardian"), /waiver_signer_invalid/);
  await assert.rejects(sign(firstInvite.token, proof, "Not This Attendee"), /attendee_name_mismatch/);
  await sign(firstInvite.token, proof, firstPerson, "attendee", other);
  assert.equal((await assignment(first)).status, "signed");
  await assert.rejects(sign(firstInvite.token, proof, firstPerson), /waiver_verification_required/);
  await assert.rejects(db.query("update event_waiver_signatures set signer_name='forged' where registration_id=$1", [first.id]), /waiver_evidence_immutable/);
  await assert.rejects(db.query("delete from event_waiver_signatures where registration_id=$1", [first.id]), /waiver_evidence_immutable/);
  await assert.rejects(db.query("select issue_registration_guest_invitation($1,$2,'2099-12-01','staff')", [second.id, sha("legacy")]), /verified_waiver_flow_required/);
  console.log("PASS V2 friends-only booking is idempotent; verified personal signatures cannot be forged, replayed or overwritten");

  await event("v2-self"); const self = person("Booker Self", { kind: "self", email: "payer@example.test" });
  const selfPending = (await pending(await book("v2-self", [self])))[0]; await promote(selfPending);
  await assert.rejects(book("v2-self", [person("Booker Again", { kind: "self", email: "payer@example.test" })]), /participant_already_registered/);
  await event("v2-expired-self"); const expired = (await pending(await book("v2-expired-self", [self])))[0];
  await db.query("update pending_registrations set hold_expires_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 hour' where id=$1", [expired.id]);
  await book("v2-expired-self", [person("Booker Self", { kind: "self", email: "payer@example.test" })]);
  assert.notEqual((await db.query("select superseded_at from pending_registrations where id=$1", [expired.id])).rows[0].superseded_at, null);
  console.log("PASS V2 self has one valid place; expired unused self holds can be replaced without deleting history");

  await event("v2-minors", { approval: true });
  const children = [person("Child One", { dob: "2085-01-01", email: "" }), person("Child Two", { dob: "2087-01-01", email: "" })];
  const childPending = await pending(await book("v2-minors", children));
  const child = await promote(childPending[0]); const sibling = await promote(childPending[1]);
  const ci = await invitation(child); const si = await invitation(sibling);
  const cp = await verify(ci.token);
  await assert.rejects(sign(ci.token, cp, "Legal Parent", "attendee"), /waiver_signer_invalid/);
  await assert.rejects(sign(ci.token, cp, "Pretend Parent", "guardian"), /guardian_name_mismatch/);
  await sign(ci.token, cp, "Legal Parent", "guardian");
  assert.equal((await assignment(child)).status, "needs_review");
  await assert.rejects(db.query("select staff_event_waiver_operation($1,'checkin','staff')", [child.id]), /verified_waiver_required|approval_required/);
  await db.query("select staff_event_waiver_operation($1,'guardian_verified','staff')", [child.id]);
  await assert.rejects(db.query("select staff_event_waiver_operation($1,'checkin','staff')", [child.id]), /verified_waiver_required|approval_required/);
  await db.query("select staff_event_waiver_operation($1,'approve','staff')", [child.id]);
  await db.query("select staff_event_waiver_operation($1,'checkin','staff')", [child.id]);
  await assert.rejects(db.query("select staff_event_waiver_operation($1,'checkin','staff')", [child.id]), /already_checked_in/);
  await assert.rejects(sign(si.token, cp, "Legal Parent", "guardian"), /waiver_verification_required/);
  await sign(si.token, await verify(si.token), "Legal Parent", "guardian");
  assert.equal(Number((await db.query("select count(*) from event_waiver_signatures where registration_id=any($1::uuid[])", [[child.id, sibling.id]])).rows[0].count), 2);
  console.log("PASS V2 guardian email is shared safely across children; distinct proofs, guardian review, approval and check-in are enforced");

  await event("v2-code-lockout"); const codeTicket = await promote((await pending(await book("v2-code-lockout", [person("Code Friend")])))[0]);
  const codeInvitation = await invitation(codeTicket);
  await db.query("select queue_event_waiver_code($1,$2,'encrypted-code')", [sha(codeInvitation.token), sha("correct")]);
  for (let i = 0; i < 5; i++) assert.equal((await db.query("select verify_event_waiver_code($1,$2,$3) as ok", [sha(codeInvitation.token), sha("wrong"), sha("proof")])).rows[0].ok, false);
  assert.equal((await db.query("select verify_event_waiver_code($1,$2,$3) as ok", [sha(codeInvitation.token), sha("correct"), sha("proof")])).rows[0].ok, false);
  assert.equal((await db.query("select queue_event_waiver_code($1,$2,'encrypted-code') as ok", [sha(codeInvitation.token), sha("correct")])).rows[0].ok, false);
  await assert.rejects(db.query("select queue_event_waiver($1,$2,'encrypted','booker')", [codeInvitation.a.id, sha(randomUUID())]), /waiver_resend_unavailable|waiver_resend_limited/);
  console.log("PASS V2 verification codes are rate-limited and wrong attempts persist without transaction rollback");

  const replacement = (await db.query("select replace_event_waiver_recipient($1,'corrected@example.test','','booker') as id", [codeInvitation.a.id])).rows[0].id;
  assert.equal((await db.query("select token_hash from event_waiver_assignments where id=$1", [codeInvitation.a.id])).rows[0].token_hash, null);
  await assert.rejects(db.query("select queue_event_waiver($1,$2,'encrypted','booker')", [replacement, sha(randomUUID())]), /waiver_resend_limited/);
  console.log("PASS V2 address correction revokes old links and cannot bypass the registration-wide send limit");

  const duplicateGroup = await book("v2-group", [person(firstPerson)], { owner: other });
  const duplicate = await promote((await pending(duplicateGroup))[0]); const di = await invitation(duplicate);
  await assert.rejects(sign(di.token, await verify(di.token), firstPerson, "attendee", other), /event_attendee_claims_pkey|participant_already_registered/);
  assert.notEqual((await assignment(duplicate)).status, "signed");
  console.log("PASS V2 a verified attendee cannot claim two valid tickets across different bookers");

  await event("v2-last-place", { capacity: 1 });
  await assert.rejects(book("v2-last-place", [person("Too Many One"), person("Too Many Two")]), /registration_capacity_exceeded/);
  assert.equal(Number((await db.query("select count(*) from event_bookings where event_slug='v2-last-place'")).rows[0].count), 0);
  await event("v2-birthday", { date: "2026-02-28" });
  const leap = person("Leap Child", { dob: "2008-02-29" }); leap.recipientEmail = "parent@example.test";
  const leapId = await book("v2-birthday", [leap]);
  assert.equal((await db.query("select signer_role from event_waiver_participants where booking_id=$1", [leapId])).rows[0].signer_role, "guardian");
  console.log("PASS V2 multi-person holds are atomic at the last place; leap-day age rules use the event calendar date");

  await db.query("select save_event_waiver_policy('v2-group','America/Los_Angeles',$1,$2,$3,$4,'staff',false,false)", [adultText + " Updated terms.", guardianText, sha(adultText + " Updated terms."), sha(guardianText)]);
  assert.equal((await db.query("select status from event_waiver_assignments where id=$1", [firstInvite.a.id])).rows[0].status, "invalidated");
  assert.equal(Number((await db.query("select count(*) from event_waiver_signatures where registration_id=$1", [first.id])).rows[0].count), 1);
  await assert.rejects(db.query("select staff_event_waiver_operation($1,'checkin','staff')", [first.id]), /verified_waiver_required/);
  await assert.rejects(book("v2-group", [person("New While Disabled")]), /group_registration_unavailable/);
  assert.equal((await assignment(first)).status, "not_sent");
  console.log("PASS V2 policy changes preserve immutable historical signatures and require re-signing; disabling enrollment retains existing processing");

  await event("v2-payment-gate");
  await db.query("update events set payment_model='deposit',deposit_amount=99,allow_cancellation=true where slug='v2-payment-gate'");
  const payHold = (await pending(await book("v2-payment-gate", [person("Paid Friend")])))[0]; const payTicket = await promote(payHold);
  const pi = await invitation(payTicket); await sign(pi.token, await verify(pi.token), "Paid Friend");
  await assert.rejects(db.query("select staff_event_waiver_operation($1,'checkin','staff')", [payTicket.id]), /verified_waiver_required/);
  await db.query("update registrations set deposit_status='paid',deposit_amount=99 where id=$1", [payTicket.id]);
  await assert.rejects(db.query("select cancel_event_booking_place(null,$1,$2)", [payTicket.id, other]), /contact_staff_for_cancellation/);
  await db.query("select cancel_event_booking_place(null,$1,$2)", [payTicket.id, booker]);
  const cancelled = (await db.query("select status,deposit_status from registrations where id=$1", [payTicket.id])).rows[0];
  assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.deposit_status, "paid");
  assert.equal(Number((await db.query("select count(*) from event_waiver_signatures where registration_id=$1", [payTicket.id])).rows[0].count), 1);
  await event("v2-cancel-hold"); const cancelHold = (await pending(await book("v2-cancel-hold", [person("Unpaid Friend")])))[0];
  await db.query("select cancel_event_booking_place($1,null,$2)", [cancelHold.id, booker]);
  assert.equal((await db.query("select expires_at<clock_timestamp() as expired from pending_registrations where id=$1", [cancelHold.id])).rows[0].expired, true);
  await event("v2-unknown-payment"); const uncertain = (await pending(await book("v2-unknown-payment", [person("Uncertain Friend")])))[0];
  await db.query("update pending_registrations set checkout_attempt=$1 where id=$2", [{ id: "unknown-attempt", params: {} }, uncertain.id]);
  await assert.rejects(db.query("select cancel_event_booking_place($1,null,$2)", [uncertain.id, booker]), /payment_verification_required_before_cancel/);
  console.log("PASS V2 payment is independent from signing; cancellation keeps finance/evidence and never releases an uncertain payment");

  await event("v2-delivery"); const deliveryTicket = await promote((await pending(await book("v2-delivery", [person("Email Friend")])))[0]);
  const deliveryInvite = await invitation(deliveryTicket);
  const outbox = (await db.query("select id from event_waiver_email_outbox where assignment_id=$1 and kind='invitation'", [deliveryInvite.a.id])).rows[0];
  await db.query("update event_waiver_email_outbox set provider_message_id='mail-fixture',status='sent' where id=$1", [outbox.id]);
  await db.query("select record_event_waiver_delivery('event-delivered','mail-fixture','email.delivered')");
  assert.equal((await assignment(deliveryTicket)).status, "delivered");
  await db.query("select record_event_waiver_delivery('event-delivered','mail-fixture','email.bounced')");
  assert.equal((await assignment(deliveryTicket)).status, "delivered");
  await db.query("select record_event_waiver_delivery('event-bounced','mail-fixture','email.bounced')");
  await db.query("select record_event_waiver_delivery('event-late-delivery','mail-fixture','email.delivered')");
  assert.equal((await assignment(deliveryTicket)).status, "bounced");
  await assert.rejects(db.query("select record_event_waiver_delivery('event-early','mail-not-recorded','email.delivered')"), /delivery_message_not_ready/);
  assert.equal(Number((await db.query("select count(*) from event_waiver_delivery_events where event_id='event-early'")).rows[0].count), 0);
  const peer = new db.constructor({ host: "127.0.0.1", port: db.connectionParameters.port, user: db.connectionParameters.user, database: "postgres" });
  await peer.connect();
  try {
    await db.query("begin"); await peer.query("begin");
    const firstLease = (await db.query("select * from claim_event_waiver_email()")).rows[0];
    const secondLease = (await peer.query("select * from claim_event_waiver_email()")).rows[0];
    assert(firstLease); assert(secondLease); assert.notEqual(firstLease.id, secondLease.id); assert.notEqual(firstLease.lease_id, secondLease.lease_id);
  } finally { await db.query("rollback"); await peer.query("rollback"); await peer.end(); }
  await db.query("update event_waiver_email_outbox set status='sending',attempts=5,lease_id=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes' where id=$1", [outbox.id]);
  await db.query("select * from claim_event_waiver_email()");
  assert.equal((await db.query("select status from event_waiver_email_outbox where id=$1", [outbox.id])).rows[0].status, "sending", "Another worker must not expire an actively leased final attempt before it is acknowledged");
  console.log("PASS V2 verified delivery events are idempotent, bounces are sticky, early callbacks retry and concurrent workers claim different emails");

  await event("v2-reminder-ended", { date: "2020-11-07" });
  const endedTicket = await promote((await pending(await book("v2-reminder-ended", [person("Past Friend", { dob: "1990-01-01" })])))[0]);
  const endedAssignment = await assignment(endedTicket);
  await assert.rejects(db.query("select queue_event_waiver($1,$2,'fixture','worker','reminder')", [endedAssignment.id, sha("ended")]), /waiver_reminders_finished/);
  await db.query("update event_waiver_assignments set status='sent',last_queued_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()+interval '30 days' where id=any($1::uuid[])", [[endedAssignment.id, deliveryInvite.a.id]]);
  const dueReminders = (await db.query("select id from event_waiver_due_reminders")).rows.map((row) => row.id);
  assert(!dueReminders.includes(endedAssignment.id)); assert(dueReminders.includes(deliveryInvite.a.id));
  const protectedTables = ['event_waiver_policies','event_bookings','event_waiver_participants','event_waiver_assignments','event_waiver_signatures','event_waiver_challenges','event_waiver_email_outbox','event_waiver_delivery_events','event_attendee_claims'];
  assert.equal(Number((await db.query("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) and c.relrowsecurity", [protectedTables])).rows[0].count), protectedTables.length);
  for (const role of ["anon", "authenticated"]) {
    await db.query(`set role ${role}`);
    for (const table of protectedTables) await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    await assert.rejects(db.query("select * from event_waiver_due_reminders"), /permission denied/);
    await assert.rejects(db.query("select verify_event_waiver_code('x','x','x')"), /permission denied/);
    await db.query("reset role");
  }
  assert.equal(Number((await db.query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname like '%waiver%'")).rows[0].count), 0);
  console.log("PASS V2 DOB, signatures, tokens and privileged RPCs are denied to anonymous and member Data API roles");
}
