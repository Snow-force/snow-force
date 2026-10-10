import { CatalogListingPage, shopListingMetadata } from "@/components/shop/catalog-listing-page";
export function generateMetadata() { return shopListingMetadata("sale"); }
export default function SalePage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) { return CatalogListingPage({ kind: "sale", ...props }); }
