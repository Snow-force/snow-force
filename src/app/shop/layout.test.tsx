import { describe, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/storefront-repository", () => ({ getStorefrontNavigation: navigation }));
vi.mock("@/components/shop/shop-provider", () => ({ ShopProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/shop/gear-navigation", () => ({ GearNavigation: () => null }));
import ShopLayout from "./layout";
describe("shop layout reads", () => {
  it("loads navigation without fetching regional product prices or inventory", async () => {
    navigation.mockResolvedValue({ categories: [], collections: [], brands: [], promotions: [] });
    const result = await ShopLayout({ children: <p>Checkout</p> });
    expect(navigation).toHaveBeenCalledOnce();
    expect(result.props.children[1]).toEqual(<p>Checkout</p>);
  });
});
