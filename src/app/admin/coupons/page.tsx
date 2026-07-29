import { AdminCouponsView } from "@/components/admin/admin-coupons-view";
import { getCouponRedemptionCount, getCoupons } from "@/lib/coupons/repository";
import { getAllEvents } from "@/lib/events/repository";

export default async function AdminCouponsPage() {
  const [coupons, events] = await Promise.all([getCoupons(), getAllEvents()]);
  const redemptionCounts = await Promise.all(coupons.map((coupon) => getCouponRedemptionCount(coupon.code)));
  return <AdminCouponsView coupons={coupons} redemptionCounts={redemptionCounts} events={events} />;
}
