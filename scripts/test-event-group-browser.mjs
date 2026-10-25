// Disposable test identities and encrypted local outbox only; no emails or Stripe calls are sent.
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export async function verifyEventGroupBrowser({ db, browser, page, site, booker, encryptionKey, output, nextLog }) {
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  const adult = "Adult personal risk acknowledgement. I understand and personally accept the event activity risks and terms. Photo and marketing permissions remain separate.";
  const guardian = "Parent or legal guardian acknowledgement. I have legal authority for the named child and accept the event activity risks and terms using my own name. Photo and marketing permissions are separate.";
  await db.query("insert into events(slug,title_en,title_zh,status,registration_state,event_date,capacity,allow_proxy_registrations,max_proxy_registrations,payment_model,requires_approval) values('browser-group-v2','Local group booking','本地多人报名','published','open','2027-11-07',10,true,5,'free',true)");
  await db.query("select save_event_waiver_policy('browser-group-v2','America/Los_Angeles',$1,$2,$3,$4,'fixture-staff',true,true)", [adult, guardian, sha(adult), sha(guardian)]);
  await page.goto(`${site}/events/browser-group-v2`);
  await page.getByRole("button", { name: "Add a friend", exact: true }).click();
  await page.getByLabel(/^Name/).fill("Browser Adult");
  await page.getByLabel("Waiver signing email").fill("adult@example.test");
  await page.getByRole("button", { name: "Add a friend", exact: true }).click();
  await page.getByLabel(/^Name/).nth(1).fill("Browser Child");
  await page.getByLabel("Waiver signing email").nth(1).fill("parent@example.test");
  await page.getByRole("checkbox", { name: /I have permission/ }).check();
  await page.getByRole("button", { name: "Save and continue to individual payments", exact: true }).click();
  await page.getByRole("heading", { name: "Your participant bookings" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Confirm this free place" }).count(), 2);
  const pending = (await db.query("select * from pending_registrations where event_slug='browser-group-v2' order by contact_name")).rows;
  assert.equal(pending.length, 2); assert.equal(pending.every((p) => p.member_id === booker && p.registration_kind === "proxy"), true);
  const screenshots = path.join(output, "event-group-registration-v2"); mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "group-booking-saved.png"), fullPage: true });

  function encrypted(payload) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(encryptionKey, "hex"), iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
  }
  function decrypted(ciphertext) {
    const bytes = Buffer.from(ciphertext, "base64url"); const cipher = createDecipheriv("aes-256-gcm", Buffer.from(encryptionKey, "hex"), bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28)); return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString());
  }
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage(); const errors = []; guest.on("pageerror", (error) => errors.push(error.message));
  for (const hold of pending) {
    // Emulate completion through the existing atomic registration writer, keeping financial providers out of this fixture.
    const ticket = (await db.query(`insert into registrations(event_slug,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,contact_phone,answers,consent_given,attendee_email,pending_registration_id)
      values($1,$2,'proxy','pending',$3,$4,$5,$6,true,$7,$8) returning *`, [hold.event_slug, booker, hold.contact_name, hold.contact_email, hold.contact_phone, hold.answers, hold.attendee_email, hold.id])).rows[0];
    await db.query("update pending_registrations set fulfilled_registration_id=$2 where id=$1", [hold.id, ticket.id]);
    const assignment = (await db.query("select * from event_waiver_assignments where registration_id=$1 and is_current", [ticket.id])).rows[0];
    const person = (await db.query("select signer_role from event_waiver_participants where id=$1", [assignment.participant_id])).rows[0];
    const token = randomBytes(32).toString("hex");
    await db.query("select queue_event_waiver($1,$2,$3,'fixture-staff')", [assignment.id, sha(token), encrypted({ kind: "invitation", name: hold.contact_name, event: hold.event_slug, role: person.signer_role, lang: "en", token })]);
    await guest.goto(`${site}/events/waivers#${token}`);
    await guest.getByRole("button", { name: "Email me a verification code", exact: true }).click();
    await guest.getByRole("status").filter({ hasText: "Code queued" }).waitFor();
    const codeRow = (await db.query("select encrypted_payload,status from event_waiver_email_outbox where assignment_id=$1 and kind='verification' order by created_at desc limit 1", [assignment.id])).rows[0];
    assert.notEqual(codeRow.status, "sent"); const code = decrypted(codeRow.encrypted_payload).code;
    await guest.getByLabel("Six-digit email code").fill(code); await guest.getByRole("button", { name: "Verify email", exact: true }).click();
    await guest.getByLabel("Your full legal name / electronic signature").waitFor();
    assert.equal(guest.url().split("#")[1] === token, true, "Verification must retain the current person's private capability");
    await guest.reload(); await guest.getByLabel("Your full legal name / electronic signature").waitFor(); // httpOnly proof survives refresh.
    assert.equal(await guest.getByRole("checkbox", { name: /I confirm I am the attendee/ }).isChecked(), false);
    const signerRole = hold.contact_name === "Browser Child" ? "guardian" : "attendee";
    if (signerRole === "attendee") { await guest.getByRole("checkbox", { name: /I confirm I am the attendee/ }).check(); assert.equal(await guest.getByRole("combobox").count(), 0); }
    else {
      await guest.getByLabel("Your legal relationship to the attendee").selectOption("parent");
      await guest.getByRole("radio", { name: "Yes, under 14", exact: true }).check();
      await guest.getByLabel("Accompanying guardian’s name").fill("Browser Parent");
      await guest.getByLabel("Accompanying guardian’s phone").fill("+1 555 010 0100");
      await guest.getByLabel("Accompanying guardian’s relationship").selectOption("parent");
      await guest.getByRole("checkbox", { name: /This parent or legal guardian will stay/ }).check();
      await guest.getByRole("checkbox", { name: /I am this child’s parent/ }).check();
    }
    await guest.getByLabel("Your full legal name / electronic signature").fill(signerRole === "guardian" ? "Browser Parent" : hold.contact_name);
    await guest.getByRole("checkbox", { name: /I have read and accept/ }).check();
    await guest.evaluate(() => window.scrollTo(0, 0));
    await guest.screenshot({ path: path.join(screenshots, `${signerRole}-age-confirmation-mobile.png`), fullPage: true });
    await guest.getByRole("button", { name: "Accept and sign", exact: true }).click();
    await guest.getByRole("status").filter({ hasText: /signature is recorded|waiver is signed/ }).waitFor();
    assert.equal(await guest.getByRole("img", { name: "Your personal event ticket" }).count(), 0);
    if (signerRole === "guardian") await db.query("select staff_event_waiver_operation($1,'guardian_verified','fixture-staff')", [ticket.id]);
    if (signerRole === "guardian") await db.query("select staff_event_waiver_operation($1,'accompany_verified','fixture-staff')", [ticket.id]);
    await db.query("select staff_event_waiver_operation($1,'approve','fixture-staff')", [ticket.id]);
    await guest.reload(); await guest.getByRole("img", { name: "Your personal event ticket" }).waitFor();
    assert.equal(await guest.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth), true);
    await guest.screenshot({ path: path.join(screenshots, `${signerRole}-signed-mobile.png`), fullPage: true });
    assert.equal(readFileSync(nextLog, "utf8").includes(token), false, "V2 capability must not enter server URL logs");
    assert.equal(readFileSync(nextLog, "utf8").includes("2015-01-01"), false, "Birth dates must not enter action logs");
  }
  await guestContext.addCookies([{ name: "lang", value: "zh", url: site }]);
  await guest.setViewportSize({ width: 1280, height: 900 }); await guest.reload();
  await guest.getByRole("img", { name: "你的个人活动票据" }).waitFor();
  await guest.screenshot({ path: path.join(screenshots, "guardian-ticket-desktop-zh.png"), fullPage: true });
  await guestContext.close(); assert.deepEqual(errors, []);
  for (const [slug, model, approval, amount] of [["browser-v2-full", "full_prepay", true, 118], ["browser-v2-opening", "deposit", true, 99], ["browser-v2-thanksgiving", "deposit", false, 99]]) {
    await db.query("insert into events(slug,title_en,title_zh,status,registration_state,event_date,capacity,allow_proxy_registrations,max_proxy_registrations,payment_model,requires_approval,deposit_amount,full_payment_amount) values($1,'V2 local event','V2 本地活动','published','open','2027-11-07',50,true,5,$2,$3,99,118)", [slug, model, approval]);
    await db.query("select save_event_waiver_policy($1,'America/Los_Angeles',$2,$3,$4,$5,'fixture-staff',true,true)", [slug, adult, guardian, sha(adult), sha(guardian)]);
    await page.goto(`${site}/events/${slug}`);
    await page.getByRole("button", { name: "Add a friend", exact: true }).click();
    await page.getByLabel(/^Name/).fill("Paid V2 Friend");
    await page.getByLabel("Waiver signing email").fill("paid-friend@example.test");
    await page.getByRole("checkbox", { name: /I have permission/ }).check();
    await page.getByRole("button", { name: "Save and continue to individual payments", exact: true }).click();
    await page.getByRole("button", { name: "Continue this person’s payment" }).waitFor();
    const saved = (await db.query("select p.* from event_waiver_participants p join event_bookings b on b.id=p.booking_id where b.event_slug=$1", [slug])).rows;
    assert.equal(saved.length, 1); assert.equal(Number(saved[0].quoted_amount), amount); assert.equal(saved[0].payment_model, model); assert.equal(saved[0].requires_approval, approval);
  }
  console.log("PASS V2 group forms preserve all three current payment / approval combinations and bilingual tickets");
  console.log("PASS V2 real browser: friends-only group, adult/guardian email OTP, refresh-safe proof, self-declared signing age, guardian authority and approval-gated QR, no token URL logs or external sends");
}
