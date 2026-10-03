import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantSettingsPageProps = {
  readonly searchParams: Promise<Record<string, string | undefined>>;
};

export default async function MerchantSettingsPage(props: MerchantSettingsPageProps) {
  const searchParams = await props.searchParams;
  return <MerchantPortalPage searchParams={searchParams} section="settings" />;
}
