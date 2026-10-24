import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ account: vi.fn(), event: vi.fn(), policy: vi.fn(), invitation: vi.fn(), assignment: vi.fn(), bookings: vi.fn(), existing: vi.fn(), rpc: vi.fn(), single: vi.fn(), cookieGet: vi.fn(), cookieSet: vi.fn(), cookieDelete: vi.fn(), queue: vi.fn(), schedule: vi.fn(), proof: vi.fn(), resolveMember: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({ getCurrentMemberAccount: m.account }));
vi.mock("@/lib/events/repository", () => ({ getEvent: m.event }));
vi.mock("./repository", () => ({ getWaiverPolicy: m.policy, getWaiverInvitation: m.invitation, getAssignment: m.assignment, listEventBookings: m.bookings, findBookingRequest: m.existing }));
vi.mock("./verified-attendee", () => ({ resolveVerifiedAttendeeMember: m.resolveMember }));
vi.mock("./delivery", () => ({ queueWaiverInvitation: m.queue }));
vi.mock("./schedule", () => ({ scheduleWaiverDelivery: m.schedule }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.cookieGet, set: m.cookieSet, delete: m.cookieDelete }), headers: async () => new Headers({ "user-agent": "test-agent" }) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc: m.rpc, from: () => { const query = { select: () => query, eq: () => query, single: m.single, maybeSingle: m.proof }; return query; } }) }));
import { createEventBookingAction, manageBookingWaiverAction, requestWaiverCodeAction, signEventWaiverAction, verifyWaiverCodeAction } from "./actions";
import { decryptDelivery, digest } from "./secrets";
import { seedEvents } from "@/lib/events/seed";
const event = { ...seedEvents[0], slug: "v2", status: "published", registrationState: "open", registrationCount: 0, registrationCloseAt: "2099-01-01", eventDate: "2099-11-07", capacity: 0, allowProxyRegistrations: true, maxProxyRegistrations: 5, registrationQuestions: [], paymentModel: "free" };
const participant = { key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "proxy", dateOfBirth: "2080-01-01", attendeeEmail: "friend@example.test", guardianName: "", guardianEmail: "", guardianRelationship: "parent", answers: { name: "Friend" } };
const input = { requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", lang: "en" as const, permission: true, participants: [participant] };
const token = "c".repeat(64);
function bookingForm(patch: Partial<typeof input> = {}) { const value = { ...input, ...patch }; const form = new FormData(); form.set("eventSlug", "v2"); form.set("requestKey", value.requestKey); form.set("lang", value.lang); form.set("permission", value.permission ? "on" : ""); form.set("participants", JSON.stringify(value.participants)); return form; }
function tokenForm(code?: string) { const form = new FormData(); form.set("token", token); if (code) form.set("code", code); return form; }
function signForm() { const form = new FormData(); for (const [key, value] of Object.entries({ token, decision: "accept", typedName: "Friend", signerRole: "attendee", attested: "on" })) form.set(key, value); return form; }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", "d".repeat(64));
  m.account.mockResolvedValue({ profile: { id: "booker" }, user: { email: "payer@example.test" }, emailConfirmed: true });
  m.event.mockResolvedValue(event); m.policy.mockResolvedValue({ approved: true, enableGroupForm: true, requireEmailedWaiver: true }); m.existing.mockResolvedValue(null);
  m.rpc.mockResolvedValue({ data: "booking", error: null }); m.bookings.mockResolvedValue([{ id: "booking", participants: [] }]);
  m.cookieGet.mockReturnValue({ value: "verified-browser-proof" }); m.proof.mockResolvedValue({ data: { generation: 1, proof_hash: digest("verified-browser-proof"), proof_expires_at: "2099-01-01", consumed_at: null }, error: null }); m.resolveMember.mockResolvedValue(null);
  m.invitation.mockResolvedValue({ assignment: { id: "assignment", recipient_email: "friend@example.test", generation: 1 }, participant: { attendee_name: "Friend", signer_role: "attendee", registration_kind: "proxy" }, registration: { event_slug: "v2", booker_member_id: "booker" }, language: "zh" });
});
afterEach(() => vi.unstubAllEnvs());
describe("V2 authenticated command boundaries", () => {
  it.each([null, { profile: { id: "booker" }, user: { email: "payer@example.test" }, emailConfirmed: false }])("denies missing/unverified accounts before creating a booking", async (account) => {
    m.account.mockResolvedValue(account); expect((await createEventBookingAction(bookingForm())).success).toBe(false); expect(m.rpc).not.toHaveBeenCalled();
  });
  it("takes the payer identity from auth and keeps age/guardian details out of questionnaire answers", async () => {
    expect((await createEventBookingAction(bookingForm())).success).toBe(true);
    expect(m.rpc).toHaveBeenCalledWith("create_event_booking_v2", expect.objectContaining({ booker_id_input: "booker", contact_email_input: "payer@example.test", participants_input: [expect.objectContaining({ signerRole: "attendee", recipientEmail: "friend@example.test", answers: { name: "Friend", email: "friend@example.test" } })] }));
    expect(m.bookings).toHaveBeenCalledWith("booker");
  });
  it("blocks disabled rollout, missing permission, invalid DOB and forged request keys", async () => {
    m.policy.mockResolvedValueOnce({ approved: true, enableGroupForm: false, requireEmailedWaiver: true }); expect((await createEventBookingAction(bookingForm())).success).toBe(false);
    for (const patch of [{ permission: false }, { requestKey: "wrong" }, { participants: [{ ...participant, dateOfBirth: "future" }] }]) expect((await createEventBookingAction(bookingForm(patch))).success).toBe(false);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("recovers an identical owned request without reopening enrollment or re-quoting coupons", async () => {
    const hash = digest(JSON.stringify({ eventSlug: "v2", participants: input.participants, lang: input.lang }));
    m.existing.mockResolvedValue({ id: "booking", request_hash: hash }); expect((await createEventBookingAction(bookingForm())).success).toBe(true); expect(m.event).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
    m.existing.mockResolvedValue({ id: "booking", request_hash: "different" }); expect((await createEventBookingAction(bookingForm())).success).toBe(false);
  });
  it("never lets a booker, unverified browser, or wrong signer role accept an adult friend’s waiver", async () => {
    expect((await signEventWaiverAction(signForm())).success).toBe(false); expect(m.rpc).not.toHaveBeenCalled();
    m.account.mockResolvedValue(null); m.cookieGet.mockReturnValue(undefined); expect((await signEventWaiverAction(signForm())).success).toBe(false);
    m.cookieGet.mockReturnValue({ value: "proof" }); const wrong = signForm(); wrong.set("signerRole", "guardian"); expect((await signEventWaiverAction(wrong)).success).toBe(false); expect(m.rpc).not.toHaveBeenCalled();
  });
  it("binds signature evidence to the verified proof and links only an authenticated matching attendee", async () => {
    m.account.mockResolvedValue({ profile: { id: "attendee-member" }, user: { email: "friend@example.test" }, emailConfirmed: true });
    expect((await signEventWaiverAction(signForm())).success).toBe(true);
    expect(m.rpc).toHaveBeenCalledWith("respond_event_waiver", expect.objectContaining({ member_id_input: "attendee-member", signer_role_input: "attendee", proof_hash_input: digest("verified-browser-proof"), receipt_payload_input: expect.any(String) }));
    expect(m.cookieDelete).toHaveBeenCalled();
    expect(decryptDelivery(m.rpc.mock.calls[0][1].receipt_payload_input)).toMatchObject({ lang: "zh", kind: "signed" });
  });
  it("sends codes only to the server-designated recipient, enforces RPC rate limits, and stores proof in an httpOnly cookie", async () => {
    m.rpc.mockResolvedValueOnce({ data: false, error: null }); expect((await requestWaiverCodeAction(tokenForm())).success).toBe(false); expect(m.schedule).not.toHaveBeenCalled();
    m.rpc.mockResolvedValueOnce({ data: true, error: null }); expect((await requestWaiverCodeAction(tokenForm())).success).toBe(true);
    expect(m.rpc.mock.calls[1][1]).not.toHaveProperty("recipient_email"); expect(m.rpc.mock.calls[1][1].code_hash_input).toMatch(/^[a-f0-9]{64}$/);
    expect(decryptDelivery(m.rpc.mock.calls[1][1].payload_input)).toMatchObject({ lang: "zh", kind: "verification" });
    expect((await verifyWaiverCodeAction(tokenForm("bad"))).success).toBe(false);
    m.rpc.mockResolvedValueOnce({ data: true, error: null }); expect((await verifyWaiverCodeAction(tokenForm("123456"))).success).toBe(true);
    expect(m.cookieSet).toHaveBeenCalledWith(expect.stringMatching(/^sf-waiver-/), expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ httpOnly: true, sameSite: "strict", maxAge: 900 }));
  });
  it("denies managing another booker’s recipient or sending arbitrary operations", async () => {
    m.assignment.mockResolvedValue({ id: "assignment", registration_id: "ticket" }); m.single.mockResolvedValue({ data: { booker_member_id: "someone-else" } });
    const form = new FormData(); form.set("assignmentId", "assignment"); form.set("operation", "resend");
    expect((await manageBookingWaiverAction(form)).success).toBe(false); expect(m.queue).not.toHaveBeenCalled();
    m.single.mockResolvedValue({ data: { booker_member_id: "booker" } }); form.set("operation", "forged"); expect((await manageBookingWaiverAction(form)).success).toBe(false);
  });
});
