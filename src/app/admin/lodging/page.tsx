import { requireAdmin } from "@/lib/auth/admin";
import { loadCatalog, lodgingAdminEnabled } from "@/lib/lodging/repository";
import { LodgingCatalog } from "@/components/admin/lodging/catalog";
import { getAdminEventHistory } from "@/lib/events/repository";
export default async function LodgingPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  await requireAdmin();
  if (!lodgingAdminEnabled()) return <LodgingCatalog status="disabled" />;
  const params = await searchParams;
  const data = await Promise.all([loadCatalog(), getAdminEventHistory()]).catch(() => null);
  if (!data) return <LodgingCatalog status="error" />;
  const [catalog, allEvents] = data;
  const events = allEvents.map(({ slug, title, eventDate }) => ({ slug, title, eventDate }));
  const initialEventSlug = events.some(event => event.slug === params.event) ? params.event ?? "" : "";
  return <LodgingCatalog key={initialEventSlug} status="ready" catalog={catalog} events={events} initialEventSlug={initialEventSlug} />;
}
