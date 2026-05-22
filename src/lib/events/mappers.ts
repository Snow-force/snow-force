import type { Event, RegistrationFieldConfig } from "@/lib/types";

export type EventRow = {
  slug: string;
  status: Event["status"];
  registration_state: Event["registrationState"];
  title_en: string;
  title_zh: string;
  subtitle_en: string | null;
  subtitle_zh: string | null;
  description_en: string | null;
  description_zh: string | null;
  highlights_en: unknown;
  highlights_zh: unknown;
  audience_level_en: string | null;
  audience_level_zh: string | null;
  schedule_en: string | null;
  schedule_zh: string | null;
  location_en: string | null;
  location_zh: string | null;
  location_url: string | null;
  fee_info_en: string | null;
  fee_info_zh: string | null;
  notices_en: unknown;
  notices_zh: unknown;
  cover_image: string | null;
  media: unknown;
  capacity: number;
  registration_open_at: string | null;
  registration_close_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  registration_fields: unknown;
  tags_en: unknown;
  tags_zh: unknown;
  seo_title_en: string | null;
  seo_title_zh: string | null;
  seo_description_en: string | null;
  seo_description_zh: string | null;
};

export type EventWriteRow = {
  slug: string;
  status: Event["status"];
  registration_state: Event["registrationState"];
  title_en: string;
  title_zh: string;
  subtitle_en: string;
  subtitle_zh: string;
  description_en: string;
  description_zh: string;
  highlights_en: string[];
  highlights_zh: string[];
  audience_level_en: string;
  audience_level_zh: string;
  schedule_en: string;
  schedule_zh: string;
  location_en: string;
  location_zh: string;
  location_url: string;
  fee_info_en: string;
  fee_info_zh: string;
  notices_en: string[];
  notices_zh: string[];
  cover_image: string;
  media: string[];
  capacity: number;
  registration_open_at: string | null;
  registration_close_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  registration_fields: RegistrationFieldConfig[];
  tags_en: string[];
  tags_zh: string[];
  seo_title_en: string;
  seo_title_zh: string;
  seo_description_en: string;
  seo_description_zh: string;
};

const registrationFieldTypes = new Set<RegistrationFieldConfig["type"]>([
  "text",
  "email",
  "tel",
  "textarea",
  "select",
]);

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function hasBilingualStrings(value: unknown): value is RegistrationFieldConfig["label"] {
  if (!value || typeof value !== "object") return false;

  const bilingual = value as Record<string, unknown>;
  return typeof bilingual.en === "string" && typeof bilingual.zh === "string";
}

function hasBilingualStringArrays(value: unknown): value is NonNullable<RegistrationFieldConfig["options"]> {
  if (!value || typeof value !== "object") return false;

  const bilingual = value as Record<string, unknown>;
  return stringArray(bilingual.en) === bilingual.en && stringArray(bilingual.zh) === bilingual.zh;
}

function isRegistrationFieldConfig(value: unknown): value is RegistrationFieldConfig {
  if (!value || typeof value !== "object") return false;

  const field = value as Record<string, unknown>;
  const type = field.type as RegistrationFieldConfig["type"];

  return (
    typeof field.key === "string" &&
    hasBilingualStrings(field.label) &&
    registrationFieldTypes.has(type) &&
    typeof field.required === "boolean" &&
    (field.options === undefined || hasBilingualStringArrays(field.options)) &&
    (field.placeholder === undefined || hasBilingualStrings(field.placeholder))
  );
}

function registrationFields(value: unknown): RegistrationFieldConfig[] {
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every(isRegistrationFieldConfig)) {
    throw new Error("Invalid event registration field configuration.");
  }

  return value;
}

function nullableTimestamp(value: string): string | null {
  return value || null;
}

export function rowToEvent(row: EventRow): Event {
  return {
    slug: row.slug,
    status: row.status,
    registrationState: row.registration_state,
    title: { en: row.title_en, zh: row.title_zh },
    subtitle: { en: row.subtitle_en ?? "", zh: row.subtitle_zh ?? "" },
    description: { en: row.description_en ?? "", zh: row.description_zh ?? "" },
    highlights: { en: stringArray(row.highlights_en), zh: stringArray(row.highlights_zh) },
    audienceLevel: { en: row.audience_level_en ?? "", zh: row.audience_level_zh ?? "" },
    schedule: { en: row.schedule_en ?? "", zh: row.schedule_zh ?? "" },
    location: { en: row.location_en ?? "", zh: row.location_zh ?? "" },
    locationUrl: row.location_url ?? "",
    feeInfo: { en: row.fee_info_en ?? "", zh: row.fee_info_zh ?? "" },
    notices: { en: stringArray(row.notices_en), zh: stringArray(row.notices_zh) },
    coverImage: row.cover_image ?? "",
    media: stringArray(row.media),
    capacity: row.capacity,
    registrationCount: 0,
    registrationOpenAt: row.registration_open_at ?? "",
    registrationCloseAt: row.registration_close_at ?? "",
    eventStartAt: row.event_start_at ?? "",
    eventEndAt: row.event_end_at ?? "",
    registrationFields: registrationFields(row.registration_fields),
    tags: { en: stringArray(row.tags_en), zh: stringArray(row.tags_zh) },
    seoTitle: { en: row.seo_title_en ?? "", zh: row.seo_title_zh ?? "" },
    seoDescription: {
      en: row.seo_description_en ?? "",
      zh: row.seo_description_zh ?? "",
    },
  };
}

export function eventToRow(event: Event): EventWriteRow {
  return {
    slug: event.slug,
    status: event.status,
    registration_state: event.registrationState,
    title_en: event.title.en,
    title_zh: event.title.zh,
    subtitle_en: event.subtitle.en,
    subtitle_zh: event.subtitle.zh,
    description_en: event.description.en,
    description_zh: event.description.zh,
    highlights_en: event.highlights.en,
    highlights_zh: event.highlights.zh,
    audience_level_en: event.audienceLevel.en,
    audience_level_zh: event.audienceLevel.zh,
    schedule_en: event.schedule.en,
    schedule_zh: event.schedule.zh,
    location_en: event.location.en,
    location_zh: event.location.zh,
    location_url: event.locationUrl,
    fee_info_en: event.feeInfo.en,
    fee_info_zh: event.feeInfo.zh,
    notices_en: event.notices.en,
    notices_zh: event.notices.zh,
    cover_image: event.coverImage,
    media: event.media,
    capacity: event.capacity,
    registration_open_at: nullableTimestamp(event.registrationOpenAt),
    registration_close_at: nullableTimestamp(event.registrationCloseAt),
    event_start_at: nullableTimestamp(event.eventStartAt),
    event_end_at: nullableTimestamp(event.eventEndAt),
    registration_fields: event.registrationFields,
    tags_en: event.tags.en,
    tags_zh: event.tags.zh,
    seo_title_en: event.seoTitle.en,
    seo_title_zh: event.seoTitle.zh,
    seo_description_en: event.seoDescription.en,
    seo_description_zh: event.seoDescription.zh,
  };
}
