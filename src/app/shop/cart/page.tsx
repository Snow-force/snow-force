import type { Metadata } from "next";
import { CartPageView } from "@/components/shop/cart-page-view";
export const metadata: Metadata = { title: "Cart · 购物车 | SnowForce", robots: { index: false, follow: false } };
export default function CartPage() { return <CartPageView />; }
