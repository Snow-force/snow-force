import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefrontCatalog } from "@/lib/shop/storefront-repository";
import { getShopSupportEmail } from "@/lib/shop/support-repository";
import { emptyStoreNavigation } from "@/lib/shop/navigation";
import { selectCatalogListing, type ListingKind } from "@/lib/shop/catalog-listing";
import { storeFiltersFromSearchParams } from "@/lib/shop/storefront";
import { ShopPageView } from "./shop-page-view";

export async function shopListingMetadata(kind: ListingKind, handle = ""): Promise<Metadata> {
  const catalog = await getStorefrontCatalog().catch(() => null);
  const listing = catalog ? selectCatalogListing(catalog, kind, handle) : null;
  return listing ? { title: `${listing.label.en} · ${listing.label.zh} | SnowForce`, description: listing.description, ...(listing.image ? { openGraph: { images: [listing.image] } } : {}) } : { title: "Gear Shop | SnowForce", robots: { index: false } };
}
export async function CatalogListingPage({ kind, handle = "", searchParams }: { kind: ListingKind; handle?: string; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [catalog, supportEmail, params] = await Promise.all([getStorefrontCatalog().catch(() => null), getShopSupportEmail(), searchParams ?? Promise.resolve({})]);
  const listing = catalog ? selectCatalogListing(catalog, kind, handle) : null;
  if (catalog && !listing) notFound();
  const filters = storeFiltersFromSearchParams(params);
  return <ShopPageView key={`${kind}:${handle}:${JSON.stringify(filters)}`} products={listing?.products ?? []} navigation={catalog?.navigation ?? emptyStoreNavigation} listing={listing ?? { label: { en: "Gear shop", zh: "装备商城" } }} scoped initialFilters={filters} unavailable={catalog === null} supportEmail={supportEmail} />;
}
