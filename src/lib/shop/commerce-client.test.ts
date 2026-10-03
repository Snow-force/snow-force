import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { z } from "zod";
import { createCommerceClient, linkCommerceCustomer, CommerceAuthorizationError, CommerceUnavailableError, CommerceNotFoundError, CommerceRejectedError } from "./commerce-client";

const config = { backendUrl: "https://commerce.snow-force.com", publishableKey: "pk_fixture" };
describe("commerce transport", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("keeps authenticated data uncached and credentials on the configured backend", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "fixture" })));
    const request = createCommerceClient(config, fetcher);
    await expect(request("/store/carts/cart_fixture", z.object({ id: z.string() }), { token: "fixture-token" })).resolves.toEqual({ id: "fixture" });
    expect(fetcher).toHaveBeenCalledWith("https://commerce.snow-force.com/store/carts/cart_fixture", expect.objectContaining({ cache: "no-store", redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer fixture-token", "x-publishable-api-key": "pk_fixture" }) }));
  });
  it("rejects unconfigured or insecure hosts and arbitrary credential destinations", async () => {
    for (const backendUrl of ["", "http://untrusted.invalid", "https://secret@commerce.snow-force.com", "https://commerce.snow-force.com/path"]) expect(() => createCommerceClient({ ...config, backendUrl })).toThrow(CommerceUnavailableError);
    const fetcher = vi.fn();
    const request = createCommerceClient(config, fetcher);
    for (const path of ["//untrusted.invalid", "/admin/users", "/store/../admin/users", "/store/%2e%2e/admin/users", "/store/%5cuntrusted", "/store/\\untrusted", "/store/%"]) await expect(request(path, z.unknown())).rejects.toThrow(CommerceUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on malformed data, network failure and authorization errors", async () => {
    const schema = z.object({ id: z.string() });
    await expect(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("{}")))("/store/products", schema)).rejects.toThrow(CommerceUnavailableError);
    await expect(createCommerceClient(config, vi.fn().mockRejectedValue(new Error("sensitive internal error")))("/store/products", schema)).rejects.toThrow("The commerce service is unavailable.");
    await expect(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("private", { status: 401 })))("/store/products", schema)).rejects.toThrow(CommerceAuthorizationError);
  });
  it("registers through the locked UUID bridge and obtains a fresh customer token", async () => {
    const token = "fixture-auth-token-with-length";
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token }))).mockResolvedValueOnce(new Response(JSON.stringify({ customer: { id: "cus_fixture" } }))).mockResolvedValueOnce(new Response(JSON.stringify({ token: `${token}-customer` })));
    const linked = await linkCommerceCustomer("verified-supabase-access-token", createCommerceClient(config, fetcher));
    expect(linked).toEqual({ customerId: "cus_fixture", token: `${token}-customer` });
    expect(fetcher.mock.calls[1][0]).toBe("https://commerce.snow-force.com/store/snowforce/customer");
    expect(fetcher.mock.calls[1][1].body).toBe("{}");
  });
  it("distinguishes rejected changes and missing records without exposing backend error bodies", async () => {
    for (const status of [400, 409, 422]) await expect(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("private internal details", { status })))("/store/carts/cart_fixture", z.unknown())).rejects.toThrow(CommerceRejectedError);
    await expect(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("private internal details", { status: 404 })))("/store/carts/cart_fixture", z.unknown())).rejects.toThrow(CommerceNotFoundError);
  });
});
