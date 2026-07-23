import { MerchantPortalPage } from "@/components/merchants/merchant-portal-page";

type MerchantSettingsPageProps = {
  readonly searchParams: Record<string, string | undefined>;
};

export default async function MerchantSettingsPage({ searchParams }: MerchantSettingsPageProps) {
  return <MerchantPortalPage searchParams={searchParams} section="settings" />;
}
