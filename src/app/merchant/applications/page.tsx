import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantApplicationsPageProps = {
  readonly searchParams: Promise<Record<string, string | undefined>>;
};

export default async function MerchantApplicationsPage(props: MerchantApplicationsPageProps) {
  const searchParams = await props.searchParams;
  return <MerchantPortalPage searchParams={searchParams} section="applications" />;
}
