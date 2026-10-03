import { beforeEach, describe, expect, it, vi } from "vitest";
const catalog = vi.hoisted(() => vi.fn());
const supportEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/storefront-repository", () => ({ getStorefrontCatalog: catalog }));
vi.mock("@/lib/shop/support-repository", () => ({ getShopSupportEmail: supportEmail }));
vi.mock("@/components/shop/shop-page-view", () => ({ ShopPageView: () => null }));
import ShopPage from "./page";
import { fixtureProducts } from "@/lib/shop/shop.fixtures";
describe("public live shop listing", () => {
  beforeEach(() => { catalog.mockReset(); supportEmail.mockReset().mockResolvedValue("Shop@snow-force.com"); });
  it("passes current server products and URL filters without static catalog fallback", async () => {
    catalog.mockResolvedValue({ products: fixtureProducts });
    const page = await ShopPage({ searchParams: Promise.resolve({ category: "kids", brand: "VECTOR" }) });
    expect(page.props.products).toEqual(fixtureProducts);
    expect(page.props.initialFilters).toMatchObject({ category: "kids", brand: "VECTOR" });
    expect(page.props.supportEmail).toBe("Shop@snow-force.com");
  });
  it("keeps empty and failed backend states distinct", async () => {
    catalog.mockResolvedValue({ products: [] });
    expect((await ShopPage({})).props.unavailable).toBe(false);
    catalog.mockRejectedValue(new Error("private"));
    const failedPage = await ShopPage({}); expect(failedPage.props.products).toEqual([]); expect(failedPage.props.unavailable).toBe(true);
  });
  it("keeps the effective support contact visible when the catalog is unavailable", async () => {
    catalog.mockRejectedValue(new Error("private"));
    supportEmail.mockResolvedValue("updated@example.test");
    const page = await ShopPage({});
    expect(page.props.unavailable).toBe(true);
    expect(page.props.supportEmail).toBe("updated@example.test");
  });
});
