import { requireAdmin } from "@/lib/auth/admin";
import { loadCatalog, lodgingAdminEnabled } from "@/lib/lodging/repository";
import { LodgingCatalog } from "@/components/admin/lodging/catalog";
export default async function LodgingPage() {
  await requireAdmin();
  if (!lodgingAdminEnabled()) return <LodgingCatalog status="disabled" />;
  const catalog = await loadCatalog().catch(() => null);
  return catalog ? <LodgingCatalog status="ready" catalog={catalog} /> : <LodgingCatalog status="error" />;
}
