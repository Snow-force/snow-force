import { notFound } from "next/navigation";
import Link from "next/link";

import { EventEditorForm } from "@/components/admin/event-editor-form";
import { EventEditorHeading } from "@/components/admin/event-editor-heading";
import { validatePublishableEvent } from "@/lib/events/validation";
import { getEventAdmin } from "@/lib/events/repository";
import { EventLodgingSettings } from "@/components/admin/lodging/event-settings";

export default async function EditEventPage(
  props: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ publishError?: string; saved?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const event = await getEventAdmin(params.slug);
  if (!event) notFound();

  const missing = searchParams.publishError ? validatePublishableEvent(event) : [];

  return (
    <div>
      <EventEditorHeading mode="edit" saved={Boolean(searchParams.saved)} missing={missing} />
      <Link className="mb-4 inline-block rounded border px-3 py-2 text-sm" href={`/admin/events/promotion?source=${encodeURIComponent(event.slug)}`}>Email promotion / 邮件推广</Link>
      <EventEditorForm event={event} isNew={false} />
      <EventLodgingSettings eventSlug={event.slug} />
    </div>
  );
}
