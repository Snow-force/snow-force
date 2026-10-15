import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const actions = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn(), promotion: vi.fn() }));
vi.mock("@/lib/shop/cart-actions", () => ({ getShopCartAction: actions.get, changeShopCartAction: actions.change, applyShopPromotionAction: actions.promotion }));
vi.mock("next/navigation", () => ({ usePathname: () => "/shop/cart" }));
import { LanguageProvider } from "@/lib/language";
import { cartSnapshot, type CartResult } from "@/lib/shop/commerce-cart";
import { fixtureCart } from "@/lib/shop/shop.fixtures";
import { ShopProvider, CartContents } from "./shop-provider";
const cart = cartSnapshot(fixtureCart);
function view(lang: "en" | "zh" = "en") { return render(<LanguageProvider initialLang={lang}><ShopProvider><CartContents presentation="page" /></ShopProvider></LanguageProvider>); }
beforeEach(() => { vi.resetAllMocks(); actions.get.mockResolvedValue({ status: "ready", cart }); actions.change.mockResolvedValue({ status: "ready", cart }); actions.promotion.mockResolvedValue({ status: "ready", cart }); });

describe("cart pending feedback and checkout-lock recovery UX", () => {
  it("does not flash empty-cart content during the first read", async () => {
    let finish!: (result: CartResult) => void;
    actions.get.mockReturnValue(new Promise<CartResult>(resolve => { finish = resolve; }));
    view();
    expect(screen.getByText("Loading your cart…")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Your next mountain kit starts here.")).not.toBeInTheDocument();
    await act(async () => { finish({ status: "ready", cart: null }); });
    expect(screen.getByText("Your next mountain kit starts here.")).toBeVisible();
    expect(screen.queryByText("Loading your cart…")).not.toBeInTheDocument();
  });
  it("keeps the item until server deletion succeeds and blocks duplicate clicks while animating", async () => {
    let finish!: (result: CartResult) => void;
    actions.change.mockReturnValue(new Promise<CartResult>(resolve => { finish = resolve; }));
    view();
    const button = await screen.findByRole("button", { name: `Remove ${cart.items[0].name}` });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(button);
    expect(actions.change).toHaveBeenCalledTimes(1);
    expect(actions.change).toHaveBeenCalledWith({ kind: "remove", itemId: cart.items[0].id });
    expect(button.querySelector("[data-loading-spinner]")).not.toBeNull();
    expect(button).toBeDisabled();
    expect(screen.getByText("Removing item…")).toBeVisible();
    expect(screen.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => { finish({ status: "ready", cart: { ...cart, items: [], subtotal: 0, total: 0 } }); });
    expect(screen.getByText("Your next mountain kit starts here.")).toBeVisible();
    expect(screen.queryByRole("button", { name: `Remove ${cart.items[0].name}` })).not.toBeInTheDocument();
    expect(screen.queryByText("Removing item…")).not.toBeInTheDocument();
  });
  it.each(["en", "zh"] as const)("retains a locked item and explains checkout rather than falsely blaming stock in %s", async lang => {
    actions.change.mockResolvedValue({ status: "checkout-locked" });
    view(lang);
    const name = lang === "zh" ? `移除${cart.items[0].name}` : `Remove ${cart.items[0].name}`;
    const button = await screen.findByRole("button", { name });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(lang === "zh" ? "结账锁定" : "checkout is active");
    expect(alert).not.toHaveTextContent("Stock or price may have changed");
    expect(screen.getByRole("link", { name: lang === "zh" ? "返回结账检查付款状态" : "Return to checkout and check payment status" })).toHaveAttribute("href", "/shop/checkout");
    expect(button).toBeEnabled();
    expect(button.querySelector("[data-loading-spinner]")).toBeNull();
    expect(actions.change).toHaveBeenCalledTimes(1);
  });
  it("stops spinning after a transport failure and preserves server-confirmed contents", async () => {
    actions.change.mockRejectedValue(new Error("Network down")); view();
    const button = await screen.findByRole("button", { name: `Remove ${cart.items[0].name}` });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(button).toBeEnabled(); expect(button.querySelector("[data-loading-spinner]")).toBeNull();
  });
  it("animates promotion application only during its request", async () => {
    let finish!: (result: CartResult) => void;
    actions.promotion.mockReturnValue(new Promise<CartResult>(resolve => { finish = resolve; })); view();
    const input = await screen.findByRole("textbox", { name: "Promotion code" });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "FIXTURE" } }); fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("button", { name: "Apply" }).querySelector("[data-loading-spinner]")).not.toBeNull();
    expect(screen.getByText("Updating promotion…")).toBeVisible();
    await act(async () => { finish({ status: "ready", cart }); });
    expect(screen.queryByText("Updating promotion…")).not.toBeInTheDocument();
  });
});
