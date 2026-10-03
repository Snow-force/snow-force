import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantDashboardPageProps = {
  readonly searchParams: Promise<Record<string, string | undefined>>;
};

export default async function MerchantDashboardPage(props: MerchantDashboardPageProps) {
  const searchParams = await props.searchParams;
  return <MerchantPortalPage searchParams={searchParams} section="dashboard" />;
}
