import { AdminEventsUnavailable, AdminEventsView } from "@/components/admin/admin-events-view";
import { getAllEvents } from "@/lib/events/repository";

export default async function AdminEventsPage() {
  let events = [];

  try {
    events = await getAllEvents();
  } catch {
    return <AdminEventsUnavailable />;
  }

  return <AdminEventsView events={events} />;
}
