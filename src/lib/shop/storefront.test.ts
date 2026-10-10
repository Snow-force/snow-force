import { describe, expect, it } from "vitest";
import { defaultStoreFilters, filterStoreProducts, formatStorePrice, mapStoreProduct, nativeProductSchema, safeProductImage, selectedStoreVariant, storeFiltersFromSearchParams } from "./storefront";
import { fixtureNativeProduct, fixtureProduct, fixtureProducts } from "./shop.fixtures";
describe("database storefront products", () => {
  it("uses current native titles, USD amounts in major units and actual variant stock", () => {
    const product = fixtureProduct();
    expect(product.name).toEqual({ en: "Current jacket title", zh: "测试滑雪服" });
    expect(product.description.en).toBe("Current description");
    expect(product.price).toBe(79.95);
    expect(formatStorePrice(product.price ?? 0, "zh")).toBe("$79.95");
    expect(product.variants[0]).toMatchObject({ available: true, availableQuantity: 2, originalPrice: 89.95 });
    expect(product.variants[1]).toMatchObject({ available: false, availableQuantity: 0 });
    expect(product.options[0].values[0].label.zh).toBe("粉色");
  });
  it("never turns draft or non-USD prices or missing stock into a sale offer", () => {
    expect(mapStoreProduct(nativeProductSchema.parse({ ...fixtureNativeProduct, status: "draft" }))).toBeNull();
    const product = mapStoreProduct(nativeProductSchema.parse({ ...fixtureNativeProduct, variants: [{ ...fixtureNativeProduct.variants[0], inventory_quantity: undefined, calculated_price: { currency_code: "cny", calculated_amount: 699, original_amount: 699 } }] }));
    expect(product).toMatchObject({ price: null, available: false });
    expect(product?.variants[0].availableQuantity).toBe(0);
  });
  it("honors native inventory-disabled and backorder settings without inventing quantity", () => {
    for (const flags of [{ manage_inventory: false }, { allow_backorder: true }]) {
      const product = mapStoreProduct(nativeProductSchema.parse({ ...fixtureNativeProduct, variants: [{ ...fixtureNativeProduct.variants[0], inventory_quantity: 0, ...flags }] }));
      expect(product?.variants[0]).toMatchObject({ available: true, availableQuantity: null });
    }
  });
  it("requires an exact existing option combination and handles unavailable combinations", () => {
    const product = fixtureProduct();
    expect(selectedStoreVariant(product, {})).toBeNull();
    expect(selectedStoreVariant(product, { opt_color: "Pink", opt_size: "M" })?.id).toBe("variant_pink");
    expect(selectedStoreVariant(product, { opt_color: "Green", opt_size: "M" })).toBeNull();
    expect(selectedStoreVariant(product, { opt_color: "Blue", opt_size: "M" })?.available).toBe(false);
    expect(selectedStoreVariant({ ...product, variants: [product.variants[0], { ...product.variants[0], id: "variant_duplicate" }] }, { opt_color: "Pink", opt_size: "M" })).toBeNull();
  });
  it("filters runtime brands and bilingual names, keeping null prices last in either order", () => {
    expect(filterStoreProducts(fixtureProducts, { ...defaultStoreFilters, query: "磁吸" }).map((product) => product.slug)).toEqual(["fixture-goggles"]);
    expect(filterStoreProducts(fixtureProducts, { ...defaultStoreFilters, brand: "VECTOR", category: "pcat_kids" })).toHaveLength(1);
    const rows = [...fixtureProducts, fixtureProduct({ slug: "unpriced", price: null })];
    expect(filterStoreProducts(rows, { ...defaultStoreFilters, sort: "price-high" }).at(-1)?.slug).toBe("unpriced");
    expect(filterStoreProducts(rows, { ...defaultStoreFilters, sort: "price-low" })[0].slug).toBe("fixture-goggles");
    expect(storeFiltersFromSearchParams({ brand: "NEW BRAND", category: "kids", q: "child", sort: "price-high" })).toEqual({ brand: "NEW BRAND", category: "kids", query: "child", sort: "price-high" });
    expect(storeFiltersFromSearchParams({ category: ["ignored"], q: ["ignored"] })).toEqual(defaultStoreFilters);
    expect(storeFiltersFromSearchParams({ category: "new-category" }).category).toBe("new-category");
  });
  it("accepts only public HTTPS images and falls back without unsafe HTML", () => {
    for (const url of [null, "javascript:alert(1)", "http://images.example.com/a", "https://secret@images.example.com/a", "/untrusted", "not a URL"]) expect(safeProductImage(url)).toBeNull();
    const product = mapStoreProduct(nativeProductSchema.parse({ ...fixtureNativeProduct, thumbnail: null, images: [], metadata: null, description: null }));
    expect(product).toMatchObject({ image: "/shop/product-placeholder.svg", brand: "", name: { zh: "Current jacket title" }, description: { en: "", zh: "" } });
  });
});
