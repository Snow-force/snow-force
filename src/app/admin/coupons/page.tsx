import { AdminCouponsView } from "@/components/admin/admin-coupons-view";
import { getCouponRedemptionCount, getCoupons } from "@/lib/coupons/repository";

export default async function AdminCouponsPage() {
  const coupons = await getCoupons();
  const redemptionCounts = await Promise.all(coupons.map((coupon) => getCouponRedemptionCount(coupon.code)));
  return <AdminCouponsView coupons={coupons} redemptionCounts={redemptionCounts} />;
}
