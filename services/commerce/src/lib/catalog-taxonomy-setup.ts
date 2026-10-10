type Category = { id: string; handle: string; parent_category_id: string | null; is_active: boolean; is_internal: boolean };
type Product = { id: string; metadata: Record<string, unknown> | null; categoryIds: string[] };
type Definition = { handle: string; name: string; nameZh: string; parent: string | null; section?: string; rank: number };
// One-time migration from the former storefront labels. Ongoing navigation reads
// native categories, not this list, so operators can add arbitrary descendants.
export const initialCatalogCategories: Definition[] = [
  { handle: "men", name: "Men", nameZh: "男士", parent: null, section: "men", rank: 0 },
  { handle: "women", name: "Women", nameZh: "女士", parent: null, section: "women", rank: 1 },
  { handle: "kids", name: "Kids", nameZh: "儿童", parent: null, section: "kids", rank: 2 },
  { handle: "ski-snowboard", name: "Ski & Snowboard", nameZh: "双板与单板", parent: null, section: "ski-snowboard", rank: 3 },
  { handle: "accessories", name: "Accessories", nameZh: "配件", parent: null, section: "accessories", rank: 4 },
  { handle: "snow-apparel", name: "Snow Apparel", nameZh: "滑雪服饰", parent: "ski-snowboard", rank: 0 },
  { handle: "kids-snow-apparel", name: "Kids Snow Apparel", nameZh: "儿童滑雪服饰", parent: "kids", rank: 0 },
  { handle: "goggles", name: "Goggles", nameZh: "雪镜", parent: "accessories", rank: 0 },
  { handle: "helmets-accessories", name: "Helmets & Accessories", nameZh: "头盔与配件", parent: "accessories", rank: 1 },
];
const legacyTargets: Record<string, string> = { outerwear: "snow-apparel", kids: "kids-snow-apparel", goggles: "goggles", accessories: "helmets-accessories" };
export async function initializeCatalogTaxonomy(dependencies: {
  categories(): Promise<Category[]>;
  create(input: { name: string; handle: string; parent_category_id: string | null; rank: number; is_active: true; is_internal: false; metadata: Record<string, unknown> }): Promise<Category>;
  products(): Promise<Product[]>;
  add(categoryId: string, productId: string): Promise<void>;
}) {
  const existing = await dependencies.categories(), byHandle = new Map(existing.map(category => [category.handle, category]));
  if (byHandle.size !== existing.length) throw new Error("Inspect duplicate native category handles before migration.");
  // Review all collisions before making the first change. Never reparent, unhide
  // or activate a category that an operator has configured differently.
  for (const definition of initialCatalogCategories) {
    const current = byHandle.get(definition.handle);
    if (!current) continue;
    const parent = definition.parent ? byHandle.get(definition.parent)?.id : null;
    if (!current.is_active || current.is_internal || current.parent_category_id !== parent) throw new Error(`Review existing category ${definition.handle}; its visibility or parent differs.`);
  }
  const result = { created: 0, linked: 0, preserved: 0, unmapped: 0 };
  for (const definition of initialCatalogCategories) {
    if (byHandle.has(definition.handle)) continue;
    const category = await dependencies.create({ name: definition.name, handle: definition.handle, parent_category_id: definition.parent ? byHandle.get(definition.parent)!.id : null, rank: definition.rank, is_active: true, is_internal: false, metadata: { snowforce_name_zh: definition.nameZh, ...(definition.section ? { snowforce_navigation_section: definition.section } : {}) } });
    if (category.handle !== definition.handle) throw new Error("Native category creation returned an unexpected handle.");
    byHandle.set(category.handle, category); result.created++;
  }
  for (const product of await dependencies.products()) {
    if (product.categoryIds.length) { result.preserved++; continue; }
    const legacy = product.metadata?.snowforce_category;
    const handle = typeof legacy === "string" ? legacyTargets[legacy] : undefined;
    if (!handle) { result.unmapped++; continue; }
    await dependencies.add(byHandle.get(handle)!.id, product.id); result.linked++;
  }
  return result;
}
