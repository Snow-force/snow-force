import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { WaiverPolicy, SignerRole } from "./participants";
import { digest } from "./secrets";

export function missingV2Schema(error: { code?: string; message?: string } | null) {
  return Boolean(error && (["42P01", "PGRST205"].includes(error.code ?? "") || (["42703", "PGRST204"].includes(error.code ?? "") && /enable_group_form|require_emailed_waiver/.test(error.message ?? ""))));
}
export async function getWaiverPolicy(eventSlug: string): Promise<WaiverPolicy | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const client = createAdminClient();
  const { data: event, error } = await client.from("events").select("event_date,enable_group_form,require_emailed_waiver").eq("slug", eventSlug).maybeSingle();
  if (missingV2Schema(error)) return null;
  if (error) throw new Error("Waiver configuration unavailable");
  const { data: policy, error: policyError } = await client.from("event_waiver_policies").select("event_date,time_zone,version,adult_text,guardian_text,approved_at").eq("event_slug", eventSlug).maybeSingle();
  if (policyError) throw new Error("Waiver policy unavailable");
  if (!event || !policy) return null;
  return { eventSlug, eventDate: policy.event_date, timeZone: policy.time_zone, version: policy.version, adultText: policy.adult_text,
    guardianText: policy.guardian_text, approved: Boolean(policy.approved_at) && policy.event_date === event.event_date,
    enableGroupForm: event.enable_group_form, requireEmailedWaiver: event.require_emailed_waiver };
}

export type AssignmentRow = {
  id: string; registration_id: string; participant_id: string; is_current: boolean; recipient_email: string;
  guardian_name: string | null; policy_version: string; waiver_text: string; waiver_sha: string; generation: number;
  token_hash: string | null; expires_at: string | null; status: string; email_verified_at: string | null;
};
export type ParticipantRow = {
  id: string; booking_id: string; attendee_name: string; event_date: string; signer_role: SignerRole; guardian_relationship: string | null;
  registration_kind: "self" | "proxy"; payment_model: string;
};
export async function getAssignment(id: string) {
  const { data, error } = await createAdminClient().from("event_waiver_assignments").select("*").eq("id", id).maybeSingle<AssignmentRow>();
  if (error) throw new Error("Waiver assignment unavailable");
  return data;
}
export async function getWaiverInvitation(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const client = createAdminClient();
  const { data: assignment, error } = await client.from("event_waiver_assignments").select("*").eq("token_hash", digest(token)).maybeSingle<AssignmentRow>();
  if (error) throw new Error("Waiver invitation unavailable");
  if (!assignment?.is_current || !assignment.expires_at || Date.parse(assignment.expires_at) <= Date.now() || ["invalidated", "expired", "bounced"].includes(assignment.status)) return null;
  const [{ data: participant, error: participantError }, { data: registration, error: registrationError }] = await Promise.all([
    client.from("event_waiver_participants").select("id,booking_id,attendee_name,event_date,signer_role,guardian_relationship,registration_kind,payment_model").eq("id", assignment.participant_id).single<ParticipantRow>(),
    client.from("registrations").select("id,event_slug,status,approval_status,deposit_status,attendance_status,booker_member_id,member_id").eq("id", assignment.registration_id).single(),
  ]);
  if (participantError || registrationError) throw new Error("Waiver invitation unavailable");
  if (!participant || !registration || registration.status !== "confirmed") return null;
  const { data: booking, error: bookingError } = await client.from("event_bookings").select("preferred_language").eq("id", participant.booking_id).single<{ preferred_language: "en" | "zh" }>();
  if (bookingError || !booking) throw new Error("Waiver language unavailable");
  return { assignment, participant, registration, language: booking.preferred_language };
}

export type BookingParticipantView = {
  id: string; name: string; kind: string; pendingId: string | null; registrationId: string | null;
  status: string; waiverStatus: string; signerRole: string; recipient: string; approvalStatus: string;
  assignmentId: string | null; paymentModel: string;
  quotedAmount: number; currency: string; reviewRequired: boolean;
  deliveryStatus: string;
};
export type BookingView = { id: string; eventSlug: string; createdAt: string; participants: BookingParticipantView[] };
export function maskRecipient(email: string) {
  const [name, host] = email.split("@");
  return host ? `${name.slice(0, 1)}***@${host}` : "";
}
export async function findBookingRequest(bookerId: string, eventSlug: string, key: string) {
  const { data, error } = await createAdminClient().from("event_bookings").select("id,request_hash").eq("booker_member_id", bookerId).eq("event_slug", eventSlug).eq("request_key", key).maybeSingle<{ id: string; request_hash: string }>();
  if (missingV2Schema(error)) return null;
  if (error) throw new Error("Booking request unavailable");
  return data;
}
export async function listEventBookings(bookerId?: string, eventSlug?: string): Promise<BookingView[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const client = createAdminClient();
  let query = client.from("event_bookings").select("id,event_slug,created_at").order("created_at", { ascending: false }).limit(1000);
  if (bookerId) query = query.eq("booker_member_id", bookerId);
  if (eventSlug) query = query.eq("event_slug", eventSlug);
  const { data: bookings, error } = await query;
  if (missingV2Schema(error)) return [];
  if (error) throw new Error("Bookings unavailable");
  if (!bookings?.length) return [];
  const ids = bookings.map((b) => String(b.id));
  const [participants, pending, registrations] = await Promise.all([
    client.from("event_waiver_participants").select("id,booking_id,attendee_name,registration_kind,signer_role,payment_model,quoted_amount,payment_currency,review_required").in("booking_id", ids),
    client.from("pending_registrations").select("id,waiver_participant_id,fulfilled_registration_id,fulfillment_state,expires_at,hold_expires_at,checkout_attempt").in("booking_id", ids),
    client.from("registrations").select("id,waiver_participant_id,status,approval_status,deposit_status").in("booking_id", ids),
  ]);
  if (participants.error || pending.error || registrations.error) throw new Error("Booking participants unavailable");
  const registrationIds = (registrations.data ?? []).map((r) => String(r.id));
  const assignments = registrationIds.length ? await client.from("event_waiver_assignments").select("id,registration_id,status,recipient_email,expires_at").in("registration_id", registrationIds).eq("is_current", true) : { data: [], error: null };
  if (assignments.error) throw new Error("Booking waivers unavailable");
  const assignmentIds = (assignments.data ?? []).map((a) => String(a.id));
  const deliveries = assignmentIds.length ? await client.from("event_waiver_email_outbox").select("assignment_id,status,error_code,created_at").in("assignment_id", assignmentIds).in("kind", ["invitation", "reminder"]).order("created_at", { ascending: false }) : { data: [], error: null };
  if (deliveries.error) throw new Error("Waiver delivery status unavailable");
  return bookings.map((b) => ({ id: String(b.id), eventSlug: String(b.event_slug), createdAt: String(b.created_at), participants: (participants.data ?? []).filter((p) => p.booking_id === b.id).map((p) => {
    const r = registrations.data?.find((r) => r.waiver_participant_id === p.id);
    const hold = pending.data?.find((hold) => hold.waiver_participant_id === p.id);
    const a = assignments.data?.find((a) => a.registration_id === r?.id);
    const delivery = deliveries.data?.find((d) => d.assignment_id === a?.id);
    const expired = hold && Date.parse(hold.expires_at) <= Date.now() && !hold.checkout_attempt;
    return { id: String(p.id), name: String(p.attendee_name), kind: String(p.registration_kind), pendingId: hold && !r && !expired ? String(hold.id) : null,
      registrationId: r ? String(r.id) : null, status: r?.status ?? (hold?.fulfillment_state === "paid_requires_review" ? "paid_requires_review" : expired ? "expired" : "pending_payment"),
      waiverStatus: a?.expires_at && Date.parse(a.expires_at) <= Date.now() && !["signed", "declined", "needs_review"].includes(a.status) ? "expired" : a?.status ?? "not_sent",
      signerRole: String(p.signer_role), recipient: maskRecipient(String(a?.recipient_email ?? "")), approvalStatus: String(r?.approval_status ?? "not_required"), assignmentId: a ? String(a.id) : null, paymentModel: String(p.payment_model), quotedAmount: Number(p.quoted_amount), currency: String(p.payment_currency), reviewRequired: Boolean(p.review_required), deliveryStatus: delivery?.status === "queued" && delivery.error_code ? "retrying" : delivery?.status ?? "not_sent" };
  }) }));
}
