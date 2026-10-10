import { describe, expect, it, vi } from "vitest";
const { listing, metadata } = vi.hoisted(() => ({ listing: vi.fn(() => null), metadata: vi.fn(async () => ({ title: "Native listing" })) }));
vi.mock("@/components/shop/catalog-listing-page", () => ({ CatalogListingPage: listing, shopListingMetadata: metadata }));
import CategoryPage, { generateMetadata as categoryMetadata } from "./categories/[handle]/page";
import CollectionPage, { generateMetadata as collectionMetadata } from "./collections/[handle]/page";
import BrandPage, { generateMetadata as brandMetadata } from "./brands/[brand]/page";
import DepartmentPage, { generateMetadata as departmentMetadata } from "./departments/[section]/page";
import FeaturedPage, { generateMetadata as featuredMetadata } from "./featured/page";
import SalePage, { generateMetadata as saleMetadata } from "./sale/page";
import BrandsPage, { generateMetadata as brandsMetadata } from "./brands/page";

describe("native catalog route bindings", () => {
  it("awaits dynamic route parameters before resolving the correct listing and metadata", async () => {
    const searchParams = Promise.resolve({ q: "powder" });
    for (const [kind, route, generate, parameter, value] of [
      ["category", CategoryPage, categoryMetadata, "handle", "新款-shells"],
      ["collection", CollectionPage, collectionMetadata, "handle", "50%-off"],
      ["brand", BrandPage, brandMetadata, "brand", "A/B SNOW"],
      ["department", DepartmentPage, departmentMetadata, "section", "women"],
    ] as const) {
      const params = Promise.resolve({ handle: "", brand: "", section: "", [parameter]: value });
      const pageParams = Promise.resolve({ handle: "", brand: "", section: "", [parameter]: encodeURIComponent(value) });
      await route({ params: pageParams, searchParams });
      expect(listing).toHaveBeenLastCalledWith({ kind, handle: value, searchParams });
      await generate({ params }); expect(metadata).toHaveBeenLastCalledWith(kind, value);
    }
  });
  it("keeps featured, sale and the brand directory bound to their own backend data", async () => {
    const searchParams = Promise.resolve({});
    for (const [kind, route, generate] of [["featured", FeaturedPage, featuredMetadata], ["sale", SalePage, saleMetadata], ["brands", BrandsPage, brandsMetadata]] as const) {
      await route({ searchParams });
      expect(listing).toHaveBeenLastCalledWith(kind === "brands" ? { kind } : { kind, searchParams });
      await generate(); expect(metadata).toHaveBeenLastCalledWith(kind);
    }
  });
});
