import { RecapDetailView } from "@/components/recaps/recap-detail-view";
import { getRecap } from "@/lib/recaps/repository";
import { getPublicReviewsForEvent } from "@/lib/reviews/repository";

export default async function RecapDetailPage({ params }: { params: { slug: string } }) {
  try {
    const recap = await getRecap(params.slug);
    const reviews = recap?.eventSlug
      ? await getPublicReviewsForEvent(recap.eventSlug).catch(() => [])
      : [];
    return <RecapDetailView recap={recap} reviews={reviews} />;
  } catch {
    return <RecapDetailView recap={undefined} reviews={[]} />;
  }
}
