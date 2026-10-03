import type { Metadata } from "next";
import { ShopPageView } from "@/components/shop/shop-page-view";
import { storeFiltersFromSearchParams } from "@/lib/shop/storefront";
import { getStorefrontCatalog } from "@/lib/shop/storefront-repository";

export const metadata: Metadata = {
  title: "Gear Shop · 装备商城 | SnowForce",
  description: "Explore snow apparel, goggles and kids' gear from SnowForce. Shop available styles with prices in USD.",
};
export default async function ShopPage(
  props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams ?? {};
  const filters = storeFiltersFromSearchParams(searchParams);
  const catalog = await getStorefrontCatalog().catch(() => null);
  return <ShopPageView key={JSON.stringify(filters)} products={catalog?.products ?? []} unavailable={catalog === null} initialFilters={filters} />;
}
