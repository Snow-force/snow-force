"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "../auth/admin";
import type { Event } from "../types";
import type { EventRecap } from "../types";
import { insertRecap, getRecapAdmin, updateRecap } from "./repository";

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

function mediaItems(formData: FormData): { url: string; caption: { en: string; zh: string } }[] {
  const urls = lines(formText(formData, "mediaUrls"));
  const captionsEn = lines(formText(formData, "mediaCaptions.en"));
  const captionsZh = lines(formText(formData, "mediaCaptions.zh"));
  return urls.map((url, i) => ({
    url,
    caption: {
      en: captionsEn[i] ?? "",
      zh: captionsZh[i] ?? "",
    },
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

export async function createRecapFromEvent(event: Event): Promise<EventRecap | undefined> {
  const existing = await getRecapAdmin(event.slug);
  if (existing) return existing;
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

  try {
    return await insertRecap(recap);
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
  const data = recapEditorInput(formData);

  await updateRecap(slug, data);
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}
