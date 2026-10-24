import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), assignment: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: m.from, rpc: m.rpc }) }));
vi.mock("./repository", () => ({ getAssignment: m.assignment }));
vi.mock("@/lib/email/waiver", async (original) => ({ ...await original<typeof import("@/lib/email/waiver")>(), sendWaiverEmail: m.send }));
import { dispatchWaiverOutbox, queueRegistrationWaiver, queueWaiverInvitation } from "./delivery";
import { decryptDelivery, encryptDelivery } from "./secrets";

function query(data: unknown = [], error: { message: string } | null = null) {
  const result = { data, error };
  const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), lt: vi.fn(), gt: vi.fn(), limit: vi.fn(), update: vi.fn(), single: vi.fn(async () => result), maybeSingle: vi.fn(async () => result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  for (const call of [q.select, q.eq, q.in, q.lt, q.gt, q.limit, q.update]) call.mockReturnValue(q);
  return q;
}
const payload = { kind: "invitation", name: "Friend", event: "event", role: "attendee", lang: "zh", token: "a".repeat(64) };
function lease(attempts = 1) { return { id: "outbox", assignment_id: "a", generation: 2, kind: "invitation", recipient_email: "friend@example.test", encrypted_payload: encryptDelivery(payload), idempotency_key: "stable/2", lease_id: "lease", attempts }; }
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", "b".repeat(64)); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.example"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://snow-force.com"); m.assignment.mockResolvedValue({ id: "a", participant_id: "p", is_current: true, generation: 2, status: "queued" }); m.from.mockImplementation(() => query()); m.rpc.mockResolvedValue({ data: [], error: null }); });
afterEach(() => vi.unstubAllEnvs());
it("queues encrypted recipient-specific invitations, without marking them as sent", async () => {
  m.from.mockReturnValueOnce(query({ attendee_name: "Friend", signer_role: "attendee", booking_id: "b" })).mockReturnValueOnce(query({ event_slug: "event", preferred_language: "zh" }));
  await queueWaiverInvitation("a", "booker");
  const args = m.rpc.mock.calls[0][1]; expect(args.token_hash_input).toMatch(/^[a-f0-9]{64}$/); expect(decryptDelivery(args.payload_input)).toMatchObject({ lang: "zh", kind: "invitation" });
  expect(m.send).not.toHaveBeenCalled();
  vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", ""); await queueRegistrationWaiver("r"); expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("uses the durable lease and provider idempotency key, then records accepted message ID separately from delivery", async () => {
  const write = query(); m.from.mockReturnValueOnce(query()).mockReturnValueOnce(query()).mockReturnValue(write);
  m.rpc.mockResolvedValueOnce({ data: [lease()], error: null }); m.send.mockResolvedValue({ success: true, messageId: "mail-1" });
  expect(await dispatchWaiverOutbox(1)).toEqual({ sent: 1, failed: 0 });
  expect(m.send).toHaveBeenCalledWith("friend@example.test", payload, "stable/2");
  expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", provider_message_id: "mail-1", encrypted_payload: null })); expect(write.eq).toHaveBeenCalledWith("lease_id", "lease");
  expect(write.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: "delivered" }));
});
it.each([[1, "queued"], [5, "failed"]])("retains failed provider attempts for bounded retries (%s)", async (attempts, status) => {
  const write = query(); m.from.mockReturnValueOnce(query()).mockReturnValueOnce(query()).mockReturnValue(write);
  m.rpc.mockResolvedValueOnce({ data: [lease(Number(attempts))], error: null }); m.send.mockResolvedValue({ success: false, errorCode: "provider_not_configured" });
  expect(await dispatchWaiverOutbox(1)).toEqual({ sent: 0, failed: 1 });
  expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status, error_code: "provider_not_configured" }));
  if (status === "queued") expect(write.update).not.toHaveBeenCalledWith(expect.objectContaining({ encrypted_payload: null }));
  else expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ encrypted_payload: null }));
});
it("never sends a revoked generation and clears its encrypted capability", async () => {
  const write = query(); m.from.mockReturnValueOnce(query()).mockReturnValueOnce(query()).mockReturnValue(write);
  m.rpc.mockResolvedValueOnce({ data: [lease()], error: null }); m.assignment.mockResolvedValue({ is_current: false, generation: 2 });
  await dispatchWaiverOutbox(1); expect(m.send).not.toHaveBeenCalled(); expect(write.update).toHaveBeenCalledWith({ status: "cancelled", encrypted_payload: null });
});
it("fails malformed encrypted payloads permanently without sending, and surfaces lost acknowledgements", async () => {
  const write = query(); m.from.mockReturnValueOnce(query()).mockReturnValueOnce(query()).mockReturnValue(write);
  m.rpc.mockResolvedValueOnce({ data: [{ ...lease(), encrypted_payload: "corrupted" }], error: null });
  await dispatchWaiverOutbox(1); expect(m.send).not.toHaveBeenCalled(); expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error_code: "invalid_payload" }));
  m.from.mockReturnValueOnce(query()).mockReturnValueOnce(query()).mockReturnValueOnce(query([], { message: "connection lost" })); m.rpc.mockResolvedValueOnce({ data: [lease()], error: null }); m.send.mockResolvedValue({ success: true, messageId: "mail-1" });
  await expect(dispatchWaiverOutbox(1)).rejects.toThrow("acknowledgement");
});
