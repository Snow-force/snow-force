import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), request: vi.fn(), cookieGet: vi.fn(), cookieSet: vi.fn(), catalog: vi.fn(), region: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }) }));
vi.mock("./commerce-auth", () => ({ getCommerceCustomerSession: mocks.session }));
vi.mock("./storefront-repository", () => ({ loadPurchasableVariant: mocks.catalog, getUsCommerceRegion: mocks.region }));
import { applyShopPromotionAction, changeShopCartAction, getShopCartAction } from "./cart-actions";
import { CommerceAuthorizationError, CommerceRejectedError, CommerceSalesDisabledError } from "./commerce-client";
import { CART_COOKIE_NAME, signCartCookie } from "./cart-cookie";
import { fixtureCart, fixtureProducts, fixtureUserId } from "./shop.fixtures";
const secret = "a".repeat(64);
describe("authenticated cart server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("SHOP_CART_COOKIE_SECRET", secret);
    mocks.session.mockResolvedValue({ customerId: "cus_fixture", token: "trusted-server-token", userId: fixtureUserId, request: mocks.request });
    mocks.request.mockResolvedValue({ cart: fixtureCart, parent: fixtureCart });
    mocks.catalog.mockImplementation(async (_request, variantId) => ({ variant: fixtureProducts.flatMap(product => product.variants).find(variant => variant.id === variantId) ?? null, regionId: "reg_us" }));
    mocks.region.mockResolvedValue("reg_us");
  });
  it("rejects client cart IDs, amounts and malformed quantities without contacting commerce", async () => {
    for (const input of [{ kind: "add", variantId: "variant_pink", quantity: 1, price: 0.01 }, { kind: "update", cartId: "cart_other", itemId: "cali_fixture", quantity: 1 }, { kind: "add", variantId: "variant_pink", quantity: 1.1 }]) expect(await changeShopCartAction(input)).toEqual({ status: "invalid" });
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("applies and removes codes through native evaluation after clearing old quotes", async () => {
    mocks.cookieGet.mockReturnValue({ value: signCartCookie("cart_fixture", fixtureUserId, secret) });
    const code = "WELCOME-FIXTURE";
    mocks.request.mockImplementation(async (path: string) => ({ cart: { ...fixtureCart, promotions: path.includes("/promotions") ? [{ code }] : [] } }));
    expect((await applyShopPromotionAction({ code })).status).toBe("ready");
    expect(mocks.request.mock.calls[1][0]).toContain("/checkout/cart_fixture/edit");
    expect(mocks.request.mock.calls[2][2]).toMatchObject({ method: "POST", body: { promo_codes: [code] }, token: "trusted-server-token" });
    expect((await applyShopPromotionAction({ code, remove: true })).status).toBe("ready");
    expect(mocks.request.mock.calls[5][2]).toMatchObject({ method: "DELETE", body: { promo_codes: [code] } });
    mocks.request.mockResolvedValue({ cart: fixtureCart });
    expect(await applyShopPromotionAction({ code })).toEqual({ status: "rejected" });
  });
  it("rejects client prices, cart IDs, unsafe codes, missing carts and foreign ownership", async () => {
    for (const input of [{ code: "SAVE10", amount: 1 }, { code: "SAVE10", cartId: "cart_other" }, { code: "../SAVE" }, { code: "" }]) expect(await applyShopPromotionAction(input)).toEqual({ status: "invalid" });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(await applyShopPromotionAction({ code: "SAVE10" })).toEqual({ status: "invalid" });
    mocks.cookieGet.mockReturnValue({ value: signCartCookie("cart_fixture", fixtureUserId, secret) }); mocks.request.mockResolvedValue({ cart: { ...fixtureCart, customer: { id: "cus_other" } } });
    expect(await applyShopPromotionAction({ code: "SAVE10" })).toEqual({ status: "signed-out" });
    expect(mocks.request).toHaveBeenCalledOnce();
  });
  it("never creates carts for unverified or signed-out members", async () => {
    mocks.session.mockRejectedValue(new CommerceAuthorizationError());
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 1 })).toEqual({ status: "signed-out" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("reports sales closure before customer linking can create a cart or change stock", async () => {
    mocks.session.mockRejectedValue(new CommerceSalesDisabledError());
    expect(await getShopCartAction()).toEqual({ status: "sales-disabled" });
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 1 })).toEqual({ status: "sales-disabled" });
    expect(await applyShopPromotionAction({ code: "SAVE10" })).toEqual({ status: "sales-disabled" });
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
  it("starts independent existing-cart and variant reads together, then still checks the native edit fence", async () => {
    mocks.cookieGet.mockReturnValue({ value: signCartCookie("cart_fixture", fixtureUserId, secret) });
    let finishRead: (value: { cart: typeof fixtureCart }) => void = () => { throw new Error("Missing read"); };
    const blockedRead = new Promise<{ cart: typeof fixtureCart }>(resolve => { finishRead = resolve; });
    mocks.request.mockImplementation((path: string) => path.startsWith("/store/carts/cart_fixture?") ? blockedRead : Promise.resolve({ cart: fixtureCart }));
    const operation = changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 1 });
    await vi.waitFor(() => expect(mocks.request.mock.calls.some(([path]) => String(path).startsWith("/store/carts/cart_fixture?"))).toBe(true));
    // Variant verification has already started before the cart response arrives.
    expect(mocks.catalog).toHaveBeenCalledExactlyOnceWith(mocks.request, "variant_pink");
    expect(mocks.request.mock.calls.some(([path]) => String(path).includes("/line-items"))).toBe(false);
    finishRead({ cart: fixtureCart });
    expect((await operation).status).toBe("ready");
    expect(mocks.request.mock.calls.some(([path]) => String(path).includes("/checkout/cart_fixture/edit"))).toBe(true);
    expect(mocks.request.mock.calls.some(([path]) => String(path).includes("/line-items"))).toBe(true);
  });
  it("creates an owner-bound HTTP-only cookie and adds the current published variant", async () => {
    const result = await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 2 });
    expect(result.status).toBe("ready");
    expect(mocks.catalog).toHaveBeenCalledExactlyOnceWith(mocks.request, "variant_pink");
    expect(mocks.cookieSet).toHaveBeenCalledWith(CART_COOKIE_NAME, expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
    expect(mocks.request.mock.calls[2][2]).toMatchObject({ method: "POST", token: "trusted-server-token", body: { variant_id: "variant_pink", quantity: 2 } });
  });
  it("never mutates or creates a cart if either parallel preflight fails", async () => {
    mocks.cookieGet.mockReturnValue({ value: signCartCookie("cart_fixture", fixtureUserId, secret) });
    mocks.request.mockResolvedValue({ cart: { ...fixtureCart, customer: { id: "cus_other" } } });
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 1 })).toEqual({ status: "signed-out" });
    expect(mocks.request.mock.calls.every(([, , options]) => !options?.method || options.method === "GET")).toBe(true);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    mocks.request.mockClear().mockResolvedValue({ cart: fixtureCart });
    mocks.catalog.mockRejectedValue(new Error("Catalog unavailable"));
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 1 })).toEqual({ status: "unavailable" });
    expect(mocks.request.mock.calls.every(([, , options]) => !options?.method || options.method === "GET")).toBe(true);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
  it("refuses missing US setup, unlisted variants and quantity beyond latest stock", async () => {
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_blue", quantity: 1 })).toEqual({ status: "rejected" });
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 3 })).toEqual({ status: "rejected" });
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.catalog.mockResolvedValue({ variant: null, regionId: null });
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 1 })).toEqual({ status: "not-configured" });
  });
  it("checks backend ownership and line membership before updating or deleting", async () => {
    mocks.cookieGet.mockReturnValue({ value: signCartCookie("cart_fixture", fixtureUserId, secret) });
    expect((await changeShopCartAction({ kind: "update", itemId: "cali_fixture", quantity: 2 })).status).toBe("ready");
    expect((await changeShopCartAction({ kind: "remove", itemId: "cali_fixture" })).status).toBe("ready");
    expect(await changeShopCartAction({ kind: "remove", itemId: "cali_foreign" })).toEqual({ status: "invalid" });
    mocks.request.mockResolvedValue({ cart: { ...fixtureCart, customer: { id: "cus_other" } } });
    expect(await changeShopCartAction({ kind: "remove", itemId: "cali_fixture" })).toEqual({ status: "signed-out" });
  });
  it("returns only safe snapshots and handles stale cookies, changed region or backend rejection", async () => {
    expect(await getShopCartAction()).toEqual({ status: "ready", cart: null });
    mocks.cookieGet.mockReturnValue({ value: signCartCookie("cart_fixture", fixtureUserId, secret) });
    expect((await getShopCartAction()).status).toBe("ready");
    mocks.region.mockResolvedValue("reg_changed");
    expect(await changeShopCartAction({ kind: "update", itemId: "cali_fixture", quantity: 2 })).toEqual({ status: "not-configured" });
    mocks.request.mockRejectedValue(new CommerceRejectedError());
    expect(await getShopCartAction()).toEqual({ status: "rejected" });
    vi.stubEnv("SHOP_CART_COOKIE_SECRET", "");
    expect(await getShopCartAction()).toEqual({ status: "unavailable" });
  });
});
