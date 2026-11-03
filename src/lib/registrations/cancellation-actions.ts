"use server";
import { scheduleCancellationMail } from "./cancellation-mail";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { createAdminClient } from "@/lib/supabase/server";
import { refundRegistrationAction } from "@/lib/payments/refund-actions";
import type { CancellationRequest } from "./cancellation-types";
function refresh() {
  scheduleCancellationMail();
  for (const path of [
    "/member",
    "/member/trips",
    "/admin/registrations",
    "/events",
  ])
    revalidatePath(path);
}
export async function requestCancellationAction(form: FormData) {
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.emailConfirmed) return { success: false };
  if (form.get("confirmation") !== "REQUEST") return { success: false };
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3 || reason.length > 2000) return { success: false };
  const { error } = await createAdminClient().rpc(
    "request_registration_cancellation",
    {
      registration_id_input: String(form.get("registrationId") ?? ""),
      booker_id_input: account.profile.id,
      reason_input: reason,
    },
  );
  if (!error) refresh();
  return { success: !error };
}
export async function withdrawCancellationAction(requestId: string) {
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.emailConfirmed) return { success: false };
  const { error } = await createAdminClient().rpc(
    "withdraw_registration_cancellation",
    { request_id_input: requestId, booker_id_input: account.profile.id },
  );
  if (!error) refresh();
  return { success: !error };
}
export async function reviewCancellationAction(form: FormData) {
  const staff = await requireSuperAdmin();
  const decision = String(form.get("decision") ?? "");
  if (
    !["approve", "reject"].includes(decision) ||
    form.get("confirmation") !== "REVIEW"
  )
    return { success: false };
  const amount = Number(form.get("refundAmount"));
  const note = String(form.get("note") ?? "").trim();
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    note.length < 3 ||
    note.length > 2000
  )
    return { success: false };
  const { error } = await createAdminClient().rpc(
    "review_registration_cancellation",
    {
      request_id_input: String(form.get("requestId") ?? ""),
      actor_id_input: staff.userId,
      approved_input: decision === "approve",
      refund_amount_input: amount,
      note_input: note,
    },
  );
  if (!error) refresh();
  return { success: !error };
}
export async function executeCancellationRefundAction(form: FormData) {
  await requireSuperAdmin();
  if (form.get("confirmation") !== "REFUND") return { success: false };
  const { data, error } = await createAdminClient()
    .from("registration_cancellation_requests")
    .select("*")
    .eq("id", String(form.get("requestId") ?? ""))
    .single<CancellationRequest>();
  if (
    error ||
    !data ||
    data.status !== "approved" ||
    !data.refund_operation_id ||
    Number(data.refund_amount) <= 0
  )
    return { success: false };
  const refund = new FormData();
  for (const [key, value] of Object.entries({
    confirmation: "REFUND",
    operationId: data.refund_operation_id,
    registrationId: data.registration_id,
    amount: String(data.refund_amount),
    reason: "requested_by_customer",
    internalNote: `Approved cancellation ${data.id}: ${data.decision_note}`,
  }))
    refund.set(key, value);
  const result = await refundRegistrationAction(refund);
  refresh();
  return result;
}
