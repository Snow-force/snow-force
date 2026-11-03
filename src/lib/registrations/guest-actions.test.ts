import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  registration: vi.fn(),
  invitation: vi.fn(),
  issue: vi.fn(),
  respond: vi.fn(),
  staff: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({
  getCurrentMemberAccount: mocks.account,
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.staff }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("./repository", () => ({ getRegistration: mocks.registration }));
vi.mock("./guest-invitations", () => ({
  getGuestInvitation: mocks.invitation,
  issueGuestInvitation: mocks.issue,
  respondGuestInvitation: mocks.respond,
}));
import {
  createGuestInvitationAction,
  respondGuestInvitationAction,
  staffGuestCheckinAction,
  staffGuestInvitationAction,
  staffRevokeGuestInvitationAction,
  staffReviewProxyRegistrationAction,
} from "./guest-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue({
    profile: { id: "booker" },
    emailConfirmed: true,
  });
  mocks.registration.mockResolvedValue({
    id: "ticket",
    bookerMemberId: "booker",
    memberId: null,
    registrationKind: "proxy",
  });
  mocks.issue.mockResolvedValue("/events/guest/token");
  mocks.staff.mockResolvedValue({ userId: "staff" });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("guest action authorization", () => {
  it("blocks stale rejection submissions without changing registrations", async () => {
    const f = new FormData();
    f.set("decision", "reject");
    f.set("registrationId", "ticket");
    expect(await staffReviewProxyRegistrationAction(f)).toMatchObject({
      success: false,
      reason: "cancellation_approval_required",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["approve"])(
    "requires staff authorization for %s and records the actor",
    async (decision) => {
      const form = new FormData();
      form.set("registrationId", "ticket");
      form.set("decision", decision);
      expect(await staffReviewProxyRegistrationAction(form)).toEqual({
        success: true,
      });
      expect(mocks.rpc).toHaveBeenCalledWith("review_proxy_registration", {
        registration_id_input: "ticket",
        approved_input: decision === "approve",
        actor_id_input: "staff",
      });
      mocks.rpc.mockClear();
      mocks.staff.mockRejectedValue(new Error("staff required"));
      await expect(staffReviewProxyRegistrationAction(form)).rejects.toThrow(
        "staff required",
      );
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid review decisions and reports database conflicts", async () => {
    expect(
      await staffReviewProxyRegistrationAction(new FormData()),
    ).toMatchObject({ success: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
    const form = new FormData();
    form.set("registrationId", "ticket");
    form.set("decision", "approve");
    mocks.rpc.mockResolvedValue({ error: { message: "not reviewable" } });
    expect(await staffReviewProxyRegistrationAction(form)).toEqual({
      success: false,
    });
  });
  it("allows only the verified owner to issue a friend invitation", async () => {
    expect(await createGuestInvitationAction("ticket")).toEqual({
      success: true,
      url: "/events/guest/token",
    });
    expect(mocks.issue).toHaveBeenCalledWith("ticket", "booker");
    mocks.issue.mockClear();
    mocks.account.mockResolvedValue({
      profile: { id: "other" },
      emailConfirmed: true,
    });
    expect(await createGuestInvitationAction("ticket")).toEqual({
      success: false,
    });
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it.each([null, { profile: { id: "booker" }, emailConfirmed: false }])(
    "blocks missing or unverified account %j",
    async (account) => {
      mocks.account.mockResolvedValue(account);
      expect(await createGuestInvitationAction("ticket")).toEqual({
        success: false,
      });
      expect(mocks.issue).not.toHaveBeenCalled();
    },
  );
  it("does not turn self tickets into guest authorizations", async () => {
    mocks.registration.mockResolvedValue({
      id: "ticket",
      memberId: "booker",
      registrationKind: "self",
    });
    expect(await createGuestInvitationAction("ticket")).toEqual({
      success: false,
    });
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("requires staff authorization and an identity check before check-in", async () => {
    const form = new FormData();
    form.set("registrationId", "ticket");
    expect(await staffGuestCheckinAction(form)).toEqual({ success: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
    form.set("identityChecked", "on");
    expect(await staffGuestCheckinAction(form)).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("checkin_registration_guest", {
      registration_id_input: "ticket",
      actor_id_input: "staff",
    });
    mocks.rpc.mockClear();
    mocks.staff.mockRejectedValue(new Error("staff required"));
    await expect(staffGuestCheckinAction(form)).rejects.toThrow(
      "staff required",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("revokes an invitation through a staff-only audited RPC", async () => {
    const form = new FormData();
    form.set("registrationId", "ticket");
    expect(await staffRevokeGuestInvitationAction(form)).toEqual({
      success: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "revoke_registration_guest_invitation",
      { registration_id_input: "ticket", actor_id_input: "staff" },
    );
  });
  it("never issues staff links when staff authentication fails", async () => {
    mocks.staff.mockRejectedValue(new Error("staff required"));
    await expect(staffGuestInvitationAction(new FormData())).rejects.toThrow(
      "staff required",
    );
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("rejects unspecified invitation decisions without changing the ticket", async () => {
    expect(await respondGuestInvitationAction(new FormData())).toEqual({
      success: false,
    });
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it("blocks the signed-in booker from accepting an adult friend’s waiver", async () => {
    mocks.invitation.mockResolvedValue({ registrationId: "ticket" });
    const form = new FormData();
    form.set("decision", "accept");
    form.set("signerRole", "attendee");
    form.set("token", "token");
    expect(await respondGuestInvitationAction(form)).toEqual({
      success: false,
      reason: "booker_cannot_sign",
    });
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it.each([null, { profile: { id: "friend-account" }, emailConfirmed: true }])(
    "allows the attendee’s own guest or member session %j",
    async (account) => {
      mocks.account.mockResolvedValue(account);
      mocks.invitation.mockResolvedValue({ registrationId: "ticket" });
      mocks.respond.mockResolvedValue({ success: true });
      const form = new FormData();
      for (const [key, value] of Object.entries({
        decision: "accept",
        signerRole: "attendee",
        token: "token",
        typedName: "Friend",
        attested: "on",
      }))
        form.set(key, value);
      expect(await respondGuestInvitationAction(form)).toEqual({
        success: true,
      });
      expect(mocks.respond).toHaveBeenCalledWith({
        token: "token",
        accepted: true,
        typedName: "Friend",
        signerRole: "attendee",
        attested: true,
      });
    },
  );
  it("returns recoverable errors for failed staff issue, check-in and revocation operations", async () => {
    const form = new FormData();
    form.set("registrationId", "ticket");
    form.set("identityChecked", "on");
    expect(await staffGuestInvitationAction(form)).toMatchObject({
      success: true,
    });
    mocks.issue.mockRejectedValue(new Error("down"));
    expect(await staffGuestInvitationAction(form)).toEqual({ success: false });
    mocks.rpc.mockResolvedValue({ error: { message: "down" } });
    expect(await staffGuestCheckinAction(form)).toEqual({ success: false });
    expect(await staffRevokeGuestInvitationAction(form)).toEqual({
      success: false,
    });
  });
});
