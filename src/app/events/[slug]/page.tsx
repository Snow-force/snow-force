import { EventDetailView } from "@/components/events/event-detail-view";
import { getEvent } from "@/lib/events/repository";

export default async function EventDetailPage({ params }: { params: { slug: string } }) {
  try {
    return <EventDetailView event={await getEvent(params.slug)} />;
  } catch {
    return <EventDetailView event={undefined} loadError />;
  }
}
