import "server-only";
import { cache } from "react";
import { z } from "zod";
import { commerceClient, CommerceUnavailableError, type CommerceRequest } from "./commerce-client";
import { commerceId, mapStoreProduct, nativeProductSchema, type StoreProduct } from "./storefront";

const regionsSchema = z.object({ regions: z.array(z.object({ id: commerceId("reg"), currency_code: z.string(), countries: z.array(z.object({ iso_2: z.string() })) })) });
const productsSchema = z.object({ products: z.array(nativeProductSchema), count: z.number().int().nonnegative() });
export async function getUsCommerceRegion(request: CommerceRequest, configuredId = process.env.MEDUSA_US_REGION_ID) {
  const { regions } = await request("/store/regions?limit=100&fields=id,currency_code,*countries", regionsSchema);
  const matching = regions.filter((region) => region.currency_code.toLowerCase() === "usd" && region.countries.length > 0 && region.countries.every((country) => country.iso_2.toLowerCase() === "us"));
  if (configuredId) { const region = matching.find((item) => item.id === configuredId); if (!region) throw new CommerceUnavailableError(); return region.id; }
  if (matching.length > 1) throw new CommerceUnavailableError();
  return matching[0]?.id ?? null;
}
export async function loadStorefrontCatalog(request: CommerceRequest) {
  const regionId = await getUsCommerceRegion(request);
  const products: StoreProduct[] = [];
  const fields = ["id", "handle", "title", "description", "status", "thumbnail", "metadata", "*images", "*options", "*options.values", "*variants", "*variants.options", "+variants.inventory_quantity", ...(regionId ? ["+variants.calculated_price"] : [])].join(",");
  for (let offset = 0; ; offset += 100) {
    const params = new URLSearchParams({ limit: "100", offset: String(offset), fields, ...(regionId ? { region_id: regionId, country_code: "us" } : {}) });
    const page = await request(`/store/products?${params}`, productsSchema);
    for (const item of page.products) { const product = mapStoreProduct(item); if (product) products.push(product); }
    if (offset + page.products.length >= page.count) break;
    if (!page.products.length || offset >= 9900) throw new CommerceUnavailableError();
  }
  return { products, regionId };
}
export const getStorefrontCatalog = cache(async () => loadStorefrontCatalog(commerceClient()));
