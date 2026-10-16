import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), region: vi.fn() }));
vi.mock("./cart-context", () => ({ getCartContext: mocks.context }));
vi.mock("./storefront-repository", () => ({ getUsCommerceRegion: mocks.region, loadPurchasableVariant: vi.fn() }));
import { cancelUnpaidCartPaymentAction, cancelUnpaidPaymentAndRemoveAction, changeShopCartAction, previewShopPaymentCancellationAction } from "./cart-actions";
import { createCartRepository } from "./commerce-cart";
import { createCommerceClient } from "./commerce-client";
import { fixtureCart } from "./shop.fixtures";
const token = "a".repeat(64);
function setup(cancelResult: unknown = { status: "editable" }, options: { locked?: boolean; foreign?: boolean; missing?: boolean; editAfterCancelBlocked?: boolean } = {}) {
  let canceled = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/cancel")) {
      if (init?.method === "POST") { canceled = true; return Response.json(cancelResult); }
      return Response.json({ status: "confirmation-required", token, amountCents: 7995, currency: "usd" });
    }
    if (url.endsWith("/edit")) return options.locked || canceled && options.editAfterCancelBlocked ? Response.json({ type: "conflict", message: "Check the current quote and payment before changing this cart." }, { status: 409 }) : Response.json({ status: "editable", quote_removed: true, review_required: true });
    if (url.endsWith("/checkout/cart_fixture")) return Response.json({ status: "recovered", unlocked: false });
    const removing = url.includes("/line-items/");
    return Response.json({ cart: { ...fixtureCart, customer: options.foreign ? { id: "cus_other" } : fixtureCart.customer, items: removing || options.missing ? [] : fixtureCart.items } });
  });
  const request = createCommerceClient({ backendUrl: "https://commerce.example.test", publishableKey: "pk_fixture" }, (input, init) => fetcher(String(input), init));
  mocks.context.mockResolvedValue({ repository: createCartRepository(request, { customerId: "cus_fixture", token: "trusted-token" }), customer: { customerId: "cus_fixture", userId: "user_fixture", request }, cartId: "cart_fixture", secret: "unused" });
  return fetcher;
}
beforeEach(() => { vi.resetAllMocks(); mocks.region.mockResolvedValue("reg_us"); });
describe("owned unpaid checkout cancellation", () => {
  it("allows preview and cancellation to edit without deleting any line", async () => {
    const fetcher = setup();
    expect(await previewShopPaymentCancellationAction()).toMatchObject({ status: "checkout-locked", cancellation: { status: "confirmation-required" } });
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(await cancelUnpaidCartPaymentAction({ token, confirmed: true })).toMatchObject({ status: "ready" });
    expect(fetcher.mock.calls.some(([url]) => url.includes("/line-items/"))).toBe(false);
    expect(fetcher.mock.calls.filter(([url, init]) => url.endsWith("/cancel") && init?.method === "POST")).toHaveLength(1);
  });
  it("rejects arbitrary payment identifiers for checkout editing and preserves uncertain state", async () => {
    expect(await cancelUnpaidCartPaymentAction({ token, confirmed: true, intentId: "pi_other" })).toEqual({ status: "invalid" });
    const fetcher = setup({ status: "pending", code: "verification-unavailable" });
    expect(await cancelUnpaidCartPaymentAction({ token, confirmed: true })).toMatchObject({ status: "checkout-locked", cancellation: { status: "pending" } });
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it("requires an exact explicit confirmation and never accepts browser payment or cart IDs", async () => {
    for (const input of [{ itemId: "cali_fixture", token, confirmed: false }, { itemId: "cali_fixture", token, confirmed: true, paymentIntent: "pi_other" }, { itemId: "cali_fixture", token, confirmed: true, cartId: "cart_other" }]) expect(await cancelUnpaidPaymentAndRemoveAction(input)).toEqual({ status: "invalid" });
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("offers confirmation only after a locked removal, without canceling in the preview", async () => {
    const fetcher = setup(undefined, { locked: true });
    expect(await changeShopCartAction({ kind: "remove", itemId: "cali_fixture" })).toMatchObject({ status: "checkout-locked", itemId: "cali_fixture", cancellation: { status: "confirmation-required", token } });
    expect(fetcher.mock.calls.filter(([url, init]) => url.endsWith("/cancel") && init?.method === "POST")).toHaveLength(0);
    expect(fetcher.mock.calls.some(([url]) => url.includes("/line-items/"))).toBe(false);
  });
  it("verifies cancellation, repeats the native edit fence and then removes the exact line", async () => {
    const fetcher = setup();
    expect(await cancelUnpaidPaymentAndRemoveAction({ itemId: "cali_fixture", token, confirmed: true })).toMatchObject({ status: "ready", cart: { items: [] } });
    expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(["/store/carts/cart_fixture", "/store/snowforce/checkout/cart_fixture/cancel", "/store/snowforce/checkout/cart_fixture/edit", "/store/carts/cart_fixture/line-items/cali_fixture"]);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ token, confirmed: true });
    expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body))).toEqual({ quantity: 0 });
  });
  it.each(["blocked", "pending"] as const)("preserves items when cancellation is %s", async status => {
    const fetcher = setup({ status, code: status === "blocked" ? "payment-authorized" : "recovery-pending" });
    expect(await cancelUnpaidPaymentAndRemoveAction({ itemId: "cali_fixture", token, confirmed: true })).toMatchObject({ status: "checkout-locked", cancellation: { status } });
    expect(fetcher.mock.calls.some(([url]) => url.includes("/line-items/") || url.endsWith("/edit"))).toBe(false);
  });
  it("treats an already removed item as a read and rejects foreign ownership", async () => {
    const fetcher = setup(undefined, { missing: true });
    expect((await cancelUnpaidPaymentAndRemoveAction({ itemId: "cali_fixture", token, confirmed: true })).status).toBe("ready"); expect(fetcher).toHaveBeenCalledTimes(1);
    const foreign = setup(undefined, { foreign: true });
    expect((await cancelUnpaidPaymentAndRemoveAction({ itemId: "cali_fixture", token, confirmed: true })).status).toBe("signed-out"); expect(foreign).toHaveBeenCalledTimes(1);
  });
  it("blocks a replacement payment that appears after the old cancellation", async () => {
    const fetcher = setup(undefined, { editAfterCancelBlocked: true });
    expect((await cancelUnpaidPaymentAndRemoveAction({ itemId: "cali_fixture", token, confirmed: true })).status).toBe("checkout-locked");
    expect(fetcher.mock.calls.some(([url]) => url.includes("/line-items/"))).toBe(false);
  });
});
