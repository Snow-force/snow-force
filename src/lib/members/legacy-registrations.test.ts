import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), from: vi.fn(), update: vi.fn(), is: vi.fn(), eq: vi.fn(), ilike: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.admin }));
import { recoverLegacyMemberRegistrations } from "./legacy-registrations";

const user = { id: "user-1", email: "Rider@example.com", email_confirmed_at: "2026-11-01" };
const profile = { id: "profile-1", userId: "user-1", email: "rider@example.com" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockReturnValue(mocks);
  for (const fn of [mocks.from, mocks.update, mocks.is, mocks.eq]) fn.mockReturnValue(mocks);
  mocks.ilike.mockResolvedValue({ error: null });
});

describe("verified legacy registration recovery", () => {
  it("links only unowned legacy self registrations to the verified member", async () => {
    await recoverLegacyMemberRegistrations(user, profile);
    expect(mocks.from).toHaveBeenCalledWith("registrations");
    expect(mocks.update).toHaveBeenCalledWith({ member_id: "profile-1", booker_member_id: "profile-1" });
    expect(mocks.is.mock.calls).toEqual([["member_id", null], ["booker_member_id", null]]);
    expect(mocks.eq.mock.calls).toEqual([["creation_source", "legacy"], ["registration_kind", "self"]]);
    expect(mocks.ilike).toHaveBeenCalledWith("contact_email", "rider@example.com");
  });
  it.each([
    [{ ...user, email_confirmed_at: undefined }, profile],
    [{ ...user, email: undefined }, profile],
    [user, { ...profile, userId: "another-user" }],
    [user, { ...profile, email: "other@example.com" }],
  ])("refuses unverified or mismatched identities", async (identity, member) => {
    await recoverLegacyMemberRegistrations(identity, member);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("treats email pattern characters literally and preserves plus aliases", async () => {
    const email = "a_b%+tag@example.com";
    await recoverLegacyMemberRegistrations({ ...user, email }, { ...profile, email });
    expect(mocks.ilike).toHaveBeenCalledWith("contact_email", "a\\_b\\%+tag@example.com");
  });
  it("reports a failed recovery rather than pretending history was linked", async () => {
    mocks.ilike.mockResolvedValue({ error: { message: "unique constraint" } });
    await expect(recoverLegacyMemberRegistrations(user, profile)).rejects.toThrow("Unable to recover");
  });
});
