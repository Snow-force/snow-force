import { EventEditorForm } from "@/components/admin/event-editor-form";
import { EventEditorHeading } from "@/components/admin/event-editor-heading";
import type { Event } from "@/lib/types";
import { DEFAULT_WAIVER_TEXT } from "@/lib/registrations/waiver";

const draftEvent: Event = {
  slug: "",
  status: "draft",
  registrationState: "closed",
  title: { en: "", zh: "" },
  summary: { en: "", zh: "" },
  eventDate: "",
  meetTime: "",
  meetLocation: { en: "", zh: "" },
  activityLocation: { en: "", zh: "" },
  locationUrl: "",
  coverImage: "",
  capacity: 0,
  registrationCount: 0,
  registrationCloseAt: "",
  requiresApproval: false,
  allowWaitlist: false,
  allowCancellation: true,
  feeAmount: "",
  paymentModel: "free",
  depositAmount: null,
  depositCurrency: "usd",
  fullPaymentAmount: null,
  paymentInstructions: { en: "", zh: "" },
  seoTitle: { en: "", zh: "" },
  seoDescription: { en: "", zh: "" },
  registrationQuestions: [],
  detailModules: [
    {
      id: "module-info",
      type: "intro",
      displayMode: "rich_text",
      title: { en: "Info", zh: "活动详情" },
      content: { en: "", zh: "" },
      items: { en: [], zh: [] },
    },
  ],
  waiverTextEn: DEFAULT_WAIVER_TEXT,
  waiverTextSha: null,
  merchantBoothProgram: null,
};

export default function NewEventPage() {
  return (
    <div>
      <EventEditorHeading mode="new" />
      <EventEditorForm event={draftEvent} isNew />
    </div>
  );
}
