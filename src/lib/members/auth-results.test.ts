import { describe, expect, it } from "vitest";
import {
  authStatusMessage,
  memberAuthCallbackUrl,
  sanitizeMemberNextPath,
} from "./auth-results";

describe("member auth callback results", () => {
  it("S2-callback-allows-relative-member-next-only", () => {
    expect(sanitizeMemberNextPath("/member")).toBe("/member");
    expect(sanitizeMemberNextPath("/member/reset-password")).toBe("/member/reset-password");
    expect(sanitizeMemberNextPath("/events/mammoth-weekend")).toBe("/events/mammoth-weekend");
  });

  it("S2-callback-rejects-external-next", () => {
    expect(sanitizeMemberNextPath("https://evil.example/member")).toBe("/member");
    expect(sanitizeMemberNextPath("//evil.example/member")).toBe("/member");
    expect(sanitizeMemberNextPath("\\\\evil.example\\member")).toBe("/member");
    expect(sanitizeMemberNextPath("/admin")).toBe("/member");
  });

  it("S2-reset-redirect-target-is-callback-reset", () => {
    expect(memberAuthCallbackUrl("https://snowforce.test", "/member/reset-password")).toBe(
      "https://snowforce.test/auth/callback?next=%2Fmember%2Freset-password",
    );
  });

  it("S1-auth-result-maps-safe-status", () => {
    expect(authStatusMessage("magicSent")).toEqual({
      tone: "success",
      title: "Check your inbox",
      body: "If this email can sign in, a secure SnowForce link has been sent.",
    });
    expect(authStatusMessage("login")).toEqual({
      tone: "error",
      title: "Could not sign in",
      body: "Check your email and password, then try again.",
    });
  });
});
