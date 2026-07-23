import { describe, expect, it } from "vitest";
import {
  merchantAuthCallbackUrl,
  merchantAuthStatusMessage,
  sanitizeMerchantNextPath,
} from "./auth-results";

describe("merchant auth callback results", () => {
  it("S2-callback-allows-relative-merchant-next-only", () => {
    expect(sanitizeMerchantNextPath("/merchant")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("/merchant/applications/new")).toBe("/merchant/applications/new");
    expect(sanitizeMerchantNextPath("/merchant/settings")).toBe("/merchant/settings");
  });

  it("S2-callback-rejects-external-next", () => {
    expect(sanitizeMerchantNextPath("https://evil.example/merchant")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("//evil.example/merchant")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("\\\\evil.example\\merchant")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("/admin")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("/member")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("/events/mammoth")).toBe("/merchant");
  });

  it("S2-callback-rejects-control-characters-in-next", () => {
    expect(sanitizeMerchantNextPath("/merchant\nattacker.example")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("/merchant\tjavascript:alert(1)")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("/merchant\u0000admin")).toBe("/merchant");
  });

  it("S2-callback-defaults-to-merchant-when-next-is-empty-or-malformed", () => {
    expect(sanitizeMerchantNextPath(null)).toBe("/merchant");
    expect(sanitizeMerchantNextPath("")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("javascript:alert(1)")).toBe("/merchant");
    expect(sanitizeMerchantNextPath("merchant")).toBe("/merchant");
  });

  it("S2-reset-redirect-target-is-callback-reset", () => {
    expect(merchantAuthCallbackUrl("https://snowforce.test", "/merchant/reset-password")).toBe(
      "https://snowforce.test/auth/callback?next=%2Fmerchant%2Freset-password",
    );
  });

  it("S2-callback-url-strips-trailing-slash-on-site", () => {
    expect(merchantAuthCallbackUrl("https://snowforce.test/", "/merchant")).toBe(
      "https://snowforce.test/auth/callback?next=%2Fmerchant",
    );
  });

  it("S1-auth-result-maps-safe-status", () => {
    expect(merchantAuthStatusMessage("magicSent")).toEqual({
      tone: "success",
      title: "Check your inbox",
      body: "If this email can sign in, a secure SnowForce vendor link has been sent.",
    });
    expect(merchantAuthStatusMessage("login")).toEqual({
      tone: "error",
      title: "Could not sign in",
      body: "Check your email and password, then try again.",
    });
    expect(merchantAuthStatusMessage("register")).toEqual({
      tone: "error",
      title: "Could not create vendor account",
      body: "Check your details and try again.",
    });
  });
});
