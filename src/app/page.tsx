import { HomePageView } from "@/components/site/home-page-view";
import { getHomeEvents, getHomeRecaps, getHomeProducts } from "@/lib/home/repository";

export default async function HomePage() {
  const [schedule, recaps, shopProducts] = await Promise.all([
    getHomeEvents().then(events => ({ events, eventLoadError: false })).catch(() => ({ events: [], eventLoadError: true })),
    getHomeRecaps().catch(() => []),
    getHomeProducts().catch(() => []),
  ]);
  return <HomePageView {...schedule} recaps={recaps} shopProducts={shopProducts} />;
}
