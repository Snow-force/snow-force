import { beforeEach, describe, expect, it, vi } from "vitest";
const catalog = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/storefront-repository", () => ({ getStorefrontCatalog: catalog }));
vi.mock("@/lib/shop/cart-actions", () => ({ getShopCartAction: vi.fn(), changeShopCartAction: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import ProductPage, { generateMetadata } from "./page";
import { fixtureProducts } from "@/lib/shop/shop.fixtures";
beforeEach(() => { catalog.mockReset().mockResolvedValue({ products: fixtureProducts, regionId: "reg_us" }); });
describe("published shop product route", () => {
  it("uses current backend content and rejects draft or unknown routes", async () => {
    expect((await generateMetadata({ params: Promise.resolve({ slug: "fixture-jacket" }) })).title).toContain("Current jacket title");
    await expect(ProductPage({ params: Promise.resolve({ slug: "not-a-product" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await ProductPage({ params: Promise.resolve({ slug: "fixture-jacket" }) })).props.product.id).toBe("prod_fixture");
  });
  it("does not present an unavailable backend as a missing product", async () => {
    catalog.mockRejectedValue(new Error("private details"));
    const page = await ProductPage({ params: Promise.resolve({ slug: "fixture-jacket" }) });
    expect(page.props.role).toBe("alert");
    expect((await generateMetadata({ params: Promise.resolve({ slug: "fixture-jacket" }) })).robots).toEqual({ index: false });
  });
});
