import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ account: vi.fn(), session: vi.fn(), user: vi.fn(), client: vi.fn(), link: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({ getCurrentMemberAccount: mocks.account }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getSession: mocks.session, getUser: mocks.user } }) }));
vi.mock("./commerce-client", () => ({ commerceClient: mocks.client, linkCommerceCustomer: mocks.link, CommerceAuthorizationError: class extends Error {} }));
import { getCommerceCustomerSession } from "./commerce-auth";
const account = { profile: { id: "profile_fixture" }, privacyAccepted: true, emailConfirmed: true, user: { id: "auth_fixture", created_at: "2026-10-11T00:00:00Z", email: "verified@example.com" } };
beforeEach(() => { vi.clearAllMocks(); mocks.account.mockResolvedValue(account); mocks.session.mockResolvedValue({ data: { session: { access_token: "fixture-token", user: account.user } }, error: null }); mocks.user.mockResolvedValue({ data: { user: { ...account.user, email_confirmed_at: "2026-10-11T00:00:00Z" } }, error: null }); mocks.client.mockReturnValue("fixture-request"); mocks.link.mockResolvedValue({ customerId: "cus_fixture", token: "customer-token" }); });
it("uses verified Auth UUID, creation time and email instead of profile ID or supplied identity", async () => { expect(await getCommerceCustomerSession()).toEqual({ customerId: "cus_fixture", token: "customer-token", userId: "auth_fixture", createdAt: account.user.created_at, email: "verified@example.com", request: "fixture-request" }); expect(mocks.link).toHaveBeenCalledWith("fixture-token", "fixture-request"); });
it("rejects missing, unverified or nonconsenting accounts before contacting commerce", async () => { for (const candidate of [null, { ...account, emailConfirmed: false }, { ...account, privacyAccepted: false }, { ...account, profile: null }]) { mocks.account.mockResolvedValue(candidate); await expect(getCommerceCustomerSession()).rejects.toThrow(); } expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.link).not.toHaveBeenCalled(); });
it("rejects missing or expired session credentials before contacting commerce", async () => { for (const session of [null, { access_token: "" }]) { mocks.session.mockResolvedValue({ data: { session }, error: null }); await expect(getCommerceCustomerSession()).rejects.toThrow(); } expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.link).not.toHaveBeenCalled(); });
it("verifies the exact access token and never reads the untrusted serialized user", async () => {
  const session = { access_token: "fixture-token", get user() { throw new Error("Untrusted session user must not be read"); } };
  mocks.session.mockResolvedValue({ data: { session }, error: null });
  await expect(getCommerceCustomerSession()).resolves.toMatchObject({ userId: account.user.id });
  expect(mocks.user).toHaveBeenCalledWith("fixture-token");
});
it("rejects revoked, foreign, changed-email and unverified token identities", async () => {
  for (const user of [null, { ...account.user, id: "another_user", email_confirmed_at: "2026-10-11T00:00:00Z" }, { ...account.user, email: "another@example.test", email_confirmed_at: "2026-10-11T00:00:00Z" }, { ...account.user, email_confirmed_at: null }]) {
    mocks.user.mockResolvedValue({ data: { user }, error: null });
    await expect(getCommerceCustomerSession()).rejects.toThrow();
  }
  mocks.user.mockResolvedValue({ data: { user: account.user }, error: new Error("revoked") });
  await expect(getCommerceCustomerSession()).rejects.toThrow();
  expect(mocks.link).not.toHaveBeenCalled();
});
