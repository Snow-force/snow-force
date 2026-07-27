"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "../auth/admin";
import { updateEvent } from "../events/repository";
import { createAdminClient } from "../supabase/server";
import type { Event, EventRecap, RecapMediaItem } from "../types";
import { insertRecap, getRecapAdmin, updateRecap } from "./repository";
import {
  addMediaItems,
  deleteMediaItem,
  moveMediaItem,
  setCoverMediaItem,
  updateMediaCaption,
} from "./media-helpers";

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT"))
  );
}

const RECAP_MEDIA_BUCKET = "recap-media";
const RECAP_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const RECAP_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function safePathSegment(value: string, fallback: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function safeRecapMediaPath(slug: string, fileName: string) {
  const recapSegment = safePathSegment(slug, "recap");
  const fileSegment = safePathSegment(fileName, "media");
  return `recaps/${recapSegment}/${Date.now()}-${fileSegment}`;
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

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

function mediaItems(formData: FormData): RecapMediaItem[] {
  const urls = lines(formText(formData, "mediaUrls"));
  const captionsEn = lines(formText(formData, "mediaCaptions.en"));
  const captionsZh = lines(formText(formData, "mediaCaptions.zh"));
  return urls.map((url, i) => ({
    id: crypto.randomUUID(),
    type: "image" as const,
    url,
    storagePath: "",
    caption: {
      en: captionsEn[i] ?? "",
      zh: captionsZh[i] ?? "",
    },
    order: i,
    isCover: i === 0,
  }));
}

function recapEditorInput(formData: FormData): Partial<EventRecap> {
  return {
    status: (formText(formData, "status") || "draft") as EventRecap["status"],
    title: bilingual(formData, "title"),
    summary: bilingual(formData, "summary"),
    content: bilingual(formData, "content"),
    date: formText(formData, "date"),
    location: bilingual(formData, "location"),
    coverImage: formText(formData, "coverImage"),
    media: mediaItems(formData),
    tags: bilingualLines(formData, "tags"),
    seoTitle: bilingual(formData, "seoTitle"),
    seoDescription: bilingual(formData, "seoDescription"),
  };
}

function isBilingualText(value: unknown): value is EventRecap["title"] {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { en?: unknown }).en === "string" &&
    typeof (value as { zh?: unknown }).zh === "string"
  );
}

function isBilingualList(value: unknown): value is EventRecap["tags"] {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { en?: unknown }).en) &&
    Array.isArray((value as { zh?: unknown }).zh) &&
    (value as { en: unknown[] }).en.every((item) => typeof item === "string") &&
    (value as { zh: unknown[] }).zh.every((item) => typeof item === "string")
  );
}

function isRecapStatus(value: unknown): value is EventRecap["status"] {
  return value === "draft" || value === "published" || value === "hidden";
}

function isRecapMediaItem(value: unknown): value is RecapMediaItem {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const caption = item.caption;
  return (
    typeof item.id === "string" &&
    item.type === "image" &&
    typeof item.url === "string" &&
    typeof item.storagePath === "string" &&
    typeof item.order === "number" &&
    typeof item.isCover === "boolean" &&
    (caption === undefined ||
      (caption !== null &&
        typeof caption === "object" &&
        !Array.isArray(caption) &&
        isBilingualText({ en: "", zh: "", ...caption })))
  );
}

function isRecapPayload(value: unknown): value is EventRecap {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const recap = value as Partial<EventRecap>;
  return (
    typeof recap.slug === "string" &&
    isRecapStatus(recap.status) &&
    isBilingualText(recap.title) &&
    isBilingualText(recap.summary) &&
    isBilingualText(recap.content) &&
    typeof recap.date === "string" &&
    isBilingualText(recap.location) &&
    typeof recap.coverImage === "string" &&
    Array.isArray(recap.media) &&
    recap.media.every(isRecapMediaItem) &&
    isBilingualList(recap.tags) &&
    isBilingualText(recap.seoTitle) &&
    isBilingualText(recap.seoDescription) &&
    (recap.eventSlug === undefined || recap.eventSlug === null || typeof recap.eventSlug === "string")
  );
}

function readRecapPayload(formData: FormData) {
  const raw = formText(formData, "recapPayload");
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return isRecapPayload(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function saveDraftPayload(slug: string, formData: FormData) {
  const data = readRecapPayload(formData);
  if (!data) return undefined;
  return updateRecap(slug, data);
}

function applyDraftPayloadFallback(recap: EventRecap, formData: FormData) {
  return readRecapPayload(formData) ?? recap;
}

type CreateRecapFromEventDependencies = {
  loadRecap(slug: string): Promise<EventRecap | undefined>;
  insertRecap(recap: EventRecap): Promise<EventRecap | undefined>;
  saveRecap(slug: string, data: Partial<EventRecap>): Promise<EventRecap | undefined>;
};

export async function createRecapFromEventResult(
  dependencies: CreateRecapFromEventDependencies,
  event: Event,
): Promise<EventRecap | undefined> {
  const existing = await dependencies.loadRecap(event.slug);
  if (existing) {
    return existing.status === "hidden"
      ? dependencies.saveRecap(existing.slug, { status: "draft" })
      : existing;
  }

  const introModule = event.detailModules.find((moduleItem) => moduleItem.type === "intro") ?? event.detailModules[0];
  const recapContent = introModule?.content ?? { en: "", zh: "" };
  const recapTags = event.detailModules.reduce(
    (tags, moduleItem) => ({
      en: moduleItem.title.en ? [...tags.en, moduleItem.title.en] : tags.en,
      zh: moduleItem.title.zh ? [...tags.zh, moduleItem.title.zh] : tags.zh,
    }),
    { en: [] as string[], zh: [] as string[] },
  );

  const recap: EventRecap = {
    slug: event.slug,
    status: "draft",
    title: event.title,
    summary: recapContent,
    content: recapContent,
    date: event.eventDate,
    location: event.activityLocation,
    coverImage: event.coverImage,
    media: [],
    tags: recapTags,
    seoTitle: event.seoTitle,
    seoDescription: event.seoDescription,
    eventSlug: event.slug,
  };

  return dependencies.insertRecap(recap);
}

export async function createRecapFromEvent(event: Event): Promise<EventRecap | undefined> {
  try {
    return await createRecapFromEventResult(
      { loadRecap: getRecapAdmin, insertRecap, saveRecap: updateRecap },
      event,
    );
  } catch (error) {
    console.error("Failed to create recap from event:", error);
    return undefined;
  }
}

function refreshRecapPaths(slug: string) {
  revalidatePath("/recaps");
  revalidatePath(`/recaps/${slug}`);
  revalidatePath("/admin/recaps");
}

export async function updateRecapAction(formData: FormData) {
  await requireAdmin();

  const slug = formText(formData, "slug");
  const data = readRecapPayload(formData) ?? recapEditorInput(formData);

  await updateRecap(slug, data);
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

export async function uploadRecapMediaAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  try {
    const recap = await getRecapAdmin(slug);
    if (!recap) redirect("/admin/recaps");

    const files = formData.getAll("mediaFiles").filter(isUploadFile).filter((file) => file.size > 0);
    if (files.length === 0) redirect(`/admin/recaps/${slug}/edit?mediaError=missing`);
    if (files.some((file) => !RECAP_MEDIA_TYPES.has(file.type) || file.size > RECAP_MEDIA_MAX_BYTES)) {
      redirect(`/admin/recaps/${slug}/edit?mediaError=invalid`);
    }

    const workingRecap = applyDraftPayloadFallback(recap, formData);
    const bucket = createAdminClient().storage.from(RECAP_MEDIA_BUCKET);
    const uploaded: EventRecap["media"] = [];

    for (const file of files) {
      const path = safeRecapMediaPath(slug, file.name);
      const { error } = await bucket.upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        console.error("[uploadRecapMediaAction] storage.upload failed", { path, message: error.message });
        redirect(`/admin/recaps/${slug}/edit?mediaError=upload`);
      }
      const { data } = bucket.getPublicUrl(path);
      uploaded.push({
        id: `${Date.now()}-${uploaded.length}`,
        type: "image",
        url: data.publicUrl,
        storagePath: path,
        order: workingRecap.media.length + uploaded.length,
        isCover: false,
      });
    }

    const next = addMediaItems(workingRecap, uploaded);
    let savedRecap: EventRecap | undefined;
    try {
      savedRecap = await updateRecap(slug, {
        ...workingRecap,
        media: next.media,
        coverImage: next.coverImage,
      });
    } catch (dbError) {
      console.error("[uploadRecapMediaAction] updateRecap threw", dbError);
      redirect(`/admin/recaps/${slug}/edit?mediaError=db`);
    }
    if (!savedRecap) {
      console.error("[uploadRecapMediaAction] updateRecap returned undefined for slug", { slug });
      redirect(`/admin/recaps/${slug}/edit?mediaError=db`);
    }
    refreshRecapPaths(slug);
    redirect(`/admin/recaps/${slug}/edit?saved=1`);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[uploadRecapMediaAction] uncaught", error);
    redirect(`/admin/recaps/${slug}/edit?mediaError=upload`);
  }
}

export async function deleteRecapMediaAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const mediaId = formText(formData, "mediaId");
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");
  const workingRecap = applyDraftPayloadFallback(recap, formData);
  const item = workingRecap.media.find((mediaItem) => mediaItem.id === mediaId);
  const next = deleteMediaItem(workingRecap, mediaId);
  if (item?.storagePath) {
    await createAdminClient().storage.from(RECAP_MEDIA_BUCKET).remove([item.storagePath]);
  }
  await updateRecap(slug, { ...workingRecap, media: next.media, coverImage: next.coverImage });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

export async function moveRecapMediaAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const mediaId = formText(formData, "mediaId");
  const direction = formText(formData, "direction") === "down" ? "down" : "up";
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");
  const workingRecap = applyDraftPayloadFallback(recap, formData);
  const next = moveMediaItem(workingRecap, mediaId, direction);
  await updateRecap(slug, { ...workingRecap, media: next.media });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

export async function setRecapCoverAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const mediaId = formText(formData, "mediaId");
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");
  const workingRecap = applyDraftPayloadFallback(recap, formData);
  const next = setCoverMediaItem(workingRecap, mediaId);
  await updateRecap(slug, { ...workingRecap, media: next.media, coverImage: next.coverImage });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

export async function updateRecapMediaCaptionAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const mediaId = formText(formData, "mediaId");
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");
  const workingRecap = applyDraftPayloadFallback(recap, formData);
  const next = updateMediaCaption(workingRecap, mediaId, {
    zh: formText(formData, "caption.zh"),
    en: formText(formData, "caption.en"),
  });
  await updateRecap(slug, { ...workingRecap, media: next.media });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

type UnarchiveDependencies = {
  loadRecap(slug: string): Promise<EventRecap | undefined>;
  saveRecap(slug: string, data: Partial<EventRecap>): Promise<EventRecap | undefined>;
  saveEvent(slug: string, data: { status: "draft" }): Promise<unknown | undefined>;
};

export async function unarchiveRecapResult(dependencies: UnarchiveDependencies, slug: string) {
  const recap = await dependencies.loadRecap(slug);
  if (!recap) return { success: false as const, message: "Recap not found." };
  if (!recap.eventSlug) return { success: false as const, message: "Recap has no source event." };

  const restoredEvent = await dependencies.saveEvent(recap.eventSlug, { status: "draft" });
  if (!restoredEvent) return { success: false as const, message: "Source event could not be restored." };

  await dependencies.saveRecap(slug, { status: "hidden" });
  return { success: true as const, eventSlug: recap.eventSlug };
}

export async function unarchiveRecapAction(formData: FormData) {
  await requireAdmin();

  const slug = formText(formData, "slug");
  const result = await unarchiveRecapResult(
    { loadRecap: getRecapAdmin, saveRecap: updateRecap, saveEvent: updateEvent },
    slug,
  );
  if (!result.success) redirect("/admin/recaps");
  refreshRecapPaths(slug);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}
