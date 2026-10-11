import { requireAdmin } from "@/lib/auth/admin";
import { MarketingEditor } from "@/components/admin/marketing-editor";
export default async function EventPromotionPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  await requireAdmin();
  const { source } = await searchParams;
  return <MarketingEditor endpoint="/admin/events/promotion/api" surface="event" initialSource={source ?? ""} />;
}
