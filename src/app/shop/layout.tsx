import { ShopProvider } from "@/components/shop/shop-provider";
import { GearNavigation } from "@/components/shop/gear-navigation";
import { getStorefrontNavigation } from "@/lib/shop/storefront-repository";
import { emptyStoreNavigation } from "@/lib/shop/navigation";
import "./shop.css";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const navigation = await getStorefrontNavigation().catch(() => null);
  return <ShopProvider><GearNavigation navigation={navigation ?? emptyStoreNavigation} unavailable={navigation === null} />{children}</ShopProvider>;
}
