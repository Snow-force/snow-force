import { describe, expect, it } from "vitest";
import { createAdminSessionToken, verifyAdminSessionToken } from "./admin-session";

describe("admin session tokens", () => {
  it("accepts a signed token from the configured admin secret", () => {
    const token = createAdminSessionToken("review-secret", new Date("2026-05-21T12:00:00Z"));

    expect(
      verifyAdminSessionToken(token, "review-secret", new Date("2026-05-21T13:00:00Z")),
    ).toBe(true);
  });

  it("rejects tokens signed with another secret", () => {
    const token = createAdminSessionToken("review-secret", new Date("2026-05-21T12:00:00Z"));

    expect(
      verifyAdminSessionToken(token, "wrong-secret", new Date("2026-05-21T13:00:00Z")),
    ).toBe(false);
  });
});
