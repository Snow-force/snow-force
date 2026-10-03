import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn() }));
vi.mock("@/lib/shop/cart-actions", () => ({ getShopCartAction: actions.get, changeShopCartAction: actions.change }));
import { LanguageProvider } from "@/lib/language";
import { fixtureCart, fixtureProduct, fixtureProducts } from "@/lib/shop/shop.fixtures";
import { ShopProvider } from "./shop-provider";
import { ShopPageView } from "./shop-page-view";
import { ProductDetail } from "./product-detail";
import { CartPageView } from "./cart-page-view";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { cartSnapshot } from "@/lib/shop/commerce-cart";
vi.mock("server-only", () => ({}));
beforeEach(() => {
  vi.resetAllMocks();
  actions.get.mockResolvedValue({ status: "ready", cart: null });
  actions.change.mockResolvedValue({ status: "ready", cart: cartSnapshot(fixtureCart) });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
});
afterEach(() => vi.restoreAllMocks());
function shop(lang: "en" | "zh" = "en", unavailable = false) {
  return render(<LanguageProvider initialLang={lang}><ShopProvider><ShopPageView products={unavailable ? [] : fixtureProducts} unavailable={unavailable} /></ShopProvider></LanguageProvider>);
}
describe("live shop browsing", () => {
  it.each(["en", "zh"] as const)("shows a visible shop email near the title in %s, including service failures", (lang) => {
    const view = render(<LanguageProvider initialLang={lang}><ShopPageView products={[]} /></LanguageProvider>);
    const contact = screen.getByRole("link", { name: "Shop@snow-force.com" });
    expect(contact).toHaveAttribute("href", "mailto:Shop@snow-force.com");
    expect(contact.parentElement).toHaveTextContent(lang === "zh" ? "商城客服" : "Customer service");
    view.unmount();

    render(<LanguageProvider initialLang={lang}><ShopPageView products={[]} unavailable supportEmail="updated@example.test" /></LanguageProvider>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "updated@example.test" })).toHaveAttribute("href", "mailto:updated@example.test");
    expect(screen.queryByText("Shop@snow-force.com")).not.toBeInTheDocument();
  });
  it("combines filters, searches and recovers from an empty result", async () => {
    shop();
    expect(screen.getByText("3 styles")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Little riders" }));
    expect(screen.getByText("1 styles")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search gear" }), { target: { value: "missing" } });
    expect(screen.getByText("No matching gear yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View all gear" }));
    expect(screen.getByText("3 styles")).toBeInTheDocument();
    await waitFor(() => expect(actions.get).toHaveBeenCalled());
  });
  it("renders only actual USD prices and bilingual names", async () => {
    shop("zh");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("雪山装备，一站选齐");
    expect(screen.getByText(/所有价格均为美元/)).toBeInTheDocument();
    expect(screen.getByText("$79.95")).toBeInTheDocument();
    expect(screen.queryByText(/人民币|CNY|¥|参考价/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索装备" }), { target: { value: "磁吸" } });
    expect(screen.getByText("1 款装备")).toBeInTheDocument();
    await waitFor(() => expect(actions.get).toHaveBeenCalled());
  });
  it("distinguishes no published products from a service failure", () => {
    const first = render(<LanguageProvider initialLang="en"><ShopPageView products={[]} /></LanguageProvider>);
    expect(screen.getByText("New gear is on its way")).toBeInTheDocument();
    first.unmount();
    render(<LanguageProvider initialLang="en"><ShopPageView products={[]} unavailable /></LanguageProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.queryByText("New gear is on its way")).not.toBeInTheDocument();
  });
  it("supports URL entry and price sorting using database prices", () => {
    render(<LanguageProvider initialLang="en"><ShopPageView products={fixtureProducts} initialFilters={{ category: "kids", brand: "VECTOR", query: "Rogue", sort: "featured" }} /></LanguageProvider>);
    expect(screen.getByText("1 styles")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose Rogue kids jacket" })).toHaveAttribute("href", "/shop/fixture-kids");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    fireEvent.change(screen.getByLabelText("Sort products", { selector: "select" }), { target: { value: "price-low" } });
    expect(document.querySelector("#catalog article h3")).toHaveTextContent("Magnetic goggles");
  });
  it("keeps discoverable desktop, mobile and footer shop links", () => {
    render(<LanguageProvider initialLang="en"><Nav /><Footer /></LanguageProvider>);
    expect(screen.getByRole("link", { name: "Shop", hidden: true })).toHaveAttribute("href", "/shop");
    expect(screen.getByRole("link", { name: "Gear Shop" })).toHaveAttribute("href", "/shop");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getAllByRole("link", { name: "Shop", hidden: true })).toHaveLength(2);
  });
});
describe("real product cart", () => {
  it("requires a real variant, rejects out of stock and submits only ID and quantity", async () => {
    render(<LanguageProvider initialLang="en"><ShopProvider><ProductDetail product={fixtureProduct()} related={[]} /></ShopProvider></LanguageProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to cart" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the available options");
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeDisabled();
    expect(screen.getAllByText("$99.95")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: "Pink" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    await waitFor(() => expect(actions.change).toHaveBeenCalledWith({ kind: "add", variantId: "variant_pink", quantity: 2 }));
    const dialog = await screen.findByRole("dialog", { name: "Your gear cart" });
    expect(within(dialog).getByText("Pink / M")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("href", "/shop/checkout");
    expect(localStorage.length).toBe(0);
  });
  it("updates and removes with server totals, preserving the cart after a rejected change", async () => {
    actions.get.mockResolvedValue({ status: "ready", cart: cartSnapshot(fixtureCart) });
    render(<LanguageProvider initialLang="en"><ShopProvider><CartPageView /></ShopProvider></LanguageProvider>);
    await screen.findByText("Pink / M");
    actions.change.mockResolvedValueOnce({ status: "rejected" });
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity for Current jacket title" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Pink / M")).toBeInTheDocument();
    actions.change.mockResolvedValueOnce({ status: "ready", cart: null });
    fireEvent.click(screen.getByRole("button", { name: "Remove Current jacket title" }));
    await screen.findByText("Your next mountain kit starts here.");
    expect(actions.change).toHaveBeenLastCalledWith({ kind: "remove", itemId: "cali_fixture" });
  });
  it("uses existing member login and does not display a different customer's saved cart", async () => {
    actions.get.mockResolvedValue({ status: "signed-out" });
    shop("zh");
    await waitFor(() => expect(actions.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /购物车/ }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("link", { name: "登录账号" })).toHaveAttribute("href", "/member?next=%2Fshop%2Fcart");
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭购物车" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(document.body.style.overflow).toBe("");
  });
  it("opens the current product photo and restores body scrolling", async () => {
    render(<LanguageProvider initialLang="en"><ShopProvider><ProductDetail product={fixtureProduct()} related={[]} /></ShopProvider></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "View photo 2" }));
    fireEvent.click(screen.getByRole("button", { name: "View larger photo" }));
    const photo = screen.getByRole("dialog", { name: "Product photo" });
    expect(within(photo).getByRole("img")).toHaveAttribute("src", expect.stringContaining("jacket-detail.webp"));
    fireEvent.click(within(photo).getByRole("button", { name: "Close photo" }));
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to cart" })).not.toBeDisabled());
  });
});
