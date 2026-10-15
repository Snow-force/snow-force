import "server-only";
import { cache } from "react";
import { z } from "zod";
import { commerceClient, CommerceUnavailableError, type CommerceRequest } from "./commerce-client";
import { commerceId, mapStoreProduct, nativeProductSchema, type StoreProduct } from "./storefront";
import { buildCategoryTree, flattenCategories, mapStoreCollections, nativeCategorySchema, nativeCollectionSchema, storePromotionSchema, type StoreNavigation } from "./navigation";

const regionsSchema = z.object({ regions: z.array(z.object({ id: commerceId("reg"), currency_code: z.string(), countries: z.array(z.object({ iso_2: z.string() })) })) });
const productsSchema = z.object({ products: z.array(nativeProductSchema), count: z.number().int().nonnegative() });
const categoriesSchema = z.object({ product_categories: z.array(nativeCategorySchema), count: z.number().int().nonnegative() });
const collectionsSchema = z.object({ collections: z.array(nativeCollectionSchema), count: z.number().int().nonnegative() });
export async function loadStoreNavigation(request: CommerceRequest): Promise<StoreNavigation> {
  const [categoryRows, collectionRows, offers] = await Promise.all([
    readPages(request, "/store/product-categories", "id,handle,name,description,rank,parent_category_id,metadata", categoriesSchema, page => page.product_categories),
    readPages(request, "/store/collections", "id,handle,title,metadata", collectionsSchema, page => page.collections),
    request("/store/snowforce/promotions", z.object({ promotions: z.array(storePromotionSchema) })),
  ]);
  const collections = mapStoreCollections(collectionRows);
  return { categories: buildCategoryTree(categoryRows), collections, brands: [], promotions: offers.promotions.filter(offer => collections.some(collection => collection.id === offer.collection_id && collection.section !== null)) };
}
async function readPages<Schema extends z.ZodTypeAny, Item>(request: CommerceRequest, path: string, fields: string, schema: Schema, items: (page: z.output<Schema>) => Item[]): Promise<Item[]> {
  const result: Item[] = [];
  for (let offset = 0; ; ) {
    const params = new URLSearchParams({ limit: "100", offset: String(offset), fields, order: "created_at" });
    const page = await request(`${path}?${params}`, schema);
    const rows = items(page);
    result.push(...rows);
    offset += rows.length;
    if (offset >= page.count) return result;
    if (!rows.length || offset >= 10000) throw new CommerceUnavailableError();
  }
}
export async function getUsCommerceRegion(request: CommerceRequest, configuredId = process.env.MEDUSA_US_REGION_ID) {
  const { regions } = await request("/store/regions?limit=100&fields=id,currency_code,*countries", regionsSchema);
  const matching = regions.filter((region) => region.currency_code.toLowerCase() === "usd" && region.countries.length > 0 && region.countries.every((country) => country.iso_2.toLowerCase() === "us"));
  if (configuredId) { const region = matching.find((item) => item.id === configuredId); if (!region) throw new CommerceUnavailableError(); return region.id; }
  if (matching.length > 1) throw new CommerceUnavailableError();
  return matching[0]?.id ?? null;
}
export async function loadStorefrontCatalog(request: CommerceRequest) {
  const [regionId, navigation] = await Promise.all([getUsCommerceRegion(request), loadStoreNavigation(request)]);
  const products: StoreProduct[] = [];
  const fields = ["id", "handle", "title", "description", "status", "thumbnail", "metadata", "collection_id", "*categories", "*images", "*options", "*options.values", "*variants", "*variants.options", "+variants.inventory_quantity", ...(regionId ? ["+variants.calculated_price"] : [])].join(",");
  const seenProducts = new Set<string>();
  for (let offset = 0; ; ) {
    const params = new URLSearchParams({ limit: "100", offset: String(offset), fields, order: "created_at", ...(regionId ? { region_id: regionId, country_code: "us" } : {}) });
    const page = await request(`/store/products?${params}`, productsSchema);
    for (const item of page.products) {
      if (seenProducts.has(item.id)) throw new CommerceUnavailableError();
      seenProducts.add(item.id);
      const product = mapStoreProduct(item); if (product) products.push(product);
    }
    offset += page.products.length;
    if (offset >= page.count) break;
    if (!page.products.length || offset >= 10000) throw new CommerceUnavailableError();
  }
  const publicCategories = new Set(flattenCategories(navigation.categories).map(category => category.id));
  for (const product of products) {
    product.categoryIds = product.categoryIds.filter(id => publicCategories.has(id));
    product.category = product.categoryIds[0] ?? "";
  }
  navigation.brands = [...new Set(products.map(product => product.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { products, regionId, navigation };
}
export const getStorefrontCatalog = cache(async () => loadStorefrontCatalog(commerceClient()));

/** Cart writes need one current variant, not categories, collections and every SKU. */
export async function loadPurchasableVariant(request: CommerceRequest, variantId: string) {
  const id = commerceId("variant").parse(variantId), regionId = await getUsCommerceRegion(request);
  if (!regionId) return { regionId: null, variant: null };
  const params = new URLSearchParams({ "variants[id]": id, limit: "2", region_id: regionId, country_code: "us", fields: "id,handle,title,status,*variants,+variants.inventory_quantity,+variants.calculated_price" });
  const page = await request(`/store/products?${params}`, productsSchema);
  if (page.count > 1 || page.products.length > 1) throw new CommerceUnavailableError();
  const variant = page.products.flatMap(product => mapStoreProduct(product)?.variants ?? []).find(item => item.id === id) ?? null;
  return { regionId, variant };
}

/** Header navigation never needs regional price calculations or inventory joins. */
export async function loadStorefrontNavigation(request: CommerceRequest) {
  const [navigation, products] = await Promise.all([
    loadStoreNavigation(request),
    readPages(request, "/store/products", "id,status,metadata", z.object({ products: z.array(z.object({ id: commerceId("prod"), status: z.string(), metadata: z.record(z.unknown()).nullable().optional() })), count: z.number().int().nonnegative() }), page => page.products),
  ]);
  navigation.brands = [...new Set(products.filter(product => product.status === "published").flatMap(product => typeof product.metadata?.snowforce_brand === "string" && product.metadata.snowforce_brand.trim() ? [product.metadata.snowforce_brand.trim().slice(0, 80)] : []))].sort((a, b) => a.localeCompare(b));
  return navigation;
}
export const getStorefrontNavigation = cache(async () => loadStorefrontNavigation(commerceClient()));
