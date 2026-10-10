import type { Localized, StoreProduct } from "./storefront";
import { brandHref, categoryHref, categoryIds, collectionHref, flattenCategories, isDiscountedProduct, navigationSections, type StoreNavigation, type StorePromotion } from "./navigation";

export type ListingKind = "category" | "collection" | "brand" | "department" | "featured" | "sale" | "brands";
export type CatalogListing = { label: Localized; products: StoreProduct[]; directory?: boolean; description?: string; image?: string | null; promotions?: StorePromotion[]; breadcrumbs?: { label: Localized; href: string }[]; links?: { label: Localized; href: string }[] };
export function selectCatalogListing(catalog: { products: StoreProduct[]; navigation: StoreNavigation }, kind: ListingKind, handle = ""): CatalogListing | null {
  const { products, navigation } = catalog;
  if (kind === "category") {
    const all = flattenCategories(navigation.categories);
    const category = all.find(category => category.handle === handle);
    if (!category) return null;
    const ids = categoryIds(navigation.categories, category.id);
    const breadcrumbs = [];
    let parent = all.find(item => item.id === category.parentId);
    while (parent) { breadcrumbs.unshift({ label: parent.label, href: categoryHref(parent) }); parent = all.find(item => item.id === parent?.parentId); }
    return { label: category.label, image: category.image, description: category.description, breadcrumbs, links: category.children.map(item => ({ label: item.label, href: categoryHref(item) })), products: products.filter(product => product.categoryIds.some(id => ids.has(id))) };
  }
  if (kind === "collection") {
    const collection = navigation.collections.find(collection => collection.handle === handle && collection.section !== null);
    return collection ? { label: collection.label, image: collection.image, promotions: navigation.promotions.filter(offer => offer.collection_id === collection.id), products: products.filter(product => product.collectionId === collection.id) } : null;
  }
  if (kind === "brand") {
    if (!navigation.brands.includes(handle)) return null;
    return { label: { en: handle, zh: handle }, products: products.filter(product => product.brand === handle) };
  }
  if (kind === "department") {
    const section = navigationSections.find(section => section.id === handle && !["featured", "brands", "sale"].includes(section.id));
    if (!section) return null;
    const roots = navigation.categories.filter(category => category.section === section.id);
    const ids = new Set(flattenCategories(roots).map(category => category.id));
    return { label: section.label, products: products.filter(product => product.categoryIds.some(id => ids.has(id))), links: roots.map(category => ({ label: category.label, href: categoryHref(category) })) };
  }
  if (kind === "brands") return { label: { en: "Brands", zh: "品牌" }, directory: true, products: [], links: navigation.brands.map(brand => ({ label: { en: brand, zh: brand }, href: brandHref(brand) })) };
  const promotionalCollections = new Set(navigation.promotions.map(offer => offer.collection_id));
  const collections = navigation.collections.filter(collection => collection.section === kind || kind === "sale" && promotionalCollections.has(collection.id));
  const collectionIds = new Set(collections.map(collection => collection.id));
  return { label: kind === "sale" ? { en: "Sale", zh: "优惠" } : { en: "Featured", zh: "精选" }, promotions: kind === "sale" ? navigation.promotions : [], links: collections.map(collection => ({ label: collection.label, href: collectionHref(collection) })), products: products.filter(product => product.collectionId !== null && collectionIds.has(product.collectionId) || kind === "sale" && isDiscountedProduct(product)) };
}
