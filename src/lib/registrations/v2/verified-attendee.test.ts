import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ candidates: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => { const query = { select: () => query, eq: () => query, limit: m.candidates }; return { from: () => query, auth: { admin: { getUserById: m.user } } }; } }));
import { resolveVerifiedAttendeeMember } from "./verified-attendee";
beforeEach(() => { vi.resetAllMocks(); m.candidates.mockResolvedValue({ data: [{ id: "member", user_id: "auth-user" }], error: null }); });
it("does not trust a writable profile email or user metadata to claim another member", async () => {
  m.user.mockResolvedValueOnce({ data: { user: { email: "different@example.test", email_confirmed_at: "2026-01-01", user_metadata: { email: "friend@example.test" } } }, error: null });
  expect(await resolveVerifiedAttendeeMember("friend@example.test")).toBeNull();
  m.user.mockResolvedValueOnce({ data: { user: { email: "friend@example.test", email_confirmed_at: null } }, error: null });
  expect(await resolveVerifiedAttendeeMember("friend@example.test")).toBeNull();
});
it("links only the canonical confirmed auth email after mailbox proof and fails closed on lookup errors", async () => {
  m.user.mockResolvedValueOnce({ data: { user: { email: "Friend@example.test", email_confirmed_at: "2026-01-01" } }, error: null });
  expect(await resolveVerifiedAttendeeMember("friend@example.test")).toBe("member"); expect(m.user).toHaveBeenCalledWith("auth-user");
  m.user.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } }); await expect(resolveVerifiedAttendeeMember("friend@example.test")).rejects.toThrow("unavailable");
});
