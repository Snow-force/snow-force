import { performanceSampleRate } from "@/lib/shop/performance-contract";
import { ShopProvider } from "@/components/shop/shop-provider";
import { GearNavigation } from "@/components/shop/gear-navigation";
import { getStorefrontNavigation } from "@/lib/shop/storefront-repository";
import { emptyStoreNavigation } from "@/lib/shop/navigation";
import "./shop.css";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const navigation = await getStorefrontNavigation().catch(() => null);
  return <ShopProvider timingSampleRate={performanceSampleRate(process.env.SHOP_PERFORMANCE_TIMING, process.env.SHOP_PERFORMANCE_SAMPLE_RATE)} timingRevision={process.env.RAILWAY_GIT_COMMIT_SHA?.match(/^[a-f0-9]{40}$/)?.[0]}><GearNavigation navigation={navigation ?? emptyStoreNavigation} unavailable={navigation === null} />{children}</ShopProvider>;
}
