import { CatalogListingPage, shopListingMetadata } from "@/components/shop/catalog-listing-page";
import { decodeCatalogPageParam } from "@/lib/shop/navigation";
type Props = { params: Promise<{ handle: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) { return shopListingMetadata("collection", (await params).handle); }
export default async function CollectionPage({ params, searchParams }: Props) { return CatalogListingPage({ kind: "collection", handle: decodeCatalogPageParam((await params).handle), searchParams }); }
