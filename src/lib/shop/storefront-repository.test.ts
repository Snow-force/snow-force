import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => ({ ...await importOriginal<typeof import("react")>(), cache: <T extends (...args: never[]) => unknown>(operation: T) => operation }));
import { z } from "zod";
import { createCommerceClient } from "./commerce-client";
import { getUsCommerceRegion, loadStorefrontCatalog } from "./storefront-repository";
import { fixtureNativeProduct } from "./shop.fixtures";
const config = { backendUrl: "https://commerce.example.com", publishableKey: "pk_fixture" };
const regions = { regions: [{ id: "reg_us", currency_code: "usd", countries: [{ iso_2: "us" }] }] };
const response = (value: unknown) => new Response(JSON.stringify(value));
describe("native Store API catalog", () => {
  beforeEach(() => vi.unstubAllEnvs());
  it("requests USD region price and native stock, exhausts pagination and excludes drafts", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ ...fixtureNativeProduct, id: `prod_${index}`, handle: `jacket-${index}` }));
    const fetcher = vi.fn().mockResolvedValueOnce(response(regions)).mockResolvedValueOnce(response({ products: first, count: 101 })).mockResolvedValueOnce(response({ products: [{ ...fixtureNativeProduct, status: "draft" }], count: 101 }));
    const result = await loadStorefrontCatalog(createCommerceClient(config, fetcher));
    expect(result.products).toHaveLength(100);
    expect(result.regionId).toBe("reg_us");
    const url = new URL(fetcher.mock.calls[1][0]);
    expect(url.searchParams.get("region_id")).toBe("reg_us");
    expect(url.searchParams.get("fields")).toContain("variants.inventory_quantity");
    expect(url.searchParams.get("fields")).toContain("variants.calculated_price");
    expect(new URL(fetcher.mock.calls[2][0]).searchParams.get("offset")).toBe("100");
  });
  it("distinguishes no published gear from missing region and failed backend responses", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ regions: [] })).mockResolvedValueOnce(response({ products: [], count: 0 }));
    await expect(loadStorefrontCatalog(createCommerceClient(config, fetcher))).resolves.toEqual({ products: [], regionId: null });
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("fields")).not.toContain("calculated_price");
    await expect(loadStorefrontCatalog(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("private", { status: 500 }))))).rejects.toThrow("unavailable");
  });
  it("does not silently select the wrong or ambiguous region", async () => {
    const request = (value: unknown) => createCommerceClient(config, vi.fn().mockResolvedValue(response(value)));
    await expect(getUsCommerceRegion(request({ regions: [regions.regions[0], { ...regions.regions[0], id: "reg_other" }] }))).rejects.toThrow();
    await expect(getUsCommerceRegion(request(regions), "reg_missing")).rejects.toThrow();
    await expect(getUsCommerceRegion(request(regions), "reg_us")).resolves.toBe("reg_us");
    await expect(getUsCommerceRegion(request({ regions: [{ ...regions.regions[0], countries: [{ iso_2: "ca" }] }] }))).resolves.toBeNull();
  });
  it("fails rather than silently returning a partial catalog", async () => {
    const request = createCommerceClient(config, vi.fn().mockResolvedValueOnce(response(regions)).mockResolvedValueOnce(response({ products: [], count: 1 })));
    await expect(loadStorefrontCatalog(request)).rejects.toThrow();
    await expect(createCommerceClient(config, vi.fn().mockResolvedValue(response({ invalid: true })))("/store/products", z.object({ products: z.array(z.unknown()) }))).rejects.toThrow();
  });
});
