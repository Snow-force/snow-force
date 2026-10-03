import { redirect } from "next/navigation";
import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { MemberOrdersView } from "@/components/members/member-orders-view";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { memberConsentPath } from "@/lib/members/member-consents";
import { memberOrderRepository, parseOrderPage } from "@/lib/shop/member-order-repository";
import { parseOrderFilter } from "@/lib/shop/member-orders";

export const dynamic = "force-dynamic";

export default async function MemberOrdersPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const searchParams = await props.searchParams;
  const account = await getCurrentMemberAccount();
  if (account && (!account.privacyAccepted || !account.profile)) redirect(memberConsentPath("/member/orders"));
  if (!account?.profile) return <MemberAuthPanel searchParams={{ ...searchParams, next: "/member/orders" }} />;
  const filter = parseOrderFilter(searchParams.status);
  const result = await memberOrderRepository.list(account.user.id, filter, parseOrderPage(searchParams.page));
  return <MemberOrdersView profile={account.profile} result={result} filter={filter} />;
}
