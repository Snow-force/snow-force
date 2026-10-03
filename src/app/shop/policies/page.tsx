import type { Metadata } from "next";
import { ShopPolicyView } from "@/components/shop/shop-policy-view";
import { getShopPublishedPolicy } from "@/lib/shop/policy-repository";
import type { ShopPublishedPolicy } from "@/lib/shop/policies";

export const metadata: Metadata = {
  title: "Shipping & Returns · 商城配送与退换政策 | SnowForce",
  description: "Read the current SnowForce gear shop shipping, returns, exchanges, and refund policy.",
};

export default async function ShopPoliciesPage() {
  let policy: ShopPublishedPolicy | null;
  try { policy = await getShopPublishedPolicy(); }
  catch { return <ShopPolicyView policy={null} unavailable />; }
  return <ShopPolicyView policy={policy} unavailable={false} />;
}
