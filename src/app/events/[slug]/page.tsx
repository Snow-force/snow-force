import { EventDetailView } from "@/components/events/event-detail-view";
import { getEvent } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";

export default async function EventDetailPage({ params }: { params: { slug: string } }) {
  const account = await getCurrentMemberAccount();
  try {
    return <EventDetailView event={await getEvent(params.slug)} memberProfile={account?.profile ?? null} emailConfirmed={account?.emailConfirmed ?? false} />;
  } catch {
    return <EventDetailView event={undefined} loadError memberProfile={account?.profile ?? null} emailConfirmed={account?.emailConfirmed ?? false} />;
  }
}
