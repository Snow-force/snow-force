import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartResult } from "@/lib/shop/commerce-cart";
import { LanguageProvider } from "@/lib/language";

const actions = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn(), promotion: vi.fn() }));
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
  actions.get.mockResolvedValue({ status: "ready", cart: null });
  actions.change.mockResolvedValue({ status: "ready", cart: null });
});

describe("cart request loading", () => {
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
