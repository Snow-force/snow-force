import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(), cache: <T extends (...args: never[]) => unknown>(operation: T) => operation }));
import { z } from "zod";
import { createCommerceClient } from "./commerce-client";
import { getUsCommerceRegion, loadStorefrontCatalog, loadStoreNavigation, loadPurchasableVariant, loadStorefrontNavigation } from "./storefront-repository";
import { fixtureNativeProduct, fixtureCategoryRows, fixtureCollectionRows } from "./shop.fixtures";
const config = { backendUrl: "https://commerce.example.com", publishableKey: "pk_fixture" };
const regions = { regions: [{ id: "reg_us", currency_code: "usd", countries: [{ iso_2: "us" }] }] };
const response = (value: unknown) => new Response(JSON.stringify(value));
function fetchFixture(overrides: Partial<Record<string, (url: URL) => unknown>> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (overrides[url.pathname]) return response(overrides[url.pathname]!(url));
    const values: Record<string, unknown> = { "/store/regions": regions, "/store/product-categories": { product_categories: fixtureCategoryRows, count: fixtureCategoryRows.length }, "/store/collections": { collections: fixtureCollectionRows, count: fixtureCollectionRows.length }, "/store/snowforce/promotions": { promotions: [] }, "/store/products": { products: [fixtureNativeProduct], count: 1 } };
    return response(values[url.pathname]);
  });
}
describe("native Store API catalog", () => {
  beforeEach(() => vi.unstubAllEnvs());
  it("checks only the requested published variant with current USD price and inventory", async () => {
    const fetcher = fetchFixture(), variantId = fixtureNativeProduct.variants[0].id;
    const result = await loadPurchasableVariant(createCommerceClient(config, fetcher), variantId);
    expect(result.regionId).toBe("reg_us");
    expect(result.variant?.id).toBe(variantId);
    expect(fetcher.mock.calls).toHaveLength(2);
    const query = new URL(String(fetcher.mock.calls[1][0])).searchParams;
    expect(query.get("variants[id]")).toBe(variantId);
    expect(query.get("fields")).toContain("variants.inventory_quantity");
    expect(query.get("fields")).toContain("variants.calculated_price");
    const draft = fetchFixture({ "/store/products": () => ({ products: [{ ...fixtureNativeProduct, status: "draft" }], count: 1 }) });
    expect((await loadPurchasableVariant(createCommerceClient(config, draft), variantId)).variant).toBeNull();
  });
  it("loads header brands without asking for prices, inventory or regions", async () => {
    const fetcher = fetchFixture();
    const navigation = await loadStorefrontNavigation(createCommerceClient(config, fetcher));
    expect(navigation.brands).toEqual(["VECTOR"]);
    const urls = fetcher.mock.calls.map(call => new URL(String(call[0])));
    expect(urls.some(url => url.pathname === "/store/regions")).toBe(false);
    expect(urls.find(url => url.pathname === "/store/products")?.searchParams.get("fields")).toBe("id,status,metadata");
  });
  it("requests USD region price and native stock, exhausts pagination and excludes drafts", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ ...fixtureNativeProduct, id: `prod_${index}`, handle: `jacket-${index}` }));
    const fetcher = fetchFixture({ "/store/products": url => ({ products: url.searchParams.get("offset") === "0" ? first : [{ ...fixtureNativeProduct, status: "draft" }], count: 101 }) });
    const result = await loadStorefrontCatalog(createCommerceClient(config, fetcher));
    expect(result.products).toHaveLength(100);
    expect(result.regionId).toBe("reg_us");
    const urls = fetcher.mock.calls.map(call => new URL(String(call[0]))).filter(url => url.pathname === "/store/products");
    expect(urls[0].searchParams.get("region_id")).toBe("reg_us");
    expect(urls[0].searchParams.get("fields")).toContain("variants.inventory_quantity");
    expect(urls[0].searchParams.get("fields")).toContain("variants.calculated_price");
    expect(urls[0].searchParams.get("fields")).toContain("*categories");
    expect(urls[1].searchParams.get("offset")).toBe("100");
    expect(result.navigation.categories[0].children[0].id).toBe("pcat_outerwear");
    expect(result.navigation.brands).toEqual(["VECTOR"]);
  });
  it("distinguishes no published gear from missing region and failed backend responses", async () => {
    const fetcher = fetchFixture({ "/store/regions": () => ({ regions: [] }), "/store/products": () => ({ products: [], count: 0 }) });
    const result = await loadStorefrontCatalog(createCommerceClient(config, fetcher));
    expect(result.products).toEqual([]); expect(result.regionId).toBeNull();
    const url = new URL(String(fetcher.mock.calls.find(call => String(call[0]).includes("/store/products"))![0]));
    expect(url.searchParams.get("fields")).not.toContain("calculated_price");
    await expect(loadStorefrontCatalog(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("private", { status: 500 }))))).rejects.toThrow("unavailable");
  });
  it("advances by actual page length and rejects overlapping product pages", async () => {
    const fetcher = fetchFixture({ "/store/products": url => ({ products: [{ ...fixtureNativeProduct, id: url.searchParams.get("offset") === "0" ? "prod_first" : "prod_second" }], count: 2 }) });
    const result = await loadStorefrontCatalog(createCommerceClient(config, fetcher));
    expect(result.products.map(product => product.id)).toEqual(["prod_first", "prod_second"]);
    expect(fetcher.mock.calls.some(call => new URL(String(call[0])).searchParams.get("offset") === "1")).toBe(true);
    await expect(loadStorefrontCatalog(createCommerceClient(config, fetchFixture({ "/store/products": () => ({ products: [fixtureNativeProduct], count: 2 }) })))).rejects.toThrow("unavailable");
  });
  it("does not silently select the wrong or ambiguous region", async () => {
    const request = (value: unknown) => createCommerceClient(config, vi.fn().mockResolvedValue(response(value)));
    await expect(getUsCommerceRegion(request({ regions: [regions.regions[0], { ...regions.regions[0], id: "reg_other" }] }))).rejects.toThrow();
    await expect(getUsCommerceRegion(request(regions), "reg_missing")).rejects.toThrow();
    await expect(getUsCommerceRegion(request(regions), "reg_us")).resolves.toBe("reg_us");
    await expect(getUsCommerceRegion(request({ regions: [{ ...regions.regions[0], countries: [{ iso_2: "ca" }] }] }))).resolves.toBeNull();
  });
  it("loads all category and collection pages so new backend rows appear without code changes", async () => {
    const categories = Array.from({ length: 101 }, (_, index) => ({ ...fixtureCategoryRows[0], id: `pcat_${index}`, handle: `category-${index}` }));
    const collections = Array.from({ length: 101 }, (_, index) => ({ id: `pcol_${index}`, handle: `collection-${index}`, title: `Collection ${index}` }));
    const fetcher = fetchFixture({ "/store/product-categories": url => ({ product_categories: categories.slice(Number(url.searchParams.get("offset")), Number(url.searchParams.get("offset")) + 100), count: 101 }), "/store/collections": url => ({ collections: collections.slice(Number(url.searchParams.get("offset")), Number(url.searchParams.get("offset")) + 100), count: 101 }) });
    const result = await loadStoreNavigation(createCommerceClient(config, fetcher));
    expect(result.categories).toHaveLength(101); expect(result.collections).toHaveLength(101);
    expect(result.categories.some(category => category.handle === "category-100")).toBe(true);
  });
  it("strips category associations whose parent is not public and never uses legacy category metadata", async () => {
    const fetcher = fetchFixture({ "/store/product-categories": () => ({ product_categories: [{ ...fixtureCategoryRows[1], parent_category_id: "pcat_private" }], count: 1 }) });
    const result = await loadStorefrontCatalog(createCommerceClient(config, fetcher));
    expect(result.products[0].categoryIds).toEqual([]); expect(result.products[0].category).toBe("");
  });
  it("fails rather than silently returning a partial or malformed catalog", async () => {
    for (const path of ["/store/products", "/store/product-categories", "/store/collections"]) {
      const key = path === "/store/product-categories" ? "product_categories" : path.split("/").at(-1)!;
      await expect(loadStorefrontCatalog(createCommerceClient(config, fetchFixture({ [path]: () => ({ [key]: [], count: 1 }) })))).rejects.toThrow();
    }
    await expect(createCommerceClient(config, vi.fn().mockResolvedValue(response({ invalid: true })))("/store/products", z.object({ products: z.array(z.unknown()) }))).rejects.toThrow();
  });
});
