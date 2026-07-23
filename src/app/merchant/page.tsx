import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantPageProps = {
  readonly searchParams: Record<string, string | undefined>;
};

export default async function MerchantPage({ searchParams }: MerchantPageProps) {
  return <MerchantPortalPage searchParams={searchParams} section="dashboard" />;
}
