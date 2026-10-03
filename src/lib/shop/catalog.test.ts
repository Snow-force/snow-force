import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brands, catalogFiltersFromSearchParams, filterProducts, formatReferencePrice, formatUsdAmount, products, usdReferencePrice } from "./catalog";

describe("curated shop catalog", () => {
  it("opens valid category and search links while ignoring invalid URL filters", () => {
    expect(catalogFiltersFromSearchParams({ category: "kids", brand: "VECTOR", q: "Rogue", sort: "price-low" })).toEqual({ category: "kids", brand: "VECTOR", query: "Rogue", sort: "price-low" });
    expect(catalogFiltersFromSearchParams({ category: "invalid", brand: ["VECTOR"], q: ["one", "two"], sort: "invalid" })).toEqual({ category: "all", brand: "all", query: "", sort: "featured" });
    expect(catalogFiltersFromSearchParams({ q: "x".repeat(300), sort: "price-high" }).query).toHaveLength(200);
  });
  it("rounds reference unit prices to cents before quantity totals", () => {
    expect(usdReferencePrice(699)).toBe(104.14);
    expect(formatUsdAmount(usdReferencePrice(699) * 3, "zh")).toBe("$312.42");
  });
  it("has unique routes, traceable sources and both local images for every product", () => {
    expect(new Set(products.map((product) => product.slug)).size).toBe(products.length);
    expect(new Set(products.map((product) => product.brand))).toEqual(new Set(brands));
    for (const product of products) {
      expect(product.referencePrice).toBeGreaterThan(0);
      expect(product.source.page).toBeGreaterThan(0);
      expect(product.source.file).toMatch(/\.pdf$/);
      expect(existsSync(`public/shop/${product.slug}.webp`)).toBe(true);
      expect(existsSync(`public/shop/${product.slug}-catalog.webp`)).toBe(true);
      expect(product.name.en).not.toBe("");
      expect(product.name.zh).not.toBe("");
    }
  });
  it("combines category, brand and bilingual search", () => {
    const base = { category: "kids", brand: "VECTOR", query: " 套头 ", sort: "featured" } as const;
    expect(filterProducts(base).map((product) => product.slug)).toEqual(["vector-kids-colorblock"]);
    expect(filterProducts({ ...base, query: "ROGUE" }).map((product) => product.slug)).toEqual(["vector-rogue-kids"]);
    expect(filterProducts({ ...base, query: "unknown" })).toEqual([]);
  });
  it("sorts reference prices without mutating the curated order", () => {
    const before = products.map((product) => product.slug);
    const base = { category: "all", brand: "all", query: "", sort: "price-low" } as const;
    const low = filterProducts(base).map((product) => product.referencePrice);
    expect(low).toEqual([...low].sort((a, b) => a - b));
    expect(filterProducts({ ...base, sort: "price-high" }).map((product) => product.referencePrice)).toEqual([...low].reverse());
    expect(products.map((product) => product.slug)).toEqual(before);
    expect(formatReferencePrice(699, "en")).toBe("$104.14");
    expect(formatReferencePrice(699, "zh")).toBe("$104.14");
    expect(formatReferencePrice(6998, "en")).toBe("$1,042.61");
  });
});
