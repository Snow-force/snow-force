import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { z } from "zod";
import { createCommerceClient, linkCommerceCustomer, CommerceAuthorizationError, CommerceUnavailableError, CommerceNotFoundError, CommerceRejectedError, CommerceSalesDisabledError } from "./commerce-client";

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
  it("waits for bounded native checkout writes while keeping reads and unrelated requests short", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const request = createCommerceClient(config, vi.fn().mockImplementation(async () => new Response("{}")));
    for (const path of ["/store/snowforce/checkout/cart_fixture/pickup", "/store/snowforce/checkout/cart_fixture/quote", "/store/snowforce/checkout/cart_fixture/edit", "/store/snowforce/checkout/cart_fixture", "/store/carts/cart_fixture?fields=id", "/store/carts/cart_fixture/shipping-methods", "/store/carts", "/store/carts/cart_fixture/line-items", "/store/carts/cart_fixture/line-items/cali_fixture"]) {
      await request(path, z.object({}), { method: "POST", body: {} });
      expect(timeout).toHaveBeenLastCalledWith(60_000);
    }
    for (const [path, method] of [["/store/snowforce/checkout/cart_fixture", "GET"], ["/auth/customer/supabase", "POST"], ["/store/snowforce/checkout/cart_fixture/unknown", "POST"]] as const) {
      await request(path, z.object({}), { method });
      expect(timeout).toHaveBeenLastCalledWith(15_000);
    }
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
  it("reuses only a matching customer token returned by the trusted authentication endpoint", async () => {
    const payload = { actor_type: "customer", actor_id: "cus_fixture", app_metadata: { customer_id: "cus_fixture" } };
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.fixture-signature`;
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token }))).mockResolvedValueOnce(new Response(JSON.stringify({ customer: { id: "cus_fixture" } })));
    expect(await linkCommerceCustomer("verified-supabase-token", createCommerceClient(config, fetcher))).toEqual({ customerId: "cus_fixture", token });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://commerce.snow-force.com/auth/customer/supabase");
    expect(fetcher.mock.calls[1][0]).toBe("https://commerce.snow-force.com/store/customers/me");
  });
  it("does not relink or bypass a missing, unauthorized or mismatched customer profile", async () => {
    const token = `header.${Buffer.from(JSON.stringify({ actor_type: "customer", actor_id: "cus_fixture", app_metadata: { customer_id: "cus_fixture" } })).toString("base64url")}.fixture-signature`;
    for (const response of [new Response("{}", { status: 401 }), new Response("{}", { status: 404 }), new Response(JSON.stringify({ customer: { id: "cus_other" } }))]) {
      const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token }))).mockResolvedValueOnce(response);
      await expect(linkCommerceCustomer("verified-supabase-token", createCommerceClient(config, fetcher))).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });
  it("never treats a missing, mismatched or non-customer claim as an existing customer", async () => {
    for (const claims of [{ actor_type: "user", actor_id: "cus_fixture", app_metadata: { customer_id: "cus_fixture" } }, { actor_type: "customer", actor_id: "cus_other", app_metadata: { customer_id: "cus_fixture" } }, { actor_type: "customer", actor_id: "cus_fixture" }]) {
      const initial = `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.fixture-signature`;
      const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: initial }))).mockResolvedValueOnce(new Response(JSON.stringify({ customer: { id: "cus_fixture" } }))).mockResolvedValueOnce(new Response(JSON.stringify({ token: "fresh-customer-token-with-length" })));
      expect((await linkCommerceCustomer("verified-supabase-token", createCommerceClient(config, fetcher))).token).toBe("fresh-customer-token-with-length");
      expect(fetcher).toHaveBeenCalledTimes(3);
    }
  });
  it("distinguishes rejected changes and missing records without exposing backend error bodies", async () => {
    for (const status of [400, 409, 422]) await expect(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("private internal details", { status })))("/store/carts/cart_fixture", z.unknown())).rejects.toThrow(CommerceRejectedError);
    await expect(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("private internal details", { status: 404 })))("/store/carts/cart_fixture", z.unknown())).rejects.toThrow(CommerceNotFoundError);
  });
  it("recognizes the production sales guard during customer linking and logs only safe request context", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "fixture-auth-token-with-length" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: "not_allowed", message: "The shop is open for administration only. Sales and payment operations are disabled.", private: "internal-secret" }), { status: 400 }));
    await expect(linkCommerceCustomer("verified-supabase-access-token", createCommerceClient(config, fetcher))).rejects.toThrow(CommerceSalesDisabledError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledExactlyOnceWith("[shop.commerce] sales-disabled", { method: "POST", path: "/store/snowforce/customer", httpStatus: 400 });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/internal-secret|fixture-auth-token|verified-supabase/);
  });
  it("does not classify unrelated, malformed or differently typed rejections as a sales closure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const body of ["not JSON", JSON.stringify({ type: "not_allowed", message: "Insufficient stock" }), JSON.stringify({ type: "invalid_data", message: "The shop is open for administration only. Sales and payment operations are disabled." })]) {
      const request = createCommerceClient(config, vi.fn().mockResolvedValue(new Response(body, { status: 400 })));
      const error = await request("/store/carts/cart_fixture", z.unknown()).catch(reason => reason);
      expect(error).toBeInstanceOf(CommerceRejectedError);
      expect(error).not.toBeInstanceOf(CommerceSalesDisabledError);
      if (!(error instanceof CommerceRejectedError)) throw new Error("Expected a safe commerce rejection.");
      expect(error.message).toBe("The requested commerce change was rejected.");
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
