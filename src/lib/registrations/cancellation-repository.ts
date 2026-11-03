import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getRegistrationRefunds } from "@/lib/payments/refund-repository";
import type { Registration } from "@/lib/types";
import {
  cancellationRefundStatus,
  type CancellationRequest,
  type CancellationCase,
} from "./cancellation-types";
export async function getCancellationRequests(
  registrationIds?: string[],
): Promise<CancellationRequest[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || registrationIds?.length === 0)
    return [];
  let query = createAdminClient()
    .from("registration_cancellation_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (registrationIds) query = query.in("registration_id", registrationIds);
  const { data, error } = await query;
  if (error) throw new Error("Cancellation requests unavailable");
  return (data ?? []).map((r) => ({
    ...r,
    refund_amount: Number(r.refund_amount),
  }));
}
export async function getCancellationCases(
  registrations: Registration[],
  bookerId?: string,
): Promise<CancellationCase[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !registrations.length) return [];
  const owned = bookerId
    ? registrations.filter((r) => (r.bookerMemberId ?? r.memberId) === bookerId)
    : registrations;
  const ids = owned.map((r) => r.id);
  const [requests, refunds, events] = await Promise.all([
    getCancellationRequests(ids),
    getRegistrationRefunds(),
    createAdminClient()
      .from("events")
      .select("slug,allow_cancellation")
      .in("slug", [...new Set(owned.map((r) => r.eventSlug))]),
  ]);
  if (events.error) throw new Error("Cancellation policy unavailable");
  return owned.map((r) => {
    const request = requests.find((c) => c.registration_id === r.id) ?? null;
    const rows = refunds.filter((f) => f.registrationId === r.id);
    const paidAmount =
      r.finance?.depositStatus === "paid" ||
      r.finance?.depositStatus === "refunded"
        ? (r.finance?.depositAmount ?? 0)
        : 0;
    const refundedAmount = r.finance?.refundedAmount ?? 0;
    return {
      registrationId: r.id,
      name: r.contactName,
      eventSlug: r.eventSlug,
      registrationStatus: r.status,
      paidAmount,
      refundedAmount,
      currency: r.finance?.paymentCurrency || "usd",
      canRequest:
        r.status !== "cancelled" &&
        r.attendanceStatus !== "attended" &&
        Boolean(
          events.data?.find((e) => e.slug === r.eventSlug)?.allow_cancellation,
        ),
      request,
      refundStatus: cancellationRefundStatus(
        request,
        rows,
        refundedAmount,
        paidAmount,
      ),
      externalRefund:
        rows.some((f) => !f.initiatedBy) && request?.status !== "approved",
    };
  });
}
