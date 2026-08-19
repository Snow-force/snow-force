"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "../auth/admin";
import { createAdminClient } from "../supabase/server";
import type { Event, RegistrationState } from "../types";
import { createRecapFromEvent } from "../recaps/actions";
import { computeWaiverSha } from "../registrations/waiver";
import { createEvent, getEventAdmin, updateEvent } from "./repository";
import { parseEventEditorInput, validatePublishableEvent } from "./validation";
import { translateEventToChinese } from "../admin/translate-content";

export type EventEditorState = {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type UploadEventCoverState = {
  success: boolean;
  url?: string;
  message?: string;
};

type PublishDependencies = {
  load(slug: string): Promise<Event | undefined>;
  save(slug: string, data: Partial<Event>): Promise<Event | undefined>;
};

const EVENT_COVER_BUCKET = "event-covers";
const EVENT_COVER_MAX_BYTES = 6 * 1024 * 1024;
const EVENT_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function safePathSegment(value: string, fallback: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function safeEventCoverPath(slug: string, fileName: string) {
  const eventSegment = safePathSegment(slug, "draft");
  const fileSegment = safePathSegment(fileName, "cover");
  return `events/${eventSegment}/${Date.now()}-${fileSegment}`;
}

function eventCoverFolder(slug: string) {
  return `events/${safePathSegment(slug, "draft")}`;
}

function eventCoverObjectPath(folder: string, name: string) {
  return `${folder}/${name}`;
}

function eventCoverObjectPathFromUrl(value: string, eventSlug: string) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const prefix = `/storage/v1/object/public/${EVENT_COVER_BUCKET}/`;
    if (!url.pathname.startsWith(prefix)) return undefined;

    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const eventPrefix = `${eventCoverFolder(eventSlug)}/`;
    return path.startsWith(eventPrefix) ? path : undefined;
  } catch {
    return undefined;
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function formText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readEditorPayload(formData: FormData) {
  const raw = formText(formData, "eventPayload");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { __invalidPayload: true };
  }
}

function refreshEventPaths(slug: string) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/events");
}

export async function uploadEventCoverAction(
  _state: UploadEventCoverState,
  formData: FormData,
): Promise<UploadEventCoverState> {
  await requireAdmin();

  const file = formData.get("coverImage");
  if (!isUploadFile(file) || file.size === 0) {
    return { success: false, message: "Choose a cover image to upload." };
  }

  if (!EVENT_COVER_TYPES.has(file.type)) {
    return { success: false, message: "Upload a JPG, PNG, WebP, or GIF image." };
  }

  if (file.size > EVENT_COVER_MAX_BYTES) {
    return { success: false, message: "Cover image must be 6MB or smaller." };
  }

  const path = safeEventCoverPath(formText(formData, "slug"), file.name);
  const bucket = createAdminClient().storage.from(EVENT_COVER_BUCKET);
  const { error } = await bucket.upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  const { data } = bucket.getPublicUrl(path);
  const originalSlug = formText(formData, "originalSlug");

  if (originalSlug) {
    try {
      const currentEvent = await getEventAdmin(originalSlug);
      const previousCoverPath = currentEvent?.coverImage
        ? eventCoverObjectPathFromUrl(currentEvent.coverImage, originalSlug)
        : undefined;
      const saved = await updateEvent(originalSlug, { coverImage: data.publicUrl });
      if (!saved) return { success: false, message: "Event cover image could not be saved." };
      if (currentEvent) {
        const folder = eventCoverFolder(originalSlug);
        const { data: existingCovers, error: listError } = await bucket.list(folder, { limit: 1000 });
        if (listError) return { success: false, message: listError.message };

        const staleCoverPaths = (existingCovers ?? [])
          .map((cover) => eventCoverObjectPath(folder, cover.name))
          .filter((coverPath) => coverPath !== path);
        if (previousCoverPath && previousCoverPath !== path && !staleCoverPaths.includes(previousCoverPath)) {
          staleCoverPaths.push(previousCoverPath);
        }
        if (staleCoverPaths.length > 0) {
          const { error: removeError } = await bucket.remove(staleCoverPaths);
          if (removeError) return { success: false, message: removeError.message };
        }
      }
      refreshEventPaths(originalSlug);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Event cover image could not be saved.",
      };
    }
  }

  return { success: true, url: data.publicUrl };
}

export async function saveEventAction(
  _state: EventEditorState,
  formData: FormData,
): Promise<EventEditorState> {
  await requireAdmin();

  const parsed = parseEventEditorInput(readEditorPayload(formData));
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

  if (parsed.data.status === "published") {
    const missingFields = validatePublishableEvent(parsed.data);
    if (missingFields.length) {
      return {
        success: false,
        message: "Complete required event fields before publishing.",
        fieldErrors: Object.fromEntries(
          missingFields.map((field) => [field, ["Required before publishing."]]),
        ),
      };
    }
  }

  let saved: Event | undefined;
  let translationWarning = false;
  try {
    const serverComputedSha = parsed.data.waiverTextEn
      ? await computeWaiverSha(parsed.data.waiverTextEn)
      : null;
    const eventData = { ...parsed.data, waiverTextSha: serverComputedSha };
    let translatedEventData = eventData;
    try {
      translatedEventData = await translateEventToChinese(eventData);
    } catch (error) {
      translationWarning = true;
      console.error("[saveEventAction] Chinese translation failed", error);
    }

    saved = originalSlug
      ? await updateEvent(originalSlug, translatedEventData)
      : await createEvent(translatedEventData);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Event could not be saved.",
    };
  }

  if (!saved) return { success: false, message: "Event could not be saved." };

  refreshEventPaths(saved.slug);
  if (translationWarning) {
    return { success: true, message: "Saved in English. Chinese translation could not be refreshed." };
  }
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

export async function archiveEventResult(dependencies: PublishDependencies, slug: string) {
  const event = await dependencies.load(slug);
  if (!event) return { success: false as const, message: "Event not found." };

  const saved = await dependencies.save(slug, { status: "archived", registrationState: "closed" });
  return saved
    ? { success: true as const, event: saved }
    : { success: false as const, message: "Event could not be archived." };
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

export async function archiveEventAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");

  const event = await getEventAdmin(slug);
  if (!event) redirect("/admin/events");

  await archiveEventResult({ load: getEventAdmin, save: updateEvent }, slug);

  // Auto-create a recap entry so admin can manage it in recap management
  try {
    await createRecapFromEvent(event);
  } catch {
    // Recap creation is best-effort; don't block the archive action
  }

  refreshEventPaths(slug);
  revalidatePath("/admin/recaps");
  redirect(`/admin/recaps?archived=${slug}`);
}

export async function setRegistrationStateAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const registrationState = formText(formData, "registrationState") as RegistrationState;
  if (!["open", "closed", "full"].includes(registrationState)) return;

  await updateEvent(slug, { registrationState });
  refreshEventPaths(slug);
}
