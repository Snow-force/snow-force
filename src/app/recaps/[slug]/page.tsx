import { RecapDetailView } from "@/components/recaps/recap-detail-view";
import { getRecap } from "@/lib/recaps/repository";
import { getPublicReviewsForEvent } from "@/lib/reviews/repository";

export default async function RecapDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const recap = await getRecap(params.slug).catch(() => undefined);
  const reviews = recap?.eventSlug
    ? await getPublicReviewsForEvent(recap.eventSlug).catch(() => [])
    : [];
  return <RecapDetailView recap={recap} reviews={reviews} />;
}
