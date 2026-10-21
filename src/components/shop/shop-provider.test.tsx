import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartResult } from "@/lib/shop/commerce-cart";
import { LanguageProvider } from "@/lib/language";

const actions = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn(), promotion: vi.fn() }));
const timings = vi.hoisted(() => ({ begin: vi.fn() }));
vi.mock("@/lib/shop/performance-browser", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/shop/performance-browser")>(), beginShopTiming: timings.begin }));
const route = vi.hoisted(() => ({ pathname: "/shop" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/lib/shop/cart-actions", () => ({ getShopCartAction: actions.get, changeShopCartAction: actions.change, applyShopPromotionAction: actions.promotion }));

import { CartContents, ShopProvider, useShopCart } from "./shop-provider";

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Request was not initialized."); };
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function CartProbe() {
  const cart = useShopCart();
  return <section aria-label="Cart probe" aria-busy={cart.busy}>
    <p role="status">{cart.state.status}</p>
    {cart.error && <p role="alert">{cart.error}</p>}
    <button disabled={cart.busy} onClick={() => { void cart.update("cali_fixture", 2); }}>Update fixture item</button>
  </section>;
}

const view = () => render(<LanguageProvider initialLang="en"><ShopProvider><CartProbe /></ShopProvider></LanguageProvider>);

beforeEach(() => {
  vi.resetAllMocks();
  route.pathname = "/shop";
  actions.get.mockResolvedValue({ status: "ready", cart: null });
  actions.change.mockResolvedValue({ status: "ready", cart: null });
});

describe("cart request loading", () => {
  it("shows an existing quantity above the edit limit faithfully and allows one valid reduction", async () => {
    const cart = { items: [{ id: "cali_fixture", name: "Test hat", variant: "Ivory", slug: null, image: "/shop/product-placeholder.svg", quantity: 120, unitPrice: 39, total: 4680 }], subtotal: 4680, total: 4680, taxTotal: 0, shippingTotal: 0, discountTotal: 0 };
    actions.get.mockResolvedValue({ status: "ready", cart });
    actions.change.mockResolvedValue({ status: "ready", cart: { ...cart, items: [{ ...cart.items[0], quantity: 99, total: 3861 }], subtotal: 3861, total: 3861 } });
    render(<LanguageProvider initialLang="en"><ShopProvider><CartContents presentation="page" /></ShopProvider></LanguageProvider>);
    const quantity = await screen.findByRole("combobox", { name: "Quantity for Test hat" });
    expect(quantity).toHaveValue("120"); expect(screen.getByRole("option", { name: "120" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase quantity for Test hat" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity for Test hat" })).toBeDisabled();
    expect(actions.change).not.toHaveBeenCalled();
    await act(async () => { fireEvent.change(quantity, { target: { value: "99" } }); });
    expect(actions.change).toHaveBeenCalledExactlyOnceWith({ kind: "update", itemId: "cali_fixture", quantity: 99 });
    expect(quantity).toHaveValue("99"); expect(screen.queryByRole("option", { name: "120" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease quantity for Test hat" })).toBeEnabled();
  });
  it("can decrement an existing quantity of 100 to the permitted 99", async () => {
    const cart = { items: [{ id: "cali_fixture", name: "Test hat", variant: "Ivory", slug: null, image: "/shop/product-placeholder.svg", quantity: 100, unitPrice: 39, total: 3900 }], subtotal: 3900, total: 3900, taxTotal: 0, shippingTotal: 0, discountTotal: 0 };
    actions.get.mockResolvedValue({ status: "ready", cart });
    render(<LanguageProvider initialLang="en"><ShopProvider><CartContents presentation="page" /></ShopProvider></LanguageProvider>);
    const decrease = await screen.findByRole("button", { name: "Decrease quantity for Test hat" });
    await act(async () => { fireEvent.click(decrease); });
    expect(actions.change).toHaveBeenCalledExactlyOnceWith({ kind: "update", itemId: "cali_fixture", quantity: 99 });
  });
  it("sets a target quantity in one request and keeps confirmed prices until the server responds", async () => {
    const cart = { items: [{ id: "cali_fixture", name: "Test hat", variant: "Ivory", slug: null, image: "/shop/product-placeholder.svg", quantity: 1, unitPrice: 39, total: 39 }], subtotal: 39, total: 39, taxTotal: 0, shippingTotal: 0, discountTotal: 0 };
    actions.get.mockResolvedValue({ status: "ready", cart });
    const pending = deferred<CartResult>(); actions.change.mockReturnValue(pending.promise);
    render(<LanguageProvider initialLang="en"><ShopProvider><CartContents presentation="page" /></ShopProvider></LanguageProvider>);
    const quantity = await screen.findByRole("combobox", { name: "Quantity for Test hat" });
    fireEvent.change(quantity, { target: { value: "5" } });
    fireEvent.change(quantity, { target: { value: "6" } });
    expect(actions.change).toHaveBeenCalledExactlyOnceWith({ kind: "update", itemId: "cali_fixture", quantity: 5 });
    expect(quantity).toBeDisabled(); expect(quantity).toHaveValue("1");
    expect(screen.queryByText("$195.00")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => { pending.resolve({ status: "ready", cart: { ...cart, items: [{ ...cart.items[0], quantity: 5, total: 195 }], subtotal: 195, total: 195 } }); });
    expect(quantity).toBeEnabled(); expect(quantity).toHaveValue("5");
    expect(screen.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("aria-disabled", "false");
  });
  it("correlates update and remove without duplicate requests, preserving the last confirmed cart on rejection", async () => {
    const cart = { items: [{ id: "cali_fixture", name: "Test hat", variant: "Ivory", slug: null, image: "/shop/product-placeholder.svg", quantity: 1, unitPrice: 39, total: 39 }], subtotal: 39, total: 39, taxTotal: 0, shippingTotal: 0, discountTotal: 0, promotionCodes: ["SAVE"] };
    actions.get.mockResolvedValue({ status: "ready", cart });
    const report = vi.fn(); timings.begin.mockReturnValue({ operationId: "11223344-1234-4123-8123-112233445566", report });
    const pending = deferred<CartResult>(); actions.change.mockReturnValueOnce(pending.promise).mockResolvedValue({ status: "rejected" });
    render(<LanguageProvider initialLang="zh"><ShopProvider timingSampleRate={1} timingRevision="fixture"><CartContents presentation="page" /></ShopProvider></LanguageProvider>);
    const quantity = await screen.findByRole("combobox", { name: "Test hat数量" });
    fireEvent.change(quantity, { target: { value: "5" } });
    fireEvent.change(quantity, { target: { value: "7" } });
    expect(timings.begin).toHaveBeenCalledExactlyOnceWith(1, "cart.update", "coupon", "fixture");
    expect(actions.change).toHaveBeenCalledExactlyOnceWith({ kind: "update", itemId: "cali_fixture", quantity: 5 }, { operationId: "11223344-1234-4123-8123-112233445566" });
    await act(async () => { pending.resolve({ status: "rejected" }); });
    expect(quantity).toHaveValue("1"); expect(quantity).toBeEnabled();
    expect(report).toHaveBeenCalledWith("action.return", "rejected");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "移除Test hat" })); });
    expect(timings.begin).toHaveBeenLastCalledWith(1, "cart.remove", "coupon", "fixture");
    expect(actions.change).toHaveBeenLastCalledWith({ kind: "remove", itemId: "cali_fixture" }, { operationId: "11223344-1234-4123-8123-112233445566" });
    expect(screen.getByText("Test hat")).toBeVisible();
  });
  it("keeps merchandise prices consistent when returning from a cart with quoted tax", async () => {
    actions.get.mockResolvedValue({ status: "ready", cart: { items: [{ id: "cali_fixture", name: "Test hat", variant: "Ivory", slug: null, image: "/shop/product-placeholder.svg", quantity: 1, unitPrice: 39, total: 42.02 }], subtotal: 39, total: 42.02, taxTotal: 3.02, shippingTotal: 0, discountTotal: 0 } });
    render(<LanguageProvider initialLang="en"><ShopProvider><CartContents presentation="page" /></ShopProvider></LanguageProvider>);
    await screen.findByText("Test hat");
    expect(screen.getAllByText("$39.00")).toHaveLength(3);
    expect(screen.queryByText("$42.02")).not.toBeInTheDocument();
  });
  it("lets checkout supply its owned cart without a duplicate queued Server Action", async () => {
    route.pathname = "/shop/checkout";
    view();
    expect(screen.getByRole("region", { name: "Cart probe" })).toHaveAttribute("aria-busy", "false");
    expect(actions.get).not.toHaveBeenCalled();
  });
  it.each([
    ["en", "Shopping is temporarily paused. You can browse gear; please check back later to purchase."],
    ["zh", "商城暂未开放购买。你可以继续浏览装备，请稍后再来选购。"],
  ] as const)("explains sales closure in %s without blaming inventory or price", async (lang, message) => {
    actions.get.mockResolvedValue({ status: "sales-disabled" });
    render(<LanguageProvider initialLang={lang}><ShopProvider><CartContents /></ShopProvider></LanguageProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(/Stock or price may have changed|库存或价格可能已变化/)).not.toBeInTheDocument();
  });
  it("applies a code, shows native savings and removes it through the shared cart request lock", async () => {
    const cart = { items: [{ id: "cali_fixture", name: "Test jacket", variant: "M", slug: null, image: "/shop/product-placeholder.svg", quantity: 1, unitPrice: 100, total: 100 }], subtotal: 100, total: 100, taxTotal: 0, shippingTotal: 0, discountTotal: 0, promotionCodes: [] };
    actions.get.mockResolvedValue({ status: "ready", cart });
    const pending = deferred<CartResult>(); actions.promotion.mockReturnValueOnce(pending.promise).mockResolvedValue({ status: "ready", cart });
    render(<LanguageProvider initialLang="en"><ShopProvider><CartContents /></ShopProvider></LanguageProvider>);
    const input = await screen.findByLabelText("Promotion code"); fireEvent.change(input, { target: { value: "SAVE10" } });
    expect(screen.queryByRole("link", { name: "View my welcome code" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(actions.promotion).toHaveBeenCalledWith({ code: "SAVE10", remove: false });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    await act(async () => { pending.resolve({ status: "ready", cart: { ...cart, total: 90, discountTotal: 10, promotionCodes: ["SAVE10"] } }); });
    expect(await screen.findByText("Code applied. Review your updated savings below.")).toBeInTheDocument();
    expect(screen.getByText("−$10.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove code" }));
    await screen.findByText("Test jacket");
    expect(actions.promotion).toHaveBeenLastCalledWith({ code: "SAVE10", remove: true });
  });
  it("shows a failed eligibility message without replacing the current cart with invented savings", async () => {
    const cart = { items: [{ id: "cali_fixture", name: "Test jacket", variant: "M", slug: null, image: "/shop/product-placeholder.svg", quantity: 1, unitPrice: 100, total: 100 }], subtotal: 100, total: 100, taxTotal: 0, shippingTotal: 0, discountTotal: 0 };
    actions.get.mockResolvedValue({ status: "ready", cart }); actions.promotion.mockResolvedValue({ status: "rejected" });
    render(<LanguageProvider initialLang="zh"><ShopProvider><CartContents /></ShopProvider></LanguageProvider>);
    fireEvent.change(await screen.findByLabelText("折扣码"), { target: { value: "USED" } }); fireEvent.click(screen.getByRole("button", { name: "使用" }));
    expect(await screen.findByText("此码无法使用，请核对有效期、最低消费及账户资格。")).toBeInTheDocument();
    expect(screen.queryByText("优惠", { selector: "dt" })).not.toBeInTheDocument();
  });
  it("locks mutations during initial loading and preserves busy state for subsequent requests", async () => {
    const initial = deferred<CartResult>();
    const update = deferred<CartResult>();
    actions.get.mockReturnValue(initial.promise);
    actions.change.mockReturnValue(update.promise);
    view();

    expect(screen.getByRole("region", { name: "Cart probe" })).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByRole("button", { name: "Update fixture item" }));
    expect(actions.change).not.toHaveBeenCalled();
    await act(async () => { initial.resolve({ status: "ready", cart: null }); });

    expect(screen.getByRole("button", { name: "Update fixture item" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Update fixture item" }));
    expect(screen.getByRole("region", { name: "Cart probe" })).toHaveAttribute("aria-busy", "true");
    expect(actions.change).toHaveBeenCalledWith({ kind: "update", itemId: "cali_fixture", quantity: 2 });
    await act(async () => { update.resolve({ status: "rejected" }); });

    expect(screen.getByRole("region", { name: "Cart probe" })).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("status")).toHaveTextContent("ready");
    expect(screen.getByRole("alert")).toHaveTextContent("rejected");
  });

  it("ignores an obsolete initial response after its provider unmounts", async () => {
    const obsolete = deferred<CartResult>();
    actions.get.mockReturnValueOnce(obsolete.promise).mockResolvedValueOnce({ status: "signed-out" });
    const first = view();
    first.unmount();
    view();
    await screen.findByText("signed-out");

    await act(async () => { obsolete.resolve({ status: "ready", cart: null }); });

    expect(screen.getByRole("status")).toHaveTextContent("signed-out");
    expect(screen.getByRole("region", { name: "Cart probe" })).toHaveAttribute("aria-busy", "false");
  });

  it("finishes loading and exposes initial network failures", async () => {
    actions.get.mockRejectedValue(new Error("Private connection details"));
    view();

    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.getByRole("region", { name: "Cart probe" })).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("Private connection details")).not.toBeInTheDocument();
  });
});
