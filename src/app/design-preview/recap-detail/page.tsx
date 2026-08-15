import { RecapDetailView } from "@/components/recaps/recap-detail-view";
import { seedRecaps } from "@/lib/recaps/seed";

const featuredRecap = seedRecaps.find((recap) => recap.status === "published");

export default function DesignPreviewRecapDetailPage() {
  return <RecapDetailView recap={featuredRecap} reviews={[]} />;
}
