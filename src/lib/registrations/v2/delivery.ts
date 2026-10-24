import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { buildWaiverEmail, sendWaiverEmail, type WaiverEmailData } from "@/lib/email/waiver";
import { decryptDelivery, digest, encryptDelivery, randomToken, waiverEncryptionKey } from "./secrets";
import { getAssignment } from "./repository";

export async function queueWaiverInvitation(assignmentId: string, actorId: string, kind: "invitation" | "reminder" = "invitation") {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw new Error("Waiver unavailable");
  const client = createAdminClient();
  const { data: p, error } = await client.from("event_waiver_participants").select("attendee_name,signer_role,booking_id").eq("id", assignment.participant_id).single();
  if (error || !p) throw new Error("Waiver unavailable");
  const { data: b, error: bookingError } = await client.from("event_bookings").select("event_slug,preferred_language").eq("id", p.booking_id).single();
  if (bookingError || !b) throw new Error("Booking unavailable");
  const token = randomToken();
  const payload: WaiverEmailData = { kind, name: p.attendee_name, event: b.event_slug, role: p.signer_role, lang: b.preferred_language, token };
  const { error: queueError } = await client.rpc("queue_event_waiver", { assignment_id_input: assignment.id, token_hash_input: digest(token), payload_input: encryptDelivery(payload), actor_input: actorId, kind_input: kind });
  if (queueError) throw new Error("Waiver could not be queued; check the resend limit");
}

export async function queueRegistrationWaiver(registrationId: string) {
  if (!process.env.EVENT_WAIVER_ENCRYPTION_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const { data, error } = await createAdminClient().from("event_waiver_assignments").select("id").eq("registration_id", registrationId).eq("is_current", true).eq("status", "not_sent").maybeSingle();
  if (error) throw new Error("Waiver queue unavailable");
  if (data) await queueWaiverInvitation(data.id, "fulfillment");
}

type OutboxRow = { id: string; assignment_id: string; generation: number; kind: string; recipient_email: string; encrypted_payload: string | null; idempotency_key: string; lease_id: string; attempts: number };
export async function dispatchWaiverOutbox(limit = 20) {
  waiverEncryptionKey();
  const client = createAdminClient();
  const { data: waiting, error: waitingError } = await client.from("event_waiver_assignments").select("id").eq("is_current", true).eq("status", "not_sent").limit(limit);
  if (waitingError) throw new Error("Waiver queue unavailable");
  for (const a of waiting ?? []) {
    try { await queueWaiverInvitation(a.id, "delivery-worker"); } catch { /* Durable not_sent state remains visible and can be retried. */ }
  }
  // One daily reminder per outstanding invitation; the SQL send limit also spans replaced addresses.
  const { data: reminders, error: remindersError } = await client.from("event_waiver_due_reminders").select("id").limit(10);
  if (remindersError) throw new Error("Waiver reminder queue unavailable");
  for (const a of reminders ?? []) {
    try { await queueWaiverInvitation(a.id, "delivery-reminder", "reminder"); } catch { /* Existing signed/changed invitations are never overwritten. */ }
  }
  let sent = 0; let failed = 0;
  for (let i = 0; i < Math.min(limit, 50); i++) {
    const { data, error } = await client.rpc("claim_event_waiver_email");
    if (error) throw new Error("Waiver delivery lease unavailable");
    const row = (data as OutboxRow[] | null)?.[0];
    if (!row) break;
    const assignment = await getAssignment(row.assignment_id);
    if (!assignment?.is_current || assignment.generation !== row.generation || assignment.status === "invalidated" || !row.encrypted_payload) {
      await client.from("event_waiver_email_outbox").update({ status: "cancelled", encrypted_payload: null }).eq("id", row.id).eq("lease_id", row.lease_id).eq("status", "sending");
      continue;
    }
    let result: Awaited<ReturnType<typeof sendWaiverEmail>>;
    try {
      const payload = decryptDelivery(row.encrypted_payload) as WaiverEmailData;
      if (payload.kind !== row.kind || !["en", "zh"].includes(payload.lang) || typeof payload.name !== "string" || typeof payload.event !== "string") throw new Error("Invalid outbox payload");
      buildWaiverEmail(payload);
      result = await sendWaiverEmail(row.recipient_email, payload, row.idempotency_key);
    } catch { result = { success: false, errorCode: "invalid_payload" }; }
    const terminalFailure = !result.success && (row.attempts >= 5 || result.errorCode === "invalid_payload");
    const update = result.success
      ? { status: "sent", provider_message_id: result.messageId, encrypted_payload: null, error_code: null, updated_at: new Date().toISOString() }
      : { status: terminalFailure ? "failed" : "queued", ...(terminalFailure ? { encrypted_payload: null } : {}), error_code: result.errorCode,
        next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** row.attempts) * 1000).toISOString(), updated_at: new Date().toISOString() };
    const { error: updateError } = await client.from("event_waiver_email_outbox").update(update).eq("id", row.id).eq("lease_id", row.lease_id).eq("status", "sending");
    if (updateError) throw new Error("Delivery acknowledgement unavailable");
    if (result.success) {
      sent++;
      if (["invitation", "reminder"].includes(row.kind)) {
        const { error } = await client.from("event_waiver_assignments").update({ status: "sent" }).eq("id", row.assignment_id).eq("generation", row.generation).eq("status", "queued");
        if (error) throw new Error("Waiver send status unavailable");
      }
    } else failed++;
  }
  return { sent, failed };
}
