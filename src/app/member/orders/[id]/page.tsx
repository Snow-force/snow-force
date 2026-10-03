import { notFound, redirect } from "next/navigation";
import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { MemberOrderDetail } from "@/components/members/member-order-detail";
import { MemberOrdersView } from "@/components/members/member-orders-view";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { memberConsentPath } from "@/lib/members/member-consents";
import { memberOrderRepository } from "@/lib/shop/member-order-repository";
import { getAfterSalesAction } from "@/lib/shop/after-sales-actions";
import { getShopPublishedPolicy } from "@/lib/shop/policy-repository";

export const dynamic = "force-dynamic";

export default async function MemberOrderDetailPage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const account = await getCurrentMemberAccount();
  const next = `/member/orders/${encodeURIComponent(params.id)}`;
  if (account && (!account.privacyAccepted || !account.profile)) redirect(memberConsentPath(next));
  if (!account?.profile) return <MemberAuthPanel searchParams={{ ...searchParams, next }} />;
  const result = await memberOrderRepository.get(account.user.id, params.id);
  if (result.state === "not-found") notFound();
  if (result.state === "unavailable") return <MemberOrdersView profile={account.profile} filter="all" result={{ state: "unavailable", orders: [], count: null, page: 1, hasMore: false }} />;
  const [afterSales, policy] = await Promise.all([
    getAfterSalesAction(result.order.id),
    getShopPublishedPolicy().catch(() => null),
  ]);
  return <MemberOrderDetail profile={account.profile} order={result.order} afterSales={afterSales} supportEmail={policy?.content.customer_service_email} />;
}
