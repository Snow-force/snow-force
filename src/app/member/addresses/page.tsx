import { redirect } from "next/navigation";
import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { MemberAddressesView } from "@/components/members/member-addresses-view";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { memberConsentPath } from "@/lib/members/member-consents";
import { shippingAddressRepository } from "@/lib/shop/shipping-address-repository";

export const dynamic = "force-dynamic";

export default async function MemberAddressesPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const searchParams = await props.searchParams;
  const account = await getCurrentMemberAccount();
  if (account && (!account.privacyAccepted || !account.profile)) redirect(memberConsentPath("/member/addresses"));
  if (!account?.profile) return <MemberAuthPanel searchParams={{ ...searchParams, next: "/member/addresses" }} />;
  const result = await shippingAddressRepository.list(account.user.id);
  return <MemberAddressesView profile={account.profile} result={result} />;
}
