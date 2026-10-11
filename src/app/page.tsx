import { HomePageView } from "@/components/site/home-page-view";
import { getPublicDisplayEvents } from "@/lib/events/repository";
import { getRecaps } from "@/lib/recaps/repository";
import { getStorefrontCatalog } from "@/lib/shop/storefront-repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { getNewcomerPolicy } from "@/lib/shop/newcomer";

export default async function HomePage() {
  const shop = getStorefrontCatalog().catch(() => ({ products: [] }));
  const content = Promise.all([getPublicDisplayEvents(), getRecaps()])
    .then(([events, recaps]) => ({ events, recaps, eventLoadError: false }))
    .catch(() => ({ events: [], recaps: [], eventLoadError: true }));
  const [home, catalog, newcomerPolicy, account] = await Promise.all([content, shop, getNewcomerPolicy(), getCurrentMemberAccount().catch(() => ({ unavailable: true }))]);
  return <HomePageView {...home} shopProducts={catalog.products} newcomerPolicy={account ? null : newcomerPolicy} />;
}
