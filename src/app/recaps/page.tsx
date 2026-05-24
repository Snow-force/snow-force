import { RecapsView } from "@/components/recaps/recaps-view";
import { getRecaps } from "@/lib/recaps/repository";

export default async function RecapsPage() {
  try {
    return <RecapsView recaps={await getRecaps()} />;
  } catch {
    return <RecapsView recaps={[]} />;
  }
}
