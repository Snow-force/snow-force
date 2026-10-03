import type { Metadata } from "next";
import { CheckoutView } from "@/components/shop/checkout-view";
export const metadata: Metadata = { title: "Checkout · 结账 | SnowForce", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function CheckoutPage() { return <CheckoutView />; }
