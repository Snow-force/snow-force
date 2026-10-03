import { notFound } from "next/navigation";
import { isDesignPreviewEnabled } from "@/lib/design-preview";
import { MemberDashboard } from "@/components/members/member-dashboard";
import { MemberOrdersView } from "@/components/members/member-orders-view";
import { MemberOrderDetail } from "@/components/members/member-order-detail";
import { MemberAddressesView } from "@/components/members/member-addresses-view";
import { previewAddresses, previewDashboard, previewOrders, previewProfile, previewUser } from "@/lib/members/member-center-preview";
import { orderStatusesForFilter, parseOrderFilter } from "@/lib/shop/member-orders";

export default async function MemberDesignPreview(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const searchParams = await props.searchParams;
  if (!isDesignPreviewEnabled()) notFound();
  if (searchParams.view === "addresses") return <MemberAddressesView preview profile={previewProfile} result={{ state: "ready", addresses: previewAddresses }} />;
  if (searchParams.view === "detail") {
    const order = previewOrders.find((item) => item.id === searchParams.id);
    if (!order) notFound();
    return <MemberOrderDetail preview profile={previewProfile} order={order} />;
  }
  if (searchParams.view === "orders") {
    const filter = parseOrderFilter(searchParams.status);
    const orders = previewOrders.filter((order) => orderStatusesForFilter(filter).includes(order.status));
    return <MemberOrdersView preview profile={previewProfile} filter={filter} result={{ state: "ready", orders, count: orders.length, page: 1, hasMore: false }} />;
  }
  return <MemberDashboard preview dashboard={previewDashboard} profile={previewProfile} user={previewUser} searchParams={{}} orders={{ state: "ready", orders: previewOrders, count: previewOrders.length, page: 1, hasMore: false }} />;
}
