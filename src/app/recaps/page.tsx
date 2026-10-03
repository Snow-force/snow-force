import { RecapsView } from "@/components/recaps/recaps-view";
import { getRecaps } from "@/lib/recaps/repository";

export default async function RecapsPage() {
  const recaps = await getRecaps().catch(() => []);
  return <RecapsView recaps={recaps} />;
}
