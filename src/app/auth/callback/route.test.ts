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

    expect(response.headers.get("location")).toBe("/member?error=callback");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("uses the merchant-only sanitizer and surface-specific error when merchant exchange fails", async () => {
    mocks.sanitizeMerchantNextPath.mockReturnValue("/merchant/dashboard");
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });

    const response = await GET(new NextRequest("https://snowforce.test/auth/callback?code=bad&next=/merchant/dashboard"));

    expect(mocks.sanitizeMerchantNextPath).toHaveBeenCalledWith("/merchant/dashboard");
    expect(response.headers.get("location")).toBe("/merchant?error=callback");
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
      "/member/consent?next=%2Fevents%2Fmammoth-weekend",
    );
  });

  it("keeps merchant callbacks isolated from member consent and profile logic", async () => {
    mocks.sanitizeMerchantNextPath.mockReturnValue("/merchant/dashboard");

    const response = await GET(new NextRequest("https://snowforce.test/auth/callback?code=valid&next=/merchant/dashboard"));

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.resolveMemberAuthDestination).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/merchant/dashboard");
  });

  it.each([
    ["https://0.0.0.0:3000/auth/callback", "/member?error=callback"],
    ["https://0.0.0.0:3000/auth/callback?next=/merchant/dashboard", "/merchant?error=callback"],
  ])("keeps an unsuccessful proxied callback on the visitor's site: %s", async (url, location) => {
    const response = await GET(new NextRequest(url, {
      headers: { host: "snowforce-web-production-5cbf.up.railway.app", "x-forwarded-host": "untrusted.example" },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(location);
    expect(new URL(location, "https://snow-force.com/auth/callback").origin).toBe("https://snow-force.com");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps a successful proxied member callback on the visitor's site", async () => {
    mocks.resolveMemberAuthDestination.mockResolvedValue("/member/trips");
    const response = await GET(new NextRequest("https://0.0.0.0:3000/auth/callback?code=valid"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/member/trips");
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid");
  });

  it("returns to member sign-in when the exchanged session has no user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new NextRequest("https://0.0.0.0:3000/auth/callback?code=valid"));

    expect(response.headers.get("location")).toBe("/member?error=callback");
    expect(mocks.resolveMemberAuthDestination).not.toHaveBeenCalled();
  });
});
