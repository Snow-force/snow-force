import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { createCommerceClient, CommerceCheckoutLockedError, CommerceRejectedError, CommerceUnavailableError } from "./commerce-client";
import { createCartRepository } from "./commerce-cart";
import { fixtureCart } from "./shop.fixtures";
const config = { backendUrl: "https://commerce.example.test", publishableKey: "pk_fixture" };
const customer = { customerId: "cus_fixture", token: "trusted-token" };
const edit = "/store/snowforce/checkout/cart_fixture/edit";
const locked = () => new Response(JSON.stringify({ type: "conflict", message: "Check the current quote and payment before changing this cart." }), { status: 409 });
const editable = () => new Response(JSON.stringify({ status: "editable", quote_removed: true, review_required: true }));
const json = (value: unknown) => new Response(JSON.stringify(value));

describe("cart editing after a checkout lock", () => {
  it("uses the stable edit code even when the message changes, but rejects generic Medusa conflicts", async () => {
    const body = { type: "conflict", code: "checkout_locked", message: "Review checkout" };
    const request = createCommerceClient(config, vi.fn().mockImplementation(async () => Response.json(body, { status: 409 })));
    await expect(request(edit, z.unknown(), { method: "POST", body: {} })).rejects.toBeInstanceOf(CommerceCheckoutLockedError);
    await expect(request("/store/carts/cart_fixture/line-items", z.unknown(), { method: "POST", body: {} })).rejects.not.toBeInstanceOf(CommerceCheckoutLockedError);
    const generic = createCommerceClient(config, vi.fn().mockImplementation(async () => Response.json({ type: "conflict", code: "invalid_state_error", message: "The request conflicted with another request. You may retry the request with the provided Idempotency-Key." }, { status: 409 })));
    await expect(generic(edit, z.unknown(), { method: "POST", body: {} })).rejects.not.toBeInstanceOf(CommerceCheckoutLockedError);
  });
  it("classifies only the exact owned edit conflict as a checkout lock", async () => {
    const request = createCommerceClient(config, vi.fn().mockImplementation(locked));
    await expect(request(edit, z.unknown(), { method: "POST", body: {} })).rejects.toBeInstanceOf(CommerceCheckoutLockedError);
    for (const path of ["/store/carts/cart_fixture", "/store/snowforce/checkout/cart_fixture/quote"]) {
      await expect(request(path, z.unknown(), { method: "POST", body: {} })).rejects.not.toBeInstanceOf(CommerceCheckoutLockedError);
    }
    const unrelated = createCommerceClient(config, vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "conflict", message: "Stock changed" }), { status: 409 })));
    await expect(unrelated(edit, z.unknown(), { method: "POST", body: {} })).rejects.not.toBeInstanceOf(CommerceCheckoutLockedError);
  });
  it("keeps an active checkout locked without changing items or cancelling its payment", async () => {
    const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(json({ status: "recovered", unlocked: false }));
    await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(CommerceCheckoutLockedError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ kind: "recover" });
    expect(fetcher.mock.calls.every(([url]) => !url.includes("/line-items") && !url.includes("stripe.com"))).toBe(true);
  });
  it("rechecks edit authorization after verified cancellation, then removes the item", async () => {
    const empty = { ...fixtureCart, items: [] };
    const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(json({ status: "recovered", unlocked: true })).mockImplementationOnce(editable).mockResolvedValueOnce(json({ cart: empty }));
    await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).resolves.toMatchObject({ items: [] });
    expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([edit, "/store/snowforce/checkout/cart_fixture", edit, "/store/carts/cart_fixture/line-items/cali_fixture"]);
    expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({ quantity: 0 });
  });
  it("does not loop or mutate after a new payment or quote conflict wins the retry", async () => {
    const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(json({ status: "recovered", unlocked: true })).mockImplementationOnce(locked);
    await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(CommerceCheckoutLockedError);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([{ status: "complete", order: { id: "order_fixture", number: "1001", total: 53.24 } }, { status: "recovered", unlocked: false }])("does not edit a completed or non-canceled checkout: %j", async result => {
    const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(json(result));
    await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(CommerceCheckoutLockedError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed on a malformed recovery response or transport failure", async () => {
    for (const response of [{ status: "recovered", unlocked: true, clientSecret: "private" }, { status: "succeeded" }]) {
      const fetcher = vi.fn().mockImplementationOnce(locked).mockResolvedValueOnce(json(response));
      await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(CommerceUnavailableError);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
    const fetcher = vi.fn().mockImplementationOnce(locked).mockRejectedValueOnce(new Error("private transport details"));
    await expect(createCartRepository(createCommerceClient(config, fetcher), customer).remove("cart_fixture", "cali_fixture")).rejects.toThrow("The commerce service is unavailable.");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not call recovery for unrelated conflicts, unauthenticated requests or malformed item IDs", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 409 }));
    const repository = createCartRepository(createCommerceClient(config, fetcher), customer);
    await expect(repository.remove("cart_fixture", "cali_fixture")).rejects.toBeInstanceOf(CommerceRejectedError);
    expect(fetcher).toHaveBeenCalledOnce();
    fetcher.mockClear();
    await expect(repository.remove("cart_fixture", "foreign")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
