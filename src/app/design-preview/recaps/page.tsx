import { RecapsView } from "@/components/recaps/recaps-view";
import { seedRecaps } from "@/lib/recaps/seed";

export default function DesignPreviewRecapsPage() {
  return <RecapsView recaps={seedRecaps.filter((recap) => recap.status === "published")} />;
}
