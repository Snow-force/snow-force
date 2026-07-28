import { HomePageView } from "@/components/site/home-page-view";
import { getPublicDisplayEvents } from "@/lib/events/repository";
import { getRecaps } from "@/lib/recaps/repository";

export default async function HomePage() {
  try {
    const [events, recaps] = await Promise.all([getPublicDisplayEvents(), getRecaps()]);
    return <HomePageView events={events} recaps={recaps} />;
  } catch {
    return <HomePageView events={[]} recaps={[]} eventLoadError />;
  }
}
