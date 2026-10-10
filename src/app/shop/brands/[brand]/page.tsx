import { CatalogListingPage, shopListingMetadata } from "@/components/shop/catalog-listing-page";
import { decodeCatalogPageParam } from "@/lib/shop/navigation";
type Props = { params: Promise<{ brand: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) { return shopListingMetadata("brand", (await params).brand); }
export default async function BrandPage({ params, searchParams }: Props) { return CatalogListingPage({ kind: "brand", handle: decodeCatalogPageParam((await params).brand), searchParams }); }
