import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), request: vi.fn(), cookieGet: vi.fn(), cookieSet: vi.fn(), catalog: vi.fn(), region: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }) }));
vi.mock("./commerce-auth", () => ({ getCommerceCustomerSession: mocks.session }));
vi.mock("./storefront-repository", () => ({ loadStorefrontCatalog: mocks.catalog, getUsCommerceRegion: mocks.region }));
import { changeShopCartAction, getShopCartAction } from "./cart-actions";
import { CommerceAuthorizationError, CommerceRejectedError } from "./commerce-client";
import { CART_COOKIE_NAME, signCartCookie } from "./cart-cookie";
import { fixtureCart, fixtureProducts, fixtureUserId } from "./shop.fixtures";
const secret = "a".repeat(64);
describe("authenticated cart server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("SHOP_CART_COOKIE_SECRET", secret);
    mocks.session.mockResolvedValue({ customerId: "cus_fixture", token: "trusted-server-token", userId: fixtureUserId, request: mocks.request });
    mocks.request.mockResolvedValue({ cart: fixtureCart, parent: fixtureCart });
    mocks.catalog.mockResolvedValue({ products: fixtureProducts, regionId: "reg_us" });
    mocks.region.mockResolvedValue("reg_us");
  });
  it("rejects client cart IDs, amounts and malformed quantities without contacting commerce", async () => {
    for (const input of [{ kind: "add", variantId: "variant_pink", quantity: 1, price: 0.01 }, { kind: "update", cartId: "cart_other", itemId: "cali_fixture", quantity: 1 }, { kind: "add", variantId: "variant_pink", quantity: 1.1 }]) expect(await changeShopCartAction(input)).toEqual({ status: "invalid" });
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("never creates carts for unverified or signed-out members", async () => {
    mocks.session.mockRejectedValue(new CommerceAuthorizationError());
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 1 })).toEqual({ status: "signed-out" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("creates an owner-bound HTTP-only cookie and adds the current published variant", async () => {
    const result = await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 2 });
    expect(result.status).toBe("ready");
    expect(mocks.cookieSet).toHaveBeenCalledWith(CART_COOKIE_NAME, expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
    expect(mocks.request.mock.calls[2][2]).toMatchObject({ method: "POST", token: "trusted-server-token", body: { variant_id: "variant_pink", quantity: 2 } });
  });
  it("refuses missing US setup, unlisted variants and quantity beyond latest stock", async () => {
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_blue", quantity: 1 })).toEqual({ status: "rejected" });
    expect(await changeShopCartAction({ kind: "add", variantId: "variant_pink", quantity: 3 })).toEqual({ status: "rejected" });
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.catalog.mockResolvedValue({ products: [], regionId: null });
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
