import { EventsView } from "@/components/events/events-view";
import { getEvents } from "@/lib/events/repository";

export default async function EventsPage() {
  try {
    return <EventsView events={await getEvents()} />;
  } catch {
    return <EventsView events={[]} loadError />;
  }
}
