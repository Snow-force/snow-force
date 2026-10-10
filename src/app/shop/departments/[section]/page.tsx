import { CatalogListingPage, shopListingMetadata } from "@/components/shop/catalog-listing-page";
type Props = { params: Promise<{ section: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) { return shopListingMetadata("department", (await params).section); }
export default async function DepartmentPage({ params, searchParams }: Props) { return CatalogListingPage({ kind: "department", handle: (await params).section, searchParams }); }
