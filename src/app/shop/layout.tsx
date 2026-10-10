import { ShopProvider } from "@/components/shop/shop-provider";
import { GearNavigation } from "@/components/shop/gear-navigation";
import { getStorefrontCatalog } from "@/lib/shop/storefront-repository";
import { emptyStoreNavigation } from "@/lib/shop/navigation";
import "./shop.css";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getStorefrontCatalog().catch(() => null);
  return <ShopProvider><GearNavigation navigation={catalog?.navigation ?? emptyStoreNavigation} unavailable={catalog === null} />{children}</ShopProvider>;
}
