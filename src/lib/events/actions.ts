"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "../auth/admin";
import type { Event, RegistrationFieldConfig, RegistrationState } from "../types";
import { createEvent, getEventAdmin, updateEvent } from "./repository";
import { parseEventEditorInput, validatePublishableEvent } from "./validation";

export type EventEditorState = {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

type PublishDependencies = {
  load(slug: string): Promise<Event | undefined>;
  save(slug: string, data: Partial<Event>): Promise<Event | undefined>;
};

function formText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bilingual(formData: FormData, key: string) {
  return {
    en: formText(formData, `${key}.en`),
    zh: formText(formData, `${key}.zh`),
  };
}

function bilingualLines(formData: FormData, key: string) {
  return {
    en: lines(formText(formData, `${key}.en`)),
    zh: lines(formText(formData, `${key}.zh`)),
  };
}

function readRegistrationFields(formData: FormData): RegistrationFieldConfig[] | unknown {
  const raw = formText(formData, "registrationFields");
  if (!raw) return [];

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return "Invalid registration field JSON.";
  }
}

function editorInput(formData: FormData) {
  return {
    slug: formText(formData, "slug"),
    status: formText(formData, "status") || "draft",
    registrationState: formText(formData, "registrationState") || "closed",
    title: bilingual(formData, "title"),
    subtitle: bilingual(formData, "subtitle"),
    description: bilingual(formData, "description"),
    highlights: bilingualLines(formData, "highlights"),
    audienceLevel: bilingual(formData, "audienceLevel"),
    schedule: bilingual(formData, "schedule"),
    location: bilingual(formData, "location"),
    locationUrl: formText(formData, "locationUrl"),
    feeInfo: bilingual(formData, "feeInfo"),
    notices: bilingualLines(formData, "notices"),
    coverImage: formText(formData, "coverImage"),
    media: lines(formText(formData, "media")),
    capacity: formText(formData, "capacity"),
    registrationCount: formText(formData, "registrationCount") || "0",
    registrationOpenAt: formText(formData, "registrationOpenAt"),
    registrationCloseAt: formText(formData, "registrationCloseAt"),
    eventStartAt: formText(formData, "eventStartAt"),
    eventEndAt: formText(formData, "eventEndAt"),
    registrationFields: readRegistrationFields(formData),
    tags: bilingualLines(formData, "tags"),
    seoTitle: bilingual(formData, "seoTitle"),
    seoDescription: bilingual(formData, "seoDescription"),
  };
}

function refreshEventPaths(slug: string) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/events");
}

export async function saveEventAction(
  _state: EventEditorState,
  formData: FormData,
): Promise<EventEditorState> {
  await requireAdmin();

  const parsed = parseEventEditorInput(editorInput(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the event fields before saving.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const originalSlug = formText(formData, "originalSlug");
  if (originalSlug && originalSlug !== parsed.data.slug) {
    return {
      success: false,
      message: "Existing event slugs cannot be changed.",
      fieldErrors: { slug: ["Create a new event if the URL slug needs to change."] },
    };
  }

  let saved: Event | undefined;
  try {
    saved = originalSlug
      ? await updateEvent(originalSlug, parsed.data)
      : await createEvent(parsed.data);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Event could not be saved.",
    };
  }

  if (!saved) return { success: false, message: "Event could not be saved." };

  refreshEventPaths(saved.slug);
  redirect(`/admin/events/${saved.slug}/edit?saved=1`);
}

export async function publishEventResult(dependencies: PublishDependencies, slug: string) {
  const event = await dependencies.load(slug);
  if (!event) return { success: false as const, message: "Event not found." };

  const missingFields = validatePublishableEvent(event);
  if (missingFields.length) {
    return {
      success: false as const,
      message: "Complete required event fields before publishing.",
      missingFields,
    };
  }

  const saved = await dependencies.save(slug, { status: "published" });
  return saved
    ? { success: true as const, event: saved }
    : { success: false as const, message: "Event could not be published." };
}

export async function publishEventAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const result = await publishEventResult(
    { load: getEventAdmin, save: updateEvent },
    slug,
  );

  if (!result.success) redirect(`/admin/events/${slug}/edit?publishError=1`);

  refreshEventPaths(slug);
  redirect("/admin/events");
}

export async function unpublishEventAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  await updateEvent(slug, { status: "draft" });
  refreshEventPaths(slug);
}

export async function setRegistrationStateAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const registrationState = formText(formData, "registrationState") as RegistrationState;
  if (!["open", "closed", "full"].includes(registrationState)) return;

  await updateEvent(slug, { registrationState });
  refreshEventPaths(slug);
}
