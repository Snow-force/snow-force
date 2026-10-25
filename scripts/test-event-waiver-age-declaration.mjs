// Disposable local PostgreSQL acceptance; no remote credentials or email sends.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export async function verifyWaiverAgeDeclaration({ db, booker, other }) {
  const sha = value => createHash("sha256").update(value).digest("hex");
  const adultText = "Adult terms: I am the attendee and confirm I am eighteen or older at signing. I personally accept the activity risks. Media permissions are separate.";
  const guardianText = "Parent or legal guardian terms: I have legal authority and personally sign for the minor participant. Under fourteen requires a parent or legal guardian throughout. Media permissions are separate.";
  async function event(slug) {
    await db.query("insert into events(slug,status,registration_state,event_date,capacity,allow_proxy_registrations,max_proxy_registrations,payment_model) values($1,'published','open','2027-11-07',0,true,5,'free')", [slug]);
    await db.query("select save_event_waiver_policy($1,'America/Los_Angeles',$2,$3,$4,$5,'fixture-staff',true,true)", [slug, adultText, guardianText, sha(adultText), sha(guardianText)]);
  }
  async function place(slug, name, email) {
    const person = { key: randomUUID(), kind: "proxy", name, recipientEmail: email, identityFingerprint: sha(name + email), dateOfBirth: "2000-01-01", adultConfirmed: true, answers: { name, dateOfBirth: "2000-01-01" } };
    const id = (await db.query("select create_declared_event_booking_v2($1,$2,'payer@example.test',$3,$4,'en',$5) as id", [slug, booker, randomUUID(), sha(JSON.stringify(person)), JSON.stringify([person])])).rows[0].id;
    const p = (await db.query("select * from pending_registrations where booking_id=$1", [id])).rows[0];
    assert.equal(p.attendee_email, null); assert.equal(p.answers.dateOfBirth, undefined);
    const participant = (await db.query("select * from event_waiver_participants where booking_id=$1", [id])).rows[0];
    assert.equal(participant.date_of_birth, null); assert.equal(participant.signer_role, "unconfirmed"); assert.equal(participant.age_confirmation_method, "declaration");
    const r = (await db.query("insert into registrations(event_slug,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,consent_given,answers,pending_registration_id) values($1,$2,'proxy','pending',$3,'payer@example.test',true,$4,$5) returning *", [slug, booker, name, p.answers, p.id])).rows[0];
    const assignment = (await db.query("select * from event_waiver_assignments where registration_id=$1 and is_current", [r.id])).rows[0];
    const token = randomBytes(32).toString("hex"), proof = sha(randomUUID());
    await db.query("select queue_event_waiver($1,$2,'encrypted-fixture','staff')", [assignment.id, sha(token)]);
    await db.query("select queue_event_waiver_code($1,$2,'encrypted-code')", [sha(token), sha(token + ':123456')]);
    await db.query("select verify_event_waiver_code($1,$2,$3)", [sha(token), sha(token + ':123456'), proof]);
    return { r, assignment, token, proof, participant };
  }
  const respond = (p, declaration, name, { accepted = true, guardian = true, member = null, proof = p.proof } = {}) => db.query("select respond_declared_event_waiver($1,$2,$3,$4,$5,$6,$7,'ip-fixture','ua-fixture','encrypted-receipt')", [sha(p.token), proof, accepted, name, JSON.stringify(declaration), guardian, member]);
  await event("decl-adult");
  const adult = await place("decl-adult", "Declared Adult", "adult-declaration@example.test");
  await assert.rejects(respond(adult, { adultConfirmed: true, under14: false }, "Declared Adult", { proof: sha("forged") }), /waiver_verification_required/);
  await assert.rejects(respond(adult, {}, "Declared Adult"), /waiver_age_confirmation_required/);
  await assert.rejects(respond(adult, { adultConfirmed: "true", under14: false }, "Declared Adult"), /waiver_age_confirmation_required/);
  await assert.rejects(respond(adult, { adultConfirmed: true, under14: true }, "Declared Adult"), /waiver_age_confirmation_invalid/);
  await assert.rejects(respond(adult, { adultConfirmed: true, under14: false }, "Other Name"), /attendee_name_mismatch/);
  await assert.rejects(db.query("select respond_event_waiver($1,$2,true,'Declared Adult','unconfirmed',true,null,'ip','ua','receipt')", [sha(adult.token), adult.proof]), /age_declaration_required/);
  await respond(adult, { adultConfirmed: true, under14: false, guardianRelationship: "forged", waiverText: "forged text" }, "Declared Adult", { guardian: false, member: other });
  const signature = (await db.query("select * from event_waiver_signatures where assignment_id=$1", [adult.assignment.id])).rows[0];
  assert.equal(signature.signer_role, "attendee"); assert.equal(signature.adult_confirmed, true); assert.equal(signature.guardian_relationship, null); assert.equal(signature.legal_text_snapshot, adultText);
  assert.equal((await db.query("select status from event_waiver_assignments where id=$1", [adult.assignment.id])).rows[0].status, "signed");
  await db.query("select staff_event_waiver_operation($1,'checkin','staff')", [adult.r.id]);
  await assert.rejects(respond(adult, { adultConfirmed: true, under14: false }, "Declared Adult"), /waiver_verification_required/);
  await assert.rejects(db.query("update event_waiver_signatures set adult_confirmed=false where id=$1", [signature.id]), /waiver_evidence_immutable/);

  await event("decl-minor");
  const child = await place("decl-minor", "Declared Child", "payer@example.test");
  await assert.rejects(respond(child, { adultConfirmed: true, under14: false }, "Declared Child"), /own_attendee_email_required/);
  const guardian = { adultConfirmed: false, under14: true, guardianRelationship: "parent", accompanyingGuardianName: "Legal Parent", accompanyingGuardianPhone: "+1 555 010 0100", accompanyingGuardianRelationship: "parent", guardianWillAttend: true };
  await assert.rejects(respond(child, guardian, "Legal Parent", { guardian: false }), /guardian_authority_required/);
  await assert.rejects(respond(child, { ...guardian, guardianWillAttend: false }, "Legal Parent"), /accompanying_guardian_required/);
  await respond(child, guardian, "Legal Parent");
  const childSignature = (await db.query("select * from event_waiver_signatures where assignment_id=$1", [child.assignment.id])).rows[0];
  assert.equal(childSignature.signer_name, "Legal Parent"); assert.equal(childSignature.adult_confirmed, false); assert.equal(childSignature.participant_under14, true); assert.equal(childSignature.legal_text_snapshot, guardianText);
  assert.equal((await db.query("select status from event_waiver_assignments where id=$1", [child.assignment.id])).rows[0].status, "needs_review");
  await db.query("select staff_event_waiver_operation($1,'guardian_verified','staff')", [child.r.id]);
  await assert.rejects(db.query("select staff_event_waiver_operation($1,'checkin','staff')", [child.r.id]), /accompanying_guardian_presence_required/);
  await db.query("select staff_event_waiver_operation($1,'accompany_verified','staff')", [child.r.id]);
  await db.query("select staff_event_waiver_operation($1,'checkin','staff')", [child.r.id]);
  await db.query("select staff_event_waiver_operation($1,'accompany_left','staff')", [child.r.id]);
  assert.equal((await db.query("select attendance_status from registrations where id=$1", [child.r.id])).rows[0].attendance_status, "unmarked");
  await assert.rejects(db.query("select staff_event_waiver_operation($1,'checkin','staff')", [child.r.id]), /accompanying_guardian_presence_required/);
  const teen = await place("decl-minor", "Declared Teen", "parent@example.test");
  await respond(teen, { adultConfirmed: false, under14: false, guardianRelationship: "legal_guardian" }, "Legal Guardian");
  assert.equal(Number((await db.query("select count(*) from event_waiver_accompaniments where participant_id=$1", [teen.participant.id])).rows[0].count), 0);
  await db.query("select staff_event_waiver_operation($1,'guardian_verified','staff')", [teen.r.id]);
  await db.query("select staff_event_waiver_operation($1,'checkin','staff')", [teen.r.id]);
  const declined = await place("decl-minor", "Declining Person", "decline@example.test");
  await respond(declined, {}, "", { accepted: false });
  assert.equal((await db.query("select status from event_waiver_assignments where id=$1", [declined.assignment.id])).rows[0].status, "declined");
  for (const role of ["anon", "authenticated"]) {
    await db.query(`set role ${role}`);
    await assert.rejects(db.query("select create_declared_event_booking_v2('x',null,'x',null,'x','en','[]')"), /permission denied/);
    await assert.rejects(db.query("select respond_declared_event_waiver('x','x',true,'x','{}',false,null,'x','x','x')"), /permission denied/);
    await db.query("reset role");
  }
  console.log("PASS V2 no-DOB bookings defer age to the verified signer; adult checkbox avoids guardians, minors retain authority/presence gates, canonical terms and immutable age evidence");
}
