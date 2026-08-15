import { HomePageView } from "@/components/site/home-page-view";
import { selectPublicDisplayEvents } from "@/lib/events/public-display";
import { seedEvents } from "@/lib/events/seed";
import { seedRecaps } from "@/lib/recaps/seed";

export default function DesignPreviewHomePage() {
  return <HomePageView events={selectPublicDisplayEvents(seedEvents)} recaps={seedRecaps} />;
}
