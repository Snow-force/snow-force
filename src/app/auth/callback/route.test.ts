import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  resolveMemberAuthDestination: vi.fn(),
  sanitizeMemberNextPath: vi.fn(),
  sanitizeMerchantNextPath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/members/auth-results", () => ({ sanitizeMemberNextPath: mocks.sanitizeMemberNextPath }));
vi.mock("@/lib/merchants/auth-results", () => ({ sanitizeMerchantNextPath: mocks.sanitizeMerchantNextPath }));
vi.mock("@/lib/members/member-consents", () => ({
  resolveMemberAuthDestination: mocks.resolveMemberAuthDestination,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
    },
  });
  mocks.sanitizeMemberNextPath.mockReturnValue("/member");
  mocks.sanitizeMerchantNextPath.mockReturnValue("/merchant");
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } } });
  mocks.resolveMemberAuthDestination.mockResolvedValue("/member");
});

describe("Supabase auth callback", () => {
  it("rejects a missing member code without creating a Supabase client", async () => {
    const response = await GET(new NextRequest("https://snowforce.test/auth/callback?next=/events/trip"));

    expect(response.headers.get("location")).toBe("https://snowforce.test/member?error=callback");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("uses the merchant-only sanitizer and surface-specific error when merchant exchange fails", async () => {
    mocks.sanitizeMerchantNextPath.mockReturnValue("/merchant/dashboard");
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });

    const response = await GET(new NextRequest("https://snowforce.test/auth/callback?code=bad&next=/merchant/dashboard"));

    expect(mocks.sanitizeMerchantNextPath).toHaveBeenCalledWith("/merchant/dashboard");
    expect(response.headers.get("location")).toBe("https://snowforce.test/merchant?error=callback");
  });

  it("routes a member through the unified post-auth privacy decision", async () => {
    mocks.sanitizeMemberNextPath.mockReturnValue("/events/mammoth-weekend");
    mocks.resolveMemberAuthDestination.mockResolvedValue(
      "/member/consent?next=%2Fevents%2Fmammoth-weekend",
    );

    const response = await GET(new NextRequest("https://snowforce.test/auth/callback?code=valid&next=/events/mammoth-weekend"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(mocks.resolveMemberAuthDestination).toHaveBeenCalledWith(
      { id: "auth-user-1" },
      "/events/mammoth-weekend",
      expect.any(Object),
    );
    expect(response.headers.get("location")).toBe(
      "https://snowforce.test/member/consent?next=%2Fevents%2Fmammoth-weekend",
    );
  });

  it("keeps merchant callbacks isolated from member consent and profile logic", async () => {
    mocks.sanitizeMerchantNextPath.mockReturnValue("/merchant/dashboard");

    const response = await GET(new NextRequest("https://snowforce.test/auth/callback?code=valid&next=/merchant/dashboard"));

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.resolveMemberAuthDestination).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://snowforce.test/merchant/dashboard");
  });
});
