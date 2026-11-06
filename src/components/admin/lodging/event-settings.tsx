import { requireAdmin } from "@/lib/auth/admin";
import { loadCatalog, lodgingAdminEnabled } from "@/lib/lodging/repository";
import { EventLodgingPackages } from "./catalog";

export async function EventLodgingSettings({ eventSlug }: { eventSlug: string }) {
  await requireAdmin();
  if (!lodgingAdminEnabled()) return <EventLodgingPackages eventSlug={eventSlug} status="disabled" />;
  const catalog = await loadCatalog(eventSlug).catch(() => null);
  return catalog
    ? <EventLodgingPackages eventSlug={eventSlug} catalog={catalog} status="ready" />
    : <EventLodgingPackages eventSlug={eventSlug} status="error" />;
}
