import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createClient: vi.fn(),
  sanitizeMemberNextPath: vi.fn(),
  sanitizeMerchantNextPath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/members/auth-results", () => ({ sanitizeMemberNextPath: mocks.sanitizeMemberNextPath }));
vi.mock("@/lib/merchants/auth-results", () => ({ sanitizeMerchantNextPath: mocks.sanitizeMerchantNextPath }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockReturnValue({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } });
  mocks.sanitizeMemberNextPath.mockReturnValue("/member");
  mocks.sanitizeMerchantNextPath.mockReturnValue("/merchant");
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("Supabase auth callback", () => {
  it("rejects a missing member code without creating a Supabase client", async () => {
    const response = await GET(new Request("https://snowforce.test/auth/callback?next=/events/trip") as never);

    expect(response.headers.get("location")).toBe("https://snowforce.test/member?error=callback");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("uses the merchant-only sanitizer and surface-specific error when merchant exchange fails", async () => {
    mocks.sanitizeMerchantNextPath.mockReturnValue("/merchant/dashboard");
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });

    const response = await GET(new Request("https://snowforce.test/auth/callback?code=bad&next=/merchant/dashboard") as never);

    expect(mocks.sanitizeMerchantNextPath).toHaveBeenCalledWith("/merchant/dashboard");
    expect(response.headers.get("location")).toBe("https://snowforce.test/merchant?error=callback");
  });

  it("exchanges the code once and redirects only to the sanitized member path", async () => {
    mocks.sanitizeMemberNextPath.mockReturnValue("/events/mammoth-weekend");

    const response = await GET(new Request("https://snowforce.test/auth/callback?code=valid&next=https://evil.example") as never);

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(response.headers.get("location")).toBe("https://snowforce.test/events/mammoth-weekend");
  });
});
