import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: m.from }) }));
import { findBookingRequest, getAssignment, getWaiverInvitation, getWaiverPolicy, listEventBookings, maskRecipient, missingV2Schema } from "./repository";

function response(data: unknown, error: { code?: string; message?: string } | null = null) {
  const result = { data, error };
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(async () => result), single: vi.fn(async () => result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  for (const call of [query.select, query.eq, query.in, query.order, query.limit]) call.mockReturnValue(query);
  return query;
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.example"); });
afterEach(() => vi.unstubAllEnvs());
it("defaults off only for absent V2 schema and fails closed for other database errors", async () => {
  m.from.mockReturnValue(response(null, { code: "42703", message: "enable_group_form missing" }));
  expect(await getWaiverPolicy("event")).toBeNull();
  expect(missingV2Schema({ code: "42703", message: "unrelated column missing" })).toBe(false);
  m.from.mockReturnValue(response(null, { code: "08006" }));
  await expect(getWaiverPolicy("event")).rejects.toThrow("unavailable");
  await expect(findBookingRequest("booker", "event", "key")).rejects.toThrow("unavailable");
  await expect(getAssignment("id")).rejects.toThrow("unavailable");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); expect(await getWaiverPolicy("event")).toBeNull(); expect(await listEventBookings("booker")).toEqual([]);
});
it("requires reviewed terms for the current event calendar date", async () => {
  m.from.mockReturnValueOnce(response({ event_date: "2026-11-07", enable_group_form: true, require_emailed_waiver: true }))
    .mockReturnValueOnce(response({ event_date: "2026-11-08", approved_at: "2026-10-23", version: "v1", time_zone: "America/Los_Angeles" }));
  expect(await getWaiverPolicy("event")).toMatchObject({ approved: false });
});
it("rejects invalid, revoked and expired capabilities before exposing participant data", async () => {
  expect(await getWaiverInvitation("invalid")).toBeNull(); expect(m.from).not.toHaveBeenCalled();
  m.from.mockReturnValue(response({ is_current: false, expires_at: "2099-01-01" })); expect(await getWaiverInvitation("a".repeat(64))).toBeNull();
  m.from.mockReturnValue(response({ is_current: true, expires_at: "2000-01-01" })); expect(await getWaiverInvitation("a".repeat(64))).toBeNull();
  expect(m.from).toHaveBeenCalledTimes(2);
});
it("loads only the necessary participant fields and the booking's language for private delivery", async () => {
  const participant = response({ id: "p", booking_id: "b", attendee_name: "Friend", signer_role: "attendee" });
  m.from.mockReturnValueOnce(response({ is_current: true, expires_at: "2099-01-01", status: "sent", participant_id: "p", registration_id: "r" }))
    .mockReturnValueOnce(participant).mockReturnValueOnce(response({ status: "confirmed", event_slug: "event" })).mockReturnValueOnce(response({ preferred_language: "zh" }));
  expect(await getWaiverInvitation("a".repeat(64))).toMatchObject({ language: "zh", participant: { attendee_name: "Friend" } });
  expect(participant.select.mock.calls[0][0]).not.toMatch(/date_of_birth|recipient_email|signature/);
});
it("filters owned bookings, masks recipients, separates payment/approval/delivery and excludes private evidence", async () => {
  const bookings = response([{ id: "b", event_slug: "event", created_at: "2026-10-23" }]);
  const tables: Record<string, ReturnType<typeof response>> = {
    event_bookings: bookings,
    event_waiver_participants: response([{ id: "p", booking_id: "b", attendee_name: "Friend", registration_kind: "proxy", signer_role: "guardian", payment_model: "deposit", quoted_amount: 99, payment_currency: "usd", review_required: true, date_of_birth: "private" }]),
    pending_registrations: response([]), registrations: response([{ id: "r", waiver_participant_id: "p", status: "confirmed", approval_status: "pending" }]),
    event_waiver_assignments: response([{ id: "a", registration_id: "r", status: "needs_review", recipient_email: "parent@example.test", expires_at: "2099-01-01", token_hash: "private" }]),
    event_waiver_email_outbox: response([{ assignment_id: "a", status: "queued", error_code: "provider_unavailable", encrypted_payload: "private" }]),
  };
  m.from.mockImplementation((table: string) => tables[table]);
  const result = await listEventBookings("booker", "event");
  expect(bookings.eq).toHaveBeenCalledWith("booker_member_id", "booker"); expect(bookings.eq).toHaveBeenCalledWith("event_slug", "event"); expect(bookings.limit).toHaveBeenCalledWith(1000);
  expect(result[0].participants[0]).toMatchObject({ recipient: "p***@example.test", pendingId: null, waiverStatus: "needs_review", approvalStatus: "pending", deliveryStatus: "retrying" });
  expect(JSON.stringify(result)).not.toMatch(/private|parent@example.test|date_of_birth|token_hash|encrypted_payload/);
  expect(maskRecipient("invalid")).toBe("");
});
