import { beforeEach, describe, expect, it, vi } from "vitest";
const catalog = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/storefront-repository", () => ({ getStorefrontCatalog: catalog }));
vi.mock("@/lib/shop/support-repository", () => ({ getShopSupportEmail: async () => "Shop@snow-force.com" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import { CatalogListingPage, shopListingMetadata } from "./catalog-listing-page";
import { fixtureNavigation, fixtureProducts } from "@/lib/shop/shop.fixtures";
import type { StoreProduct } from "@/lib/shop/storefront";
beforeEach(() => { catalog.mockReset().mockResolvedValue({ products: fixtureProducts, navigation: fixtureNavigation }); });
describe("dynamic commerce listing routes", () => {
  it("uses live category descendants and bilingual metadata while keeping client filters within the route", async () => {
    const page = await CatalogListingPage({ kind: "category", handle: "men", searchParams: Promise.resolve({ q: "jacket" }) });
    expect(page.props.products.map((product: StoreProduct) => product.id)).toEqual(["prod_fixture"]);
    expect(page.props.scoped).toBe(true); expect(page.props.initialFilters.query).toBe("jacket");
    expect((await shopListingMetadata("category", "men")).title).toContain("男士");
  });
  it.each(["category", "collection", "brand", "department"] as const)("returns not-found for a missing %s, but not for backend failure", async kind => {
    await expect(CatalogListingPage({ kind, handle: "missing" })).rejects.toThrow("NEXT_NOT_FOUND");
    catalog.mockRejectedValue(new Error("private details"));
    const result = await CatalogListingPage({ kind, handle: "missing" });
    expect(result.props.unavailable).toBe(true); expect(result.props.products).toEqual([]);
    expect((await shopListingMetadata(kind, "missing")).robots).toEqual({ index: false });
  });
});
