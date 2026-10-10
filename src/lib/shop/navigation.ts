import { z } from "zod";
import { commerceId, safeProductImage, type Localized, type StoreProduct } from "./storefront";

export const navigationSections = [
  { id: "featured", label: { en: "FEATURED", zh: "精选" } },
  { id: "men", label: { en: "MEN", zh: "男士" } },
  { id: "women", label: { en: "WOMEN", zh: "女士" } },
  { id: "kids", label: { en: "KIDS", zh: "儿童" } },
  { id: "ski-snowboard", label: { en: "SKI & SNOWBOARD", zh: "双板与单板" } },
  { id: "accessories", label: { en: "ACCESSORIES", zh: "配件" } },
  { id: "brands", label: { en: "BRANDS", zh: "品牌" } },
  { id: "sale", label: { en: "SALE", zh: "优惠" } },
] as const;
export type NavigationSection = typeof navigationSections[number]["id"];
export type CategorySection = "men" | "women" | "kids" | "ski-snowboard" | "accessories";
const handle = z.string().min(1).max(200).refine(value => !/[/?#\\\u0000-\u001f\u007f]/.test(value) && value !== "." && value !== "..");
export const nativeCategorySchema = z.object({
  id: commerceId("pcat"), handle, name: z.string().min(1), description: z.string().nullable().optional(),
  parent_category_id: commerceId("pcat").nullable(), rank: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).nullable().optional(),
});
export const nativeCollectionSchema = z.object({ id: commerceId("pcol"), handle, title: z.string().min(1), metadata: z.record(z.unknown()).nullable().optional() });
export type StoreCategory = { id: string; handle: string; label: Localized; description: string; parentId: string | null; rank: number; image: string | null; section: CategorySection; children: StoreCategory[] };
export type StoreCollection = { id: string; handle: string; label: Localized; image: string | null; section: "featured" | "sale" | null; rank: number };
export const storePromotionSchema = z.object({ collection_id: commerceId("pcol"), code: z.string().min(1).max(100), is_automatic: z.boolean(), ends_at: z.string().datetime().nullable() });
export type StorePromotion = z.infer<typeof storePromotionSchema>;
export type StoreNavigation = { categories: StoreCategory[]; collections: StoreCollection[]; brands: string[]; promotions: StorePromotion[] };
export const emptyStoreNavigation: StoreNavigation = { categories: [], collections: [], brands: [], promotions: [] };
function label(name: string, metadata: Record<string, unknown>): Localized {
  return { en: name, zh: typeof metadata.snowforce_name_zh === "string" && metadata.snowforce_name_zh.trim() ? metadata.snowforce_name_zh.slice(0, 200) : name };
}
export const categoryHref = (category: Pick<StoreCategory, "handle">) => `/shop/categories/${encodeURIComponent(category.handle)}`;
export const collectionHref = (collection: Pick<StoreCollection, "handle">) => `/shop/collections/${encodeURIComponent(collection.handle)}`;
export const brandHref = (brand: string) => `/shop/brands/${encodeURIComponent(brand)}`;
// Next 16 page params contain encoded path segments; metadata params are decoded.
// Decode once at the page boundary so spaces, Unicode and literal percent signs work.
export function decodeCatalogPageParam(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
export function flattenCategories(categories: StoreCategory[]): StoreCategory[] {
  return categories.flatMap(category => [category, ...flattenCategories(category.children)]);
}
export function categoryIds(categories: StoreCategory[], selected: string): Set<string> {
  const found = flattenCategories(categories).find(category => category.id === selected || category.handle === selected);
  return new Set(found ? flattenCategories([found]).map(category => category.id) : []);
}
export function buildCategoryTree(rows: z.infer<typeof nativeCategorySchema>[]): StoreCategory[] {
  const nodes = new Map<string, StoreCategory>();
  const handles = new Set<string>();
  for (const row of rows) {
    if (nodes.has(row.id) || handles.has(row.handle)) throw new Error("Duplicate storefront category.");
    handles.add(row.handle);
    const metadata = row.metadata ?? {};
    const configured = metadata.snowforce_navigation_section;
    const inferred = row.handle === "ski" || row.handle === "snowboard" ? "ski-snowboard" : row.handle;
    const section = ["men", "women", "kids", "ski-snowboard", "accessories"].find(section => section === configured || configured == null && section === inferred) as CategorySection | undefined;
    nodes.set(row.id, { id: row.id, handle: row.handle, label: label(row.name, metadata), description: row.description ?? "", parentId: row.parent_category_id, rank: row.rank, image: safeProductImage(typeof metadata.snowforce_image === "string" ? metadata.snowforce_image : null), section: section ?? "ski-snowboard", children: [] });
  }
  // Flat Store API pages contain only active, public categories. An absent parent
  // may be private or inactive, so never promote its descendants into public roots.
  for (const node of nodes.values()) {
    const visited = new Set<string>([node.id]);
    let parent = node.parentId;
    while (parent && nodes.has(parent)) {
      if (visited.has(parent)) throw new Error("Cyclic storefront categories.");
      visited.add(parent); parent = nodes.get(parent)!.parentId;
    }
    if (node.parentId) nodes.get(node.parentId)?.children.push(node);
  }
  function sort(items: StoreCategory[]): StoreCategory[] {
    return items.sort((a, b) => a.rank - b.rank || a.label.en.localeCompare(b.label.en)).map(item => ({ ...item, children: sort(item.children) }));
  }
  return sort([...nodes.values()].filter(node => node.parentId === null));
}
export function mapStoreCollections(rows: z.infer<typeof nativeCollectionSchema>[]): StoreCollection[] {
  const handles = new Set<string>(), ids = new Set<string>();
  return rows.map(row => {
    if (ids.has(row.id) || handles.has(row.handle)) throw new Error("Duplicate storefront collection.");
    ids.add(row.id); handles.add(row.handle);
    const metadata = row.metadata ?? {};
    const section: StoreCollection["section"] = metadata.snowforce_navigation_section === "hidden" ? null : metadata.snowforce_navigation_section === "sale" || metadata.snowforce_navigation_section == null && row.handle === "sale" ? "sale" : "featured";
    return { id: row.id, handle: row.handle, label: label(row.title, metadata), image: safeProductImage(typeof metadata.snowforce_image === "string" ? metadata.snowforce_image : null), section, rank: typeof metadata.snowforce_navigation_rank === "number" && Number.isFinite(metadata.snowforce_navigation_rank) ? metadata.snowforce_navigation_rank : 0 };
  }).sort((a, b) => a.rank - b.rank || a.label.en.localeCompare(b.label.en));
}
export function isDiscountedProduct(product: StoreProduct) {
  return product.variants.some(variant => variant.available && variant.price !== null && variant.originalPrice !== null && variant.originalPrice > variant.price);
}
