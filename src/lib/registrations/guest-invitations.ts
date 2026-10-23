import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export function hashGuestToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export async function issueGuestInvitation(registrationId: string, actorId: string) {
  const token = randomBytes(32).toString("hex");
  const { error } = await createAdminClient().rpc("issue_registration_guest_invitation", {
    registration_id_input: registrationId,
    token_hash_input: hashGuestToken(token),
    expires_at_input: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    actor_id_input: actorId,
  });
  if (error) throw new Error("Invitation could not be issued");
  return `/events/guest/${token}`;
}

/** The capability exposes one attendee and their waiver, never payer or financial data. */
export async function getGuestInvitation(token: string) {
  const hash = hashGuestToken(token);
  if (!hash) return null;
  const client = createAdminClient();
  const { data: invitation, error } = await client.from("registration_guest_invitations")
    .select("registration_id,status,expires_at,waiver_text").eq("token_hash", hash).maybeSingle();
  if (error) throw new Error("Invitation could not be loaded");
  if (!invitation || !["issued","accepted","declined"].includes(invitation.status) || Date.parse(invitation.expires_at) <= Date.now()) return null;
  const { data: registration, error: registrationError } = await client.from("registrations")
    .select("contact_name,event_slug,status,registration_kind,attendance_status,approval_status").eq("id", invitation.registration_id).maybeSingle();
  if (registrationError) throw new Error("Invitation could not be loaded");
  if (!registration || registration.status !== "confirmed" || registration.registration_kind !== "proxy") return null;
  return { attendeeName: String(registration.contact_name), eventSlug: String(registration.event_slug),registrationId: String(invitation.registration_id),
    confirmationStatus: invitation.status as "issued" | "accepted" | "declined",
    attendanceStatus: String(registration.attendance_status ?? "unmarked"),
    approvalStatus: (registration.approval_status ?? "not_required") as "not_required" | "pending" | "approved" | "rejected",
    waiverText: typeof invitation.waiver_text === "string" ? invitation.waiver_text : null };
}

export async function respondGuestInvitation(input: { token: string; accepted: boolean; typedName: string; signerRole: string; attested: boolean }) {
  const hash = hashGuestToken(input.token);
  if (!hash || (input.accepted && (!input.attested || input.typedName.trim().length < 2 || input.typedName.trim().length > 200 ||
    !["attendee", "guardian"].includes(input.signerRole)))) return { success: false };
  const { error } = await createAdminClient().rpc("respond_registration_guest_invitation", {
    token_hash_input: hash, accepted_input: input.accepted,
    typed_name_input: input.typedName.trim(), signer_role_input: input.signerRole,
  });
  return { success: !error };
}
