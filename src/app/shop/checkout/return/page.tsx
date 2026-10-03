import type { Metadata } from "next";
import { CheckoutView } from "@/components/shop/checkout-view";
export const metadata: Metadata = { title: "Order status · 订单状态 | SnowForce", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function CheckoutReturnPage() { return <CheckoutView completing />; }
