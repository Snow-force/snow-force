import { describe, expect, it } from "vitest";
import { marketingOrigin, signMarketing, verifyMarketing } from "./protocol";
const secret = "test-marketing-secret-at-least-32-characters";
describe("marketing internal authentication", () => {
  it("binds payload and nonce to the timestamp and verifies within five minutes", () => {
    const envelope = signMarketing({ action: "list", actor: "staff" }, secret, 1000000);
    expect(verifyMarketing(envelope, secret, 1000100).payload).toEqual({ action: "list", actor: "staff" });
    expect(signMarketing({}, secret).nonce).not.toBe(signMarketing({}, secret).nonce);
    for (const value of [{ ...envelope, body: "{}" }, { ...envelope, signature: "0".repeat(64) }, { ...envelope, nonce: "invalid" }, { ...envelope, timestamp: 0 }, { ...envelope, signature: "short" }, null]) expect(() => verifyMarketing(value, secret, 1000000)).toThrow();
    expect(() => verifyMarketing(envelope, "short", 1000000)).toThrow();
    expect(() => signMarketing({}, "short")).toThrow();
    expect(() => verifyMarketing(envelope, secret, 1400000)).toThrow();
  });
  it("permits only configured origins and development loopback", () => {
    expect(marketingOrigin("https://shop.example.com", true)).toBe("https://shop.example.com");
    expect(marketingOrigin("http://127.0.0.1:9000", false)).toBe("http://127.0.0.1:9000");
    for (const url of ["https://user:password@example.com", "http://example.com", "https://example.com/path", "https://example.com?key=secret", "https://example.com#x", "http://localhost:9000"]) expect(() => marketingOrigin(url, true)).toThrow();
  });
});
