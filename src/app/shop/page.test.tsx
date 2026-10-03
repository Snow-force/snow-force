import { beforeEach, describe, expect, it, vi } from "vitest";
const catalog = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/storefront-repository", () => ({ getStorefrontCatalog: catalog }));
vi.mock("@/components/shop/shop-page-view", () => ({ ShopPageView: () => null }));
import ShopPage from "./page";
import { fixtureProducts } from "@/lib/shop/shop.fixtures";
describe("public live shop listing", () => {
  beforeEach(() => { catalog.mockReset(); });
  it("passes current server products and URL filters without static catalog fallback", async () => {
    catalog.mockResolvedValue({ products: fixtureProducts });
    const page = await ShopPage({ searchParams: Promise.resolve({ category: "kids", brand: "VECTOR" }) });
    expect(page.props.products).toEqual(fixtureProducts);
    expect(page.props.initialFilters).toMatchObject({ category: "kids", brand: "VECTOR" });
  });
  it("keeps empty and failed backend states distinct", async () => {
    catalog.mockResolvedValue({ products: [] });
    expect((await ShopPage({})).props.unavailable).toBe(false);
    catalog.mockRejectedValue(new Error("private"));
    const failedPage = await ShopPage({}); expect(failedPage.props.products).toEqual([]); expect(failedPage.props.unavailable).toBe(true);
  });
});
