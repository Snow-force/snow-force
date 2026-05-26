import { AdminRecapsView } from "@/components/admin/admin-recaps-view";
import { getAllRecaps } from "@/lib/recaps/repository";

export default async function AdminRecapsPage() {
  return <AdminRecapsView initialRecaps={await getAllRecaps()} />;
}
