"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "../auth/admin";
import type { Event, RegistrationState } from "../types";
import { createRecapFromEvent } from "../recaps/actions";
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
