import { CatalogListingPage, shopListingMetadata } from "@/components/shop/catalog-listing-page";
export function generateMetadata() { return shopListingMetadata("featured"); }
export default function FeaturedPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) { return CatalogListingPage({ kind: "featured", ...props }); }
