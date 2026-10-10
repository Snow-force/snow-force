import { describe, expect, it } from "vitest";
import { buildCategoryTree, categoryIds, decodeCatalogPageParam, mapStoreCollections, nativeCategorySchema } from "./navigation";
import { selectCatalogListing } from "./catalog-listing";
import { fixtureCategoryRows, fixtureNavigation, fixtureProducts, fixtureProduct } from "./shop.fixtures";
const tree = (rows: unknown[]) => buildCategoryTree(rows.map(row => nativeCategorySchema.parse(row)));
describe("backend category and merchandising navigation", () => {
  it("decodes page segments exactly once without changing literal encoded brand names", () => {
    for (const value of ["ISEE MIGGA", "A/B SNOW", "新款-shells", "50% OFF", "ISEE%20MIGGA"])
      expect(decodeCatalogPageParam(encodeURIComponent(value))).toBe(value);
    expect(decodeCatalogPageParam("bad%escape")).toBe("bad%escape");
  });
  it("builds ordered descendants, supports new arbitrary categories and includes products once", () => {
    const categories = tree([...fixtureCategoryRows, { id: "pcat_new", handle: "new-powder-shells", name: "Powder shells", parent_category_id: "pcat_outerwear", rank: 0 }]);
    expect([...categoryIds(categories, "men")]).toEqual(["pcat_men", "pcat_outerwear", "pcat_new"]);
    const added = fixtureProduct({ id: "prod_new", categoryIds: ["pcat_men", "pcat_new"] });
    const catalog = { products: [...fixtureProducts, added], navigation: { ...fixtureNavigation, categories } };
    expect(selectCatalogListing(catalog, "category", "men")?.products.map(product => product.id)).toEqual(["prod_fixture", "prod_new"]);
    const page = selectCatalogListing(catalog, "category", "new-powder-shells");
    expect(page?.products).toEqual([added]);
    expect(page?.breadcrumbs?.map(item => item.href)).toEqual(["/shop/categories/men", "/shop/categories/snow-jackets"]);
  });
  it("omits descendants of an invisible parent and rejects duplicate IDs, handles and cycles", () => {
    expect(tree([{ ...fixtureCategoryRows[1], parent_category_id: "pcat_private" }])).toEqual([]);
    expect(() => tree([fixtureCategoryRows[0], fixtureCategoryRows[0]])).toThrow("Duplicate");
    expect(() => tree([fixtureCategoryRows[0], { ...fixtureCategoryRows[0], id: "pcat_other" }])).toThrow("Duplicate");
    expect(() => tree([{ ...fixtureCategoryRows[0], parent_category_id: "pcat_outerwear" }, fixtureCategoryRows[1]])).toThrow("Cyclic");
  });
  it("uses category placement metadata, automatic reserved handles and a visible home for new roots", () => {
    expect(tree([{ ...fixtureCategoryRows[0], metadata: { snowforce_navigation_section: null } }])[0].section).toBe("men");
    expect(tree([{ ...fixtureCategoryRows[0], metadata: { snowforce_navigation_section: "women" } }])[0].section).toBe("women");
    expect(tree([{ ...fixtureCategoryRows[0], handle: "touring" }])[0].section).toBe("ski-snowboard");
  });
  it("routes collections and brands by their data, and cannot escape the selected scope", () => {
    const catalog = { products: fixtureProducts, navigation: fixtureNavigation };
    expect(selectCatalogListing(catalog, "category", "goggles")?.products.map(product => product.id)).toEqual(["prod_goggles"]);
    expect(selectCatalogListing(catalog, "brand", "VECTOR")?.products.map(product => product.id)).toEqual(["prod_fixture", "prod_kids"]);
    expect(selectCatalogListing(catalog, "collection", "new-arrivals")?.products).toEqual(fixtureProducts);
    for (const kind of ["category", "collection", "brand", "department"] as const) expect(selectCatalogListing(catalog, kind, "missing")).toBeNull();
  });
  it("uses actual available variant markdowns and active promotion collection links for Sale", () => {
    const regular = fixtureProduct({ id: "prod_regular", collectionId: null, variants: [fixtureProduct().variants[1]] });
    const promotionOnly = fixtureProduct({ id: "prod_offer", collectionId: "pcol_offer", variants: [{ ...fixtureProduct().variants[0], originalPrice: 79.95 }] });
    const navigation = { ...fixtureNavigation, collections: [...fixtureNavigation.collections, { id: "pcol_offer", handle: "offer", label: { en: "Offer", zh: "优惠" }, image: null, section: "featured" as const, rank: 0 }], promotions: [{ collection_id: "pcol_offer", code: "SNOW10", is_automatic: false, ends_at: null }] };
    const result = selectCatalogListing({ products: [fixtureProduct(), regular, promotionOnly], navigation }, "sale");
    expect(result?.products.map(product => product.id)).toEqual(["prod_fixture", "prod_offer"]);
    expect(result?.promotions).toEqual(navigation.promotions);
  });
  it("honors collection rank, hidden state, explicit placement and safe images", () => {
    const collections = mapStoreCollections([{ id: "pcol_a", handle: "sale", title: "Featured sale", metadata: { snowforce_navigation_section: "featured", snowforce_navigation_rank: 2 } }, { id: "pcol_b", handle: "private", title: "Hidden", metadata: { snowforce_navigation_section: "hidden", snowforce_image: "javascript:alert(1)" } }]);
    expect(collections[0]).toMatchObject({ section: null, image: null });
    expect(collections[1].section).toBe("featured");
    expect(selectCatalogListing({ products: [], navigation: { ...fixtureNavigation, collections } }, "collection", "private")).toBeNull();
  });
  it("department and directory pages share live native associations and encoded links", () => {
    const navigation = { ...fixtureNavigation, brands: ["A/B SNOW"] };
    const catalog = { products: fixtureProducts, navigation };
    expect(selectCatalogListing(catalog, "department", "men")?.products.map(product => product.id)).toEqual(["prod_fixture"]);
    expect(selectCatalogListing(catalog, "department", "accessories")?.products.map(product => product.id)).toEqual(["prod_goggles"]);
    expect(selectCatalogListing(catalog, "brands")?.links).toEqual([{ label: { en: "A/B SNOW", zh: "A/B SNOW" }, href: "/shop/brands/A%2FB%20SNOW" }]);
    expect(selectCatalogListing(catalog, "featured")?.products).toEqual(fixtureProducts);
  });
});
