import { CatalogListingPage, shopListingMetadata } from "@/components/shop/catalog-listing-page";
export function generateMetadata() { return shopListingMetadata("brands"); }
export default function BrandsPage() { return CatalogListingPage({ kind: "brands" }); }
