import { CatalogListingPage, shopListingMetadata } from "@/components/shop/catalog-listing-page";
import { decodeCatalogPageParam } from "@/lib/shop/navigation";
type Props = { params: Promise<{ handle: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) { return shopListingMetadata("category", (await params).handle); }
export default async function CategoryPage({ params, searchParams }: Props) { return CatalogListingPage({ kind: "category", handle: decodeCatalogPageParam((await params).handle), searchParams }); }
