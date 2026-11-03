"use server";

import { randomInt } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { getEvent } from "@/lib/events/repository";
import { createAdminClient } from "@/lib/supabase/server";
import { isEventOpen } from "@/lib/events/availability";
import { ageOnDate, localCalendarDate, uuidPattern } from "./participants";
import { parseAgeDeclaration, validateDeclaredParticipants } from "./age-declaration";
import { findBookingRequest, getAssignment, getWaiverInvitation, getWaiverPolicy, listEventBookings } from "./repository";
import { digest, encryptDelivery, randomToken } from "./secrets";
import { queueWaiverInvitation } from "./delivery";
import { scheduleWaiverDelivery } from "./schedule";
import { getCoupon, getCouponRedemptionCount } from "@/lib/coupons/repository";
import { quoteCoupon } from "@/lib/coupons/validation";
import { buildQrCodeDataUrl } from "@/lib/events/share-payload";
import { resolveVerifiedAttendeeMember } from "./verified-attendee";

function refreshBookings() { revalidatePath("/member"); revalidatePath("/member/trips"); revalidatePath("/admin/registrations"); }
function proofCookie(token: string) { return `sf-waiver-${digest(token).slice(0, 20)}`; }

export async function loadEventWaiverAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const invitation = await getWaiverInvitation(token);
  if (!invitation) return null;
  const { assignment: a, participant: p, registration: r } = invitation;
  const event = await getEvent(String(r.event_slug));
  const declarationMode = p.age_confirmation_method === "declaration";
  const needsAccompaniment = declarationMode ? a.declared_under14 === true : (ageOnDate(p.date_of_birth ?? "", p.event_date) ?? 0) < 14;
  const canSign = declarationMode || p.signer_role === "guardian" || (ageOnDate(p.date_of_birth ?? "", localCalendarDate(invitation.timeZone)) ?? 0) >= 18;
  const ready = a.status === "signed" && (!needsAccompaniment || invitation.accompanimentPresent) && ["approved", "not_required"].includes(r.approval_status) && (p.payment_model === "free" || ["paid", "waived"].includes(r.deposit_status));
  const qr = ready ? await buildQrCodeDataUrl(`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://snow-force.com"}/events/waivers#${token}`) : null;
  return { attendeeName: p.attendee_name, eventSlug: String(r.event_slug), eventTitle: event?.title, eventDate: p.event_date, eventLocation: event?.activityLocation, role: a.declared_signer_role ?? p.signer_role, waiverText: a.waiver_text, status: a.status,
    declarationMode, adultWaiverText: declarationMode ? invitation.policy.adultText : undefined, guardianWaiverText: declarationMode ? invitation.policy.guardianText : undefined,
    ready, canSign, needsAccompaniment, registrationId: String(r.id), qrDataUrl: qr?.dataUrl, initiallyVerified: await hasWaiverSigningProof(token) };
}

export async function createEventBookingAction(form: FormData) {
  const eventSlug = String(form.get("eventSlug") ?? "");
  let participantsInput: unknown;
  try { participantsInput = JSON.parse(String(form.get("participants") ?? "null")); }
  catch { return { success: false as const, error: "Invalid participant details" }; }
  const input = { requestKey: String(form.get("requestKey") ?? ""), lang: String(form.get("lang") ?? "") as "en" | "zh", participants: participantsInput, permission: form.get("permission") === "on" };
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.emailConfirmed || !account.user.email) return { success: false as const, error: "Sign in with a verified member account" };
  if (!input.permission || !uuidPattern.test(input.requestKey) || !["en", "zh"].includes(input.lang)) return { success: false as const, error: "Confirm permission and reload an invalid form" };
  try {
    const requestHash = digest(JSON.stringify({ eventSlug, participants: input.participants, lang: input.lang }));
    const existing = await findBookingRequest(account.profile.id, eventSlug, input.requestKey);
    if (existing) {
      if (existing.request_hash !== requestHash) return { success: false as const, error: "This saved booking is locked. Manage it from your member trips." };
      const booking = (await listEventBookings(account.profile.id)).find((b) => b.id === existing.id);
      return booking ? { success: true as const, booking } : { success: false as const, error: "Refresh your member trips to recover this booking" };
    }
    const event = await getEvent(eventSlug);
    const policy = await getWaiverPolicy(eventSlug);
    if (!event || !isEventOpen(event) || !policy?.approved || !policy.enableGroupForm || !policy.requireEmailedWaiver) return { success: false as const, error: "Group registration is not available" };
    const validation = validateDeclaredParticipants(event, input.participants, account.user.email);
    if (!validation.participants) return { success: false as const, error: validation.error ?? "Check each participant’s details" };
    const originalAmount = event.paymentModel === "free" ? 0 : event.paymentModel === "deposit" ? event.depositAmount : event.fullPaymentAmount;
    if (originalAmount === null || originalAmount < 0) return { success: false as const, error: "Event pricing is unavailable" };
    const participants = [];
    for (const p of validation.participants) {
      let quotedAmount = originalAmount;
      if (p.couponCode) {
        const coupon = await getCoupon(p.couponCode);
        if (!coupon || event.paymentModel === "free") return { success: false as const, error: "Invalid coupon for this participant" };
        const quote = quoteCoupon(coupon, originalAmount, await getCouponRedemptionCount(coupon.code), event.slug);
        if ("error" in quote) return { success: false as const, error: quote.error };
        quotedAmount = quote.finalAmount;
      }
      participants.push({ ...p, quotedAmount, identityFingerprint: digest(`${p.name.normalize("NFKC").toLocaleLowerCase()}|${p.recipientEmail}`) });
    }
    const { data: bookingId, error } = await createAdminClient().rpc("create_declared_event_booking_v2", { event_slug_input: eventSlug, booker_id_input: account.profile.id,
      contact_email_input: account.user.email, request_key_input: input.requestKey, request_hash_input: requestHash, language_input: input.lang, participants_input: participants });
    if (error) return { success: false as const, error: /capacity|limit|registered|duplicate|participant_once/.test(error.message) ? "A participant is already registered, the friend limit was reached, or no places remain. Check your bookings before retrying." : "Could not create this booking. Check the details and retry." };
    refreshBookings();
    const booking = (await listEventBookings(account.profile.id)).find((b) => b.id === bookingId);
    if (!booking) throw new Error("Booking confirmation unavailable");
    return { success: true as const, booking };
  } catch { return { success: false as const, error: "Could not create this booking. Your request can be retried safely." }; }
}

export async function requestWaiverCodeAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  try {
    const invitation = await getWaiverInvitation(token);
    if (!invitation) return { success: false };
    const code = String(randomInt(100000, 1000000));
    const { data, error } = await createAdminClient().rpc("queue_event_waiver_code", { token_hash_input: digest(token), code_hash_input: digest(`${token}:${code}`),
      payload_input: encryptDelivery({ kind: "verification", name: invitation.participant.attendee_name, event: invitation.registration.event_slug, role: invitation.participant.signer_role, lang: invitation.language, code }) });
    if (!error && data === true) scheduleWaiverDelivery();
    return { success: !error && data === true };
  } catch { return { success: false }; }
}

export async function verifyWaiverCodeAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const code = String(form.get("code") ?? "");
  if (!/^[a-f0-9]{64}$/.test(token) || !/^\d{6}$/.test(code)) return { success: false };
  try {
    const proof = randomToken();
    const { data, error } = await createAdminClient().rpc("verify_event_waiver_code", { token_hash_input: digest(token), code_hash_input: digest(`${token}:${code}`), proof_hash_input: digest(proof) });
    if (error || data !== true) return { success: false };
    (await cookies()).set(proofCookie(token), proof, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 900 });
    return { success: true };
  } catch { return { success: false }; }
}

async function hasWaiverSigningProof(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const proof = (await cookies()).get(proofCookie(token))?.value;
  if (!proof) return false;
  const invitation = await getWaiverInvitation(token);
  if (!invitation) return false;
  const { data, error } = await createAdminClient().from("event_waiver_challenges").select("generation,proof_hash,proof_expires_at,consumed_at").eq("assignment_id", invitation.assignment.id).maybeSingle();
  return Boolean(!error && data && data.generation === invitation.assignment.generation && data.proof_hash === digest(proof) && !data.consumed_at && Date.parse(data.proof_expires_at) > Date.now());
}

export async function signEventWaiverAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{64}$/.test(token) || !["accept", "decline"].includes(String(form.get("decision")))) return { success: false };
  try {
    const invitation = await getWaiverInvitation(token);
    const proof = (await cookies()).get(proofCookie(token))?.value;
    if (!invitation || !proof) return { success: false };
    const accepted = form.get("decision") === "accept";
    const account = await getCurrentMemberAccount();
    const declarationMode = invitation.participant.age_confirmation_method === "declaration";
    const declaration = declarationMode && accepted ? parseAgeDeclaration(form) : null;
    if (declarationMode && accepted && !declaration) return { success: false };
    const role = declarationMode && accepted ? declaration?.adultConfirmed ? "attendee" : "guardian" : invitation.participant.signer_role;
    if (!declarationMode && accepted && role === "attendee" && (ageOnDate(invitation.participant.date_of_birth ?? "", localCalendarDate(invitation.timeZone)) ?? 0) < 18) return { success: false };
    if (!declarationMode && String(form.get("signerRole")) !== role) return { success: false };
    const sameEmail = account?.emailConfirmed && account.user.email?.toLowerCase() === invitation.assignment.recipient_email;
    if (accepted && form.get("attested") !== "on") return { success: false };
    if (accepted && role === "attendee" && invitation.participant.registration_kind === "proxy" && account?.profile?.id === invitation.registration.booker_member_id) return { success: false };
    if (!await hasWaiverSigningProof(token)) return { success: false };
    const attendeeMember = accepted && role === "attendee"
      ? sameEmail ? account?.profile?.id ?? null : await resolveVerifiedAttendeeMember(invitation.assignment.recipient_email)
      : null;
    const requestHeaders = await headers();
    const { error } = await createAdminClient().rpc(declarationMode ? "respond_declared_event_waiver" : "respond_event_waiver", { token_hash_input: digest(token), proof_hash_input: digest(proof), accepted_input: accepted,
      signer_name_input: String(form.get("typedName") ?? "").trim(), ...(declarationMode ? { declaration_input: declaration ?? {} } : { signer_role_input: role }), guardian_attested_input: role !== "guardian" || form.get("guardianAttested") === "on",
      member_id_input: attendeeMember,
      ip_digest_input: digest(requestHeaders.get("x-forwarded-for") ?? "unknown"), ua_digest_input: digest(requestHeaders.get("user-agent") ?? "unknown"),
      receipt_payload_input: encryptDelivery({ kind: accepted ? "signed" : "declined", name: invitation.participant.attendee_name, event: invitation.registration.event_slug, role, lang: invitation.language }) });
    if (error) return { success: false };
    (await cookies()).delete(proofCookie(token));
    scheduleWaiverDelivery(); refreshBookings(); revalidatePath("/events/waivers");
    return { success: true };
  } catch { return { success: false }; }
}

export async function manageBookingWaiverAction(form: FormData) {
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.emailConfirmed) return { success: false };
  try {
    const assignment = await getAssignment(String(form.get("assignmentId") ?? ""));
    if (!assignment) return { success: false };
    const client = createAdminClient();
    const { data: registration } = await client.from("registrations").select("booker_member_id").eq("id", assignment.registration_id).single();
    if (registration?.booker_member_id !== account.profile.id) return { success: false };
    if (form.get("operation") === "replace") {
      const { data: replacement, error } = await client.rpc("replace_event_waiver_recipient", { assignment_id_input: assignment.id, email_input: String(form.get("email") ?? "").trim().toLowerCase(), guardian_name_input: String(form.get("guardianName") ?? "").trim(), actor_input: account.profile.id });
      if (error) return { success: false };
      await queueWaiverInvitation(String(replacement), account.profile.id);
    } else if (form.get("operation") === "resend") await queueWaiverInvitation(assignment.id, account.profile.id);
    else return { success: false };
    scheduleWaiverDelivery(); refreshBookings(); return { success: true };
  } catch { return { success: false }; }
}

export async function cancelBookingPlaceAction(pendingId: string | null, registrationId: string | null) {
  if (registrationId) return { success: false }; // Issued places require a cancellation request.
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.emailConfirmed) return { success: false };
  const { error } = await createAdminClient().rpc("cancel_event_booking_place", { pending_id_input: pendingId, registration_id_input: registrationId, booker_id_input: account.profile.id });
  if (!error) refreshBookings();
  return { success: !error };
}
