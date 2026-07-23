import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantDashboardPageProps = {
  readonly searchParams: Record<string, string | undefined>;
};

export default async function MerchantDashboardPage({ searchParams }: MerchantDashboardPageProps) {
  return <MerchantPortalPage searchParams={searchParams} section="dashboard" />;
}
