import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decryptDelivery, digest, encryptDelivery, randomToken } from "./secrets";
afterEach(() => vi.unstubAllEnvs());
describe("private outbox capability encryption", () => {
  it("requires a dedicated key and authenticates the encrypted payload", () => {
    vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", ""); expect(() => encryptDelivery({ token: "secret" })).toThrow("not configured");
    vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", "a".repeat(64));
    const encrypted = encryptDelivery({ token: "secret", code: "123456" });
    expect(encrypted).not.toContain("secret"); expect(encrypted).not.toContain("123456"); expect(decryptDelivery(encrypted)).toEqual({ token: "secret", code: "123456" });
    expect(encryptDelivery({ token: "secret", code: "123456" })).not.toBe(encrypted);
    const bytes = Buffer.from(encrypted, "base64url"); bytes[bytes.length - 1] ^= 1;
    expect(() => decryptDelivery(bytes.toString("base64url"))).toThrow();
    vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", "b".repeat(64)); expect(() => decryptDelivery(encrypted)).toThrow();
  });
  it("uses independent 256-bit capabilities and stable one-way digests", () => {
    const a = randomToken(), b = randomToken(); expect(a).toMatch(/^[a-f0-9]{64}$/); expect(a).not.toBe(b);
    expect(digest(a)).toHaveLength(64); expect(digest(a)).not.toBe(a); expect(digest(a)).toBe(digest(a));
  });
});
