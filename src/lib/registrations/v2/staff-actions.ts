"use server";

import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { getEventAdmin } from "@/lib/events/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { digest, waiverEncryptionKey } from "./secrets";
import { dispatchWaiverOutbox, queueWaiverInvitation } from "./delivery";

export async function saveWaiverPolicyAction(form: FormData) {
  const staff = await requireAdmin();
  const slug = String(form.get("eventSlug") ?? "");
  const event = await getEventAdmin(slug);
  const adult = String(form.get("adultText") ?? "").trim();
  const guardian = String(form.get("guardianText") ?? "").trim();
  const enabled = form.get("enabled") === "on";
  const zone = String(form.get("timeZone") ?? "America/Los_Angeles");
  let validZone = true;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { validZone = false; }
  if (!event || !validZone || form.get("legalReviewed") !== "on" || [adult, guardian].some((text) => text.length < 100 || text.length > 100000)
    || adult === guardian || !/parent|guardian|父母|监护/i.test(guardian)
    || /grant\s+SnowForce\s+permission\s+to\s+use\s+my\s+image|我.*授予.*肖像|授权.*用于.*营销/i.test(`${adult}\n${guardian}`)) redirect(`/admin/events/${slug}/waivers?error=policy`);
  if (enabled) {
    try { waiverEncryptionKey(); if (!process.env.RESEND_API_KEY || (process.env.EVENT_WAIVER_WORKER_SECRET?.length ?? 0) < 32 || !process.env.RESEND_WAIVER_WEBHOOK_SECRET?.startsWith("whsec_")) throw new Error("Delivery not configured"); }
    catch { redirect(`/admin/events/${slug}/waivers?error=configuration`); }
  }
  const { error } = await createAdminClient().rpc("save_event_waiver_policy", { event_slug_input: slug, zone_input: zone, adult_text_input: adult, guardian_text_input: guardian,
    adult_sha_input: digest(adult), guardian_sha_input: digest(guardian), actor_input: staff.userId, group_enabled_input: enabled, email_required_input: enabled });
  if (error) redirect(`/admin/events/${slug}/waivers?error=save`);
  revalidatePath(`/events/${slug}`); revalidatePath("/member"); revalidatePath("/member/trips");
  redirect(`/admin/events/${slug}/waivers?saved=1`);
}

export async function staffWaiverOperationAction(form: FormData) {
  const staff = await requireAdmin();
  const slug = String(form.get("eventSlug") ?? "");
  const operation = String(form.get("operation") ?? "");
  let success = false;
  try {
    if (["checkin", "guardian_verified", "identity_verified", "accompany_verified"].includes(operation) && form.get("identityChecked") !== "on") throw new Error("Identity verification required");
    if (operation === "resend") { await queueWaiverInvitation(String(form.get("assignmentId") ?? ""), staff.userId); success = true; }
    else if (operation === "dispatch") { await dispatchWaiverOutbox(20); success = true; }
    else if (["approve", "reject", "guardian_verified", "identity_verified", "accompany_verified", "accompany_left", "checkin", "revoke", "reissue"].includes(operation)) {
      const { error } = await createAdminClient().rpc("staff_event_waiver_operation", { registration_id_input: String(form.get("registrationId") ?? ""), operation_input: operation, actor_input: staff.userId });
      success = !error;
    }
  } catch { success = false; }
  revalidatePath("/member"); revalidatePath("/member/trips"); revalidatePath("/admin/registrations"); revalidatePath(`/events/${slug}`);
  redirect(`/admin/events/${slug}/waivers?${success ? "saved=1" : "error=operation"}`);
}
