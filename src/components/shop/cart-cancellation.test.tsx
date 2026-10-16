import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const actions = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn(), promotion: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/shop/cart-actions", () => ({ getShopCartAction: actions.get, changeShopCartAction: actions.change, applyShopPromotionAction: actions.promotion, cancelUnpaidPaymentAndRemoveAction: actions.cancel }));
vi.mock("next/navigation", () => ({ usePathname: () => "/shop/cart" }));
import { LanguageProvider } from "@/lib/language";
import { cartSnapshot, type CartResult } from "@/lib/shop/commerce-cart";
import { fixtureCart } from "@/lib/shop/shop.fixtures";
import { ShopProvider, CartContents } from "./shop-provider";
const cart = cartSnapshot(fixtureCart), token = "a".repeat(64);
const locked = { status: "checkout-locked", itemId: "cali_fixture", cancellation: { status: "confirmation-required", token, amountCents: 7995, currency: "usd" } };
const view = () => render(<LanguageProvider initialLang="en"><ShopProvider><CartContents presentation="page" /></ShopProvider></LanguageProvider>);
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
  actions.get.mockResolvedValue({ status: "ready", cart }); actions.change.mockResolvedValue(locked);
});
async function openPrompt() { const button = await screen.findByRole("button", { name: `Remove ${cart.items[0].name}` }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); return screen.findByRole("dialog", { name: "Cancel the unfinished payment and remove this item?" }); }
describe("customer cancellation confirmation", () => {
  it("preserves the original payment and item when confirmation is dismissed", async () => {
    view(); await openPrompt(); expect(actions.cancel).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Keep original payment" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(actions.cancel).not.toHaveBeenCalled(); expect(screen.getByText(cart.items[0].name)).toBeVisible();
  });
  it("confirms once, shows real cancellation waiting and removes only after server success", async () => {
    let finish!: (result: CartResult) => void; actions.cancel.mockReturnValue(new Promise<CartResult>(resolve => { finish = resolve; }));
    view(); await openPrompt(); const confirm = screen.getByRole("button", { name: "Cancel unpaid payment & remove" }); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(actions.cancel).toHaveBeenCalledExactlyOnceWith({ itemId: "cali_fixture", token, confirmed: true }); expect(confirm).toBeDisabled(); expect(screen.getByText("Checking cancellation and restoring your cart…")).toHaveAttribute("role", "status"); expect(screen.getByText(cart.items[0].name)).toBeVisible();
    await act(async () => { finish({ status: "ready", cart: { ...cart, items: [], subtotal: 0, total: 0 } }); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.getByText("Your next mountain kit starts here.")).toBeVisible();
  });
  it("keeps the same confirmation for an uncertain result and retries without new payment data", async () => {
    actions.cancel.mockResolvedValueOnce({ status: "checkout-locked", cancellation: { status: "pending", code: "recovery-pending" }, itemId: "cali_fixture" }).mockResolvedValue({ status: "ready", cart: { ...cart, items: [] } });
    view(); await openPrompt(); fireEvent.click(screen.getByRole("button", { name: "Cancel unpaid payment & remove" }));
    const retry = await screen.findByRole("button", { name: "Check cancellation & retry removal" }); expect(screen.getByText(/The result is not confirmed yet/)).toBeVisible(); fireEvent.click(retry); await waitFor(() => expect(actions.cancel).toHaveBeenCalledTimes(2)); expect(actions.cancel.mock.calls[1][0]).toEqual(actions.cancel.mock.calls[0][0]);
  });
  it("closes cancellation on authorized evidence and leaves the item in place", async () => {
    actions.cancel.mockResolvedValue({ status: "checkout-locked", cancellation: { status: "blocked", code: "payment-authorized" }, itemId: "cali_fixture" }); view(); await openPrompt(); fireEvent.click(screen.getByRole("button", { name: "Cancel unpaid payment & remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(screen.getByText(cart.items[0].name)).toBeVisible();
  });
});
