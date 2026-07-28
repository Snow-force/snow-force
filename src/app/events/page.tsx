import { EventsView } from "@/components/events/events-view";
import { getPublicDisplayEvents } from "@/lib/events/repository";

export default async function EventsPage() {
  try {
    return <EventsView events={await getPublicDisplayEvents()} />;
  } catch {
    return <EventsView events={[]} loadError />;
  }
}
