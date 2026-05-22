import { notFound } from "next/navigation";

import { EventEditorForm } from "@/components/admin/event-editor-form";
import { EventEditorHeading } from "@/components/admin/event-editor-heading";
import { validatePublishableEvent } from "@/lib/events/validation";
import { getEventAdmin } from "@/lib/events/repository";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { publishError?: string; saved?: string };
}) {
  const event = await getEventAdmin(params.slug);
  if (!event) notFound();

  const missing = searchParams.publishError ? validatePublishableEvent(event) : [];

  return (
    <div>
      <EventEditorHeading mode="edit" saved={Boolean(searchParams.saved)} missing={missing} />
      <EventEditorForm event={event} isNew={false} />
    </div>
  );
}
