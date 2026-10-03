import { EventsView } from "@/components/events/events-view";
import { getPublicDisplayEvents } from "@/lib/events/repository";

export default async function EventsPage() {
  const result = await getPublicDisplayEvents()
    .then((events) => ({ events, loadError: false }))
    .catch(() => ({ events: [], loadError: true }));
  return <EventsView {...result} />;
}
