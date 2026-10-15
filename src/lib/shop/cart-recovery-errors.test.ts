import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCommerceClient, CommerceAuthorizationError, CommerceCheckoutLockedError, CommerceSalesDisabledError, CommerceUnavailableError } from "./commerce-client";
import { createCartRepository } from "./commerce-cart";
const config = { backendUrl: "https://commerce.example.test", publishableKey: "pk_fixture" };
const customer = { customerId: "cus_fixture", token: "trusted-token" };
const locked = () => new Response(JSON.stringify({ type: "conflict", message: "Check the current quote and payment before changing this cart." }), { status: 409 });
describe("preserving recovery failures without changing payments", () => {
  it("preserves the checkout explanation when authorized or paid evidence blocks recovery", async () => {
    const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(new Response(JSON.stringify({ type: "conflict", message: "The payment needs review. Resume the existing checkout before changing this cart." }), { status: 409 }));
    await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(CommerceCheckoutLockedError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.some(([url]) => url.includes("/line-items"))).toBe(false);
  });
  it.each([401, 403, 500])("does not hide recovery authorization or transport errors: %i", async status => {
    const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(new Response("{}", { status }));
    await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(status === 500 ? CommerceUnavailableError : CommerceAuthorizationError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("preserves the sales-disabled gate even during recovery", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(new Response(JSON.stringify({ type: "not_allowed", message: "The shop is open for administration only. Sales and payment operations are disabled." }), { status: 400 }));
      await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(CommerceSalesDisabledError);
      expect(fetcher).toHaveBeenCalledTimes(2); expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });
});
