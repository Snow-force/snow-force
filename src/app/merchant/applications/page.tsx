import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantApplicationsPageProps = {
  readonly searchParams: Record<string, string | undefined>;
};

export default async function MerchantApplicationsPage({ searchParams }: MerchantApplicationsPageProps) {
  return <MerchantPortalPage searchParams={searchParams} section="applications" />;
}
