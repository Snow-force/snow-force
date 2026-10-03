import { ShopProvider } from "@/components/shop/shop-provider";
import "./shop.css";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <ShopProvider>{children}</ShopProvider>;
}
