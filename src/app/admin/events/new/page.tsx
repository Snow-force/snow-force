import { EventEditorForm } from "@/components/admin/event-editor-form";
import { EventEditorHeading } from "@/components/admin/event-editor-heading";
import { defaultRegistrationFields } from "@/lib/events/seed";
import type { Event } from "@/lib/types";

const draftEvent: Event = {
  slug: "",
  status: "draft",
  registrationState: "closed",
  title: { en: "", zh: "" },
  subtitle: { en: "", zh: "" },
  description: { en: "", zh: "" },
  highlights: { en: [], zh: [] },
  audienceLevel: { en: "", zh: "" },
  schedule: { en: "", zh: "" },
  location: { en: "", zh: "" },
  locationUrl: "",
  feeInfo: { en: "", zh: "" },
  notices: { en: [], zh: [] },
  coverImage: "",
  media: [],
  capacity: 0,
  registrationCount: 0,
  registrationOpenAt: "",
  registrationCloseAt: "",
  eventStartAt: "",
  eventEndAt: "",
  registrationFields: defaultRegistrationFields,
  tags: { en: [], zh: [] },
  seoTitle: { en: "", zh: "" },
  seoDescription: { en: "", zh: "" },
};

export default function NewEventPage() {
  return (
    <div>
      <EventEditorHeading mode="new" />
      <EventEditorForm event={draftEvent} isNew />
    </div>
  );
}
