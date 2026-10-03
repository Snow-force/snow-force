import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantPageProps = {
  readonly searchParams: Promise<Record<string, string | undefined>>;
};

export default async function MerchantPage(props: MerchantPageProps) {
  const searchParams = await props.searchParams;
  return <MerchantPortalPage searchParams={searchParams} section="dashboard" />;
}
