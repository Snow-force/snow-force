import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export async function flagPaidPendingForReview(pendingId: string) {
  const { error } = await createAdminClient().from("pending_registrations")
    .update({ fulfillment_state: "paid_requires_review" }).eq("id", pendingId);
  if (error) throw new Error("paid_review_tracking_failed");
  console.error("paid_requires_review", { pendingId });
}

/** Caller is a staff-authenticated page. No attendee PII in monitoring records. */
export async function getPaidPendingReviews() {
  const { data, error } = await createAdminClient().from("pending_registrations")
    .select("id,event_slug,member_id,created_at").eq("fulfillment_state", "paid_requires_review")
    .is("fulfilled_registration_id", null).order("created_at", { ascending: true });
  if (error) throw new Error("Payment review queue could not be loaded");
  return (data ?? []) as { id: string; event_slug: string; member_id: string; created_at: string }[];
}
