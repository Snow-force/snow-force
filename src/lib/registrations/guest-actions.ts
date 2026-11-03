"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { createAdminClient } from "@/lib/supabase/server";
import { getRegistration } from "./repository";
import { belongsToBooker } from "./participation";
import {
  getGuestInvitation,
  issueGuestInvitation,
  respondGuestInvitation,
} from "./guest-invitations";

export async function createGuestInvitationAction(registrationId: string) {
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.emailConfirmed)
    return { success: false as const };
  const registration = await getRegistration(registrationId);
  if (
    !registration ||
    !belongsToBooker(registration, account.profile.id) ||
    registration.registrationKind !== "proxy"
  ) {
    return { success: false as const };
  }
  try {
    const url = await issueGuestInvitation(registration.id, account.profile.id);
    return { success: true as const, url };
  } catch {
    return { success: false as const };
  }
}

export async function respondGuestInvitationAction(formData: FormData) {
  if (!["accept", "decline"].includes(String(formData.get("decision"))))
    return { success: false };
  if (
    formData.get("decision") === "accept" &&
    formData.get("signerRole") === "attendee"
  ) {
    const account = await getCurrentMemberAccount();
    if (account?.profile) {
      const invitation = await getGuestInvitation(
        String(formData.get("token") ?? ""),
      );
      const registration = invitation
        ? await getRegistration(invitation.registrationId)
        : null;
      if (registration && belongsToBooker(registration, account.profile.id)) {
        return { success: false, reason: "booker_cannot_sign" as const };
      }
    }
  }
  const result = await respondGuestInvitation({
    token: String(formData.get("token") ?? ""),
    accepted: formData.get("decision") === "accept",
    typedName: String(formData.get("typedName") ?? ""),
    signerRole: String(formData.get("signerRole") ?? ""),
    attested: formData.get("attested") === "on",
  });
  if (result.success) {
    revalidatePath("/member");
    revalidatePath("/member/trips");
    revalidatePath("/admin/registrations");
  }
  return result;
}

export async function staffGuestInvitationAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = String(formData.get("registrationId") ?? "");
  try {
    return {
      success: true as const,
      url: await issueGuestInvitation(id, staff.userId),
    };
  } catch {
    return { success: false as const };
  }
}

export async function staffGuestCheckinAction(formData: FormData) {
  const staff = await requireAdmin();
  if (formData.get("identityChecked") !== "on") return { success: false };
  const { error } = await createAdminClient().rpc(
    "checkin_registration_guest",
    {
      registration_id_input: String(formData.get("registrationId") ?? ""),
      actor_id_input: staff.userId,
    },
  );
  if (!error) {
    revalidatePath("/admin/registrations");
    revalidatePath("/member/trips");
  }
  return { success: !error };
}

export async function staffRevokeGuestInvitationAction(formData: FormData) {
  const staff = await requireAdmin();
  const { error } = await createAdminClient().rpc(
    "revoke_registration_guest_invitation",
    {
      registration_id_input: String(formData.get("registrationId") ?? ""),
      actor_id_input: staff.userId,
    },
  );
  if (!error) revalidatePath("/admin/registrations");
  return { success: !error };
}

export async function staffReviewProxyRegistrationAction(formData: FormData) {
  const staff = await requireAdmin();
  const decision = formData.get("decision");
  if (decision !== "approve")
    return {
      success: false,
      reason: "cancellation_approval_required" as const,
    };
  const { error } = await createAdminClient().rpc("review_proxy_registration", {
    registration_id_input: String(formData.get("registrationId") ?? ""),
    approved_input: decision === "approve",
    actor_id_input: staff.userId,
  });
  if (!error) {
    revalidatePath("/admin/registrations");
    revalidatePath("/member");
    revalidatePath("/member/trips");
    const registration = await getRegistration(
      String(formData.get("registrationId") ?? ""),
    );
    if (registration) revalidatePath(`/events/${registration.eventSlug}`);
  }
  return { success: !error };
}
