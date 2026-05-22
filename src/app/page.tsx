import { HomePageView } from "@/components/site/home-page-view";
import { getEvents } from "@/lib/events/repository";

export default async function HomePage() {
  try {
    return <HomePageView events={await getEvents()} />;
  } catch {
    return <HomePageView events={[]} eventLoadError />;
  }
}
