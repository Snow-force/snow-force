import { RecapDetailView } from "@/components/recaps/recap-detail-view";
import { getRecap } from "@/lib/recaps/repository";

export default async function RecapDetailPage({ params }: { params: { slug: string } }) {
  try {
    return <RecapDetailView recap={await getRecap(params.slug)} />;
  } catch {
    return <RecapDetailView recap={undefined} />;
  }
}
