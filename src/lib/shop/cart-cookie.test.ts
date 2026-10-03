import { describe, expect, it } from "vitest";
import { CART_COOKIE_MAX_AGE, readCartCookie, signCartCookie } from "./cart-cookie";
import { fixtureUserId } from "./shop.fixtures";
const secret = "a".repeat(64);
describe("owner-bound signed cart cookie", () => {
  it("restores only the same verified user and rejects tampering, rotation and expiry", () => {
    const value = signCartCookie("cart_fixture", fixtureUserId, secret, 1000);
    expect(readCartCookie(value, fixtureUserId, secret, 2000)).toBe("cart_fixture");
    expect(readCartCookie(value, "150b5a8d-0f50-46e6-9772-83b44f7a32bb", secret, 2000)).toBeNull();
    expect(readCartCookie(value, fixtureUserId, "b".repeat(64), 2000)).toBeNull();
    expect(readCartCookie(value.replace(/.$/, "!"), fixtureUserId, secret, 2000)).toBeNull();
    expect(readCartCookie(value, fixtureUserId, secret, 1000 + CART_COOKIE_MAX_AGE * 1000)).toBeNull();
  });
  it("rejects malformed IDs, signatures, cookies and missing configuration", () => {
    expect(() => signCartCookie("cart_fixture", fixtureUserId, "short")).toThrow();
    expect(() => signCartCookie("../cart", fixtureUserId, secret)).toThrow();
    for (const value of [undefined, "a.b.c", "a".repeat(601), "abc." + "a".repeat(43), "abc.def"]) expect(readCartCookie(value, fixtureUserId, secret)).toBeNull();
  });
});
