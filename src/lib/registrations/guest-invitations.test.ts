import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => mocks }));
import { getGuestInvitation, hashGuestToken, issueGuestInvitation, respondGuestInvitation } from "./guest-invitations";

function query(data: unknown, error: unknown = null) {
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); return builder;
}
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null }); });

describe("guest capabilities", () => {
  it("rejects malformed tokens before touching privileged storage", async () => {
    expect(hashGuestToken("invalid")).toBeNull();
    expect(await getGuestInvitation("invalid")).toBeNull(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("stores only a hash and returns the one-time private link to the caller", async () => {
    const url = await issueGuestInvitation("registration", "booker");
    const token = url.split("/").at(-1)!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.rpc).toHaveBeenCalledWith("issue_registration_guest_invitation", expect.objectContaining({
      token_hash_input: hashGuestToken(token), registration_id_input: "registration", actor_id_input: "booker",
    }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token);
  });
  it("returns exactly one attendee and their waiver without payer/financial details", async () => {
    mocks.from.mockReturnValueOnce(query({ registration_id: "one", status: "issued", expires_at: "2099-01-01", waiver_text: "Terms" }))
      .mockReturnValueOnce(query({ contact_name: "Friend", event_slug: "ride", status: "confirmed", registration_kind: "proxy" }));
    expect(await getGuestInvitation("a".repeat(64))).toEqual({ attendeeName: "Friend", eventSlug: "ride", waiverText: "Terms",registrationId: "one",confirmationStatus: "issued",attendanceStatus: "unmarked",approvalStatus: "not_required" });
  });
  it.each(["revoked"])("rejects %s invitations", async (status) => {
    mocks.from.mockReturnValue(query({ registration_id: "one", status, expires_at: "2099-01-01" }));
    expect(await getGuestInvitation("a".repeat(64))).toBeNull(); expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("keeps the accepted personal ticket readable without permitting another signature", async () => {
    mocks.from.mockReturnValueOnce(query({ registration_id: "one",status: "accepted",expires_at: "2099-01-01" }))
      .mockReturnValueOnce(query({ contact_name: "Friend",event_slug: "ride",status: "confirmed",registration_kind: "proxy",attendance_status: "attended" }));
    expect(await getGuestInvitation("a".repeat(64))).toMatchObject({ confirmationStatus: "accepted",registrationId: "one",attendanceStatus: "attended" });
  });
  it("rejects expired links and canceled tickets", async () => {
    mocks.from.mockReturnValueOnce(query({ status: "issued", expires_at: "2020-01-01" }));
    expect(await getGuestInvitation("a".repeat(64))).toBeNull();
    mocks.from.mockReturnValueOnce(query({ registration_id: "one", status: "issued", expires_at: "2099-01-01" }))
      .mockReturnValueOnce(query({ status: "cancelled", registration_kind: "proxy" }));
    expect(await getGuestInvitation("a".repeat(64))).toBeNull();
  });
  it.each(["attendee", "guardian"])("accepts an attested %s signature through the atomic RPC", async (signerRole) => {
    expect(await respondGuestInvitation({ token: "a".repeat(64), accepted: true, typedName: " Legal Name ", signerRole, attested: true })).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("respond_registration_guest_invitation", expect.objectContaining({ typed_name_input: "Legal Name", signer_role_input: signerRole }));
  });
  it("requires personal attestation and rejects booker signatures", async () => {
    const input = { token: "a".repeat(64), accepted: true, typedName: "Name", signerRole: "attendee", attested: true };
    for (const value of [{ attested: false }, { signerRole: "booker" }, { typedName: " " }]) {
      expect(await respondGuestInvitation({ ...input, ...value })).toEqual({ success: false });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("allows declining without fabricating a signature", async () => {
    expect(await respondGuestInvitation({ token: "a".repeat(64), accepted: false, typedName: "", signerRole: "", attested: false })).toEqual({ success: true });
  });
  it("reports storage errors instead of returning a false success", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "unavailable" } });
    await expect(issueGuestInvitation("registration", "booker")).rejects.toThrow("Invitation could not be issued");
    expect(await respondGuestInvitation({ token: "a".repeat(64), accepted: false, typedName: "", signerRole: "", attested: false })).toEqual({ success: false });
  });
});
