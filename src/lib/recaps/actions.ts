"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "../auth/admin";
import { updateEvent } from "../events/repository";
import { createAdminClient } from "../supabase/server";
import type { Event, EventRecap, RecapMediaItem } from "../types";
import { insertRecap, getRecapAdmin, updateRecap } from "./repository";
import { translateRecapToChinese } from "../admin/translate-content";
import {
  addMediaItems,
  deleteMediaItem,
  moveMediaItem,
  setCoverMediaItem,
  updateMediaCaption,
} from "./media-helpers";
import {
  RECAP_MEDIA_BUCKET,
  RECAP_MEDIA_MAX_BYTES,
  RECAP_MEDIA_TYPES,
  parseFinalizeEntries,
  safeRecapMediaPath,
  safeRecapPrefix,
  validateRecapPath,
  validateUploadCandidate,
  type FinalizeEntry,
  type UploadCandidate,
  type ValidationCode,
} from "./upload-signing";

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT"))
  );
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
  let savedData = data;
  let translationWarning = false;
  if (isRecapPayload(data)) {
    try {
      savedData = await translateRecapToChinese(data);
    } catch (error) {
      translationWarning = true;
      console.error("[updateRecapAction] Chinese translation failed", error);
    }
  }

  await updateRecap(slug, savedData);
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1${translationWarning ? "&translationWarning=1" : ""}`);
}

export type SignErrorCode =
  | "recap_not_found"
  | "empty"
  | ValidationCode;

export type SignedUploadEntry = {
  path: string;
  token: string;
  signedUrl: string;
  name: string;
  type: string;
  size: number;
  publicUrl: string;
};

export type SignDependencies = {
  loadRecap(slug: string): Promise<EventRecap | undefined>;
  now(): number;
  createSignedUploadUrl(
    path: string,
    options: { upsert: boolean },
  ): Promise<{ signedUrl: string; token: string; path: string }>;
  getPublicUrl(path: string): { publicUrl: string };
};

export type SignInput = {
  slug: string;
  candidates: UploadCandidate[];
};

export type SignResult =
  | { ok: true; signed: SignedUploadEntry[] }
  | { ok: false; code: SignErrorCode; reason: string; index?: number };

export async function signRecapMediaUploadResult(
  dependencies: SignDependencies,
  input: SignInput,
): Promise<SignResult> {
  if (input.candidates.length === 0) {
    return { ok: false, code: "empty", reason: "At least one candidate is required." };
  }
  const recap = await dependencies.loadRecap(input.slug);
  if (!recap) {
    return { ok: false, code: "recap_not_found", reason: `Recap not found: ${input.slug}` };
  }

  const timestamp = dependencies.now();
  const validated: UploadCandidate[] = [];
  for (let i = 0; i < input.candidates.length; i += 1) {
    const candidate = input.candidates[i];
    const validation = validateUploadCandidate(candidate.name, candidate.type, candidate.size);
    if (!validation.ok) {
      return { ok: false, code: validation.code, reason: validation.reason, index: i };
    }
    validated.push(validation.candidate);
  }
  const signed: SignedUploadEntry[] = [];
  for (let i = 0; i < validated.length; i += 1) {
    const candidate = validated[i];
    // Per-candidate index in the path keeps duplicate filenames unique within
    // one batch so uploadToSignedUrl (upsert:false) cannot collide.
    const path = safeRecapMediaPath(input.slug, candidate.name, timestamp, i);
    const sign = await dependencies.createSignedUploadUrl(path, { upsert: false });
    const publicUrl = dependencies.getPublicUrl(path).publicUrl;
    signed.push({
      path,
      token: sign.token,
      signedUrl: sign.signedUrl,
      name: candidate.name,
      type: candidate.type,
      size: candidate.size,
      publicUrl,
    });
  }
  return { ok: true, signed };
}

export type SignedUploadInput = SignInput;

export async function signRecapMediaUploadAction(
  input: SignedUploadInput,
): Promise<SignResult> {
  await requireAdmin();
  const admin = createAdminClient().storage.from(RECAP_MEDIA_BUCKET);
  const deps: SignDependencies = {
    loadRecap: getRecapAdmin,
    now: () => Date.now(),
    createSignedUploadUrl: async (path, options) => {
      const { data, error } = await admin.createSignedUploadUrl(path, options);
      if (error || !data) {
        throw new Error(error?.message ?? "createSignedUploadUrl failed");
      }
      return data;
    },
    getPublicUrl: (path) => admin.getPublicUrl(path).data,
  };
  return signRecapMediaUploadResult(deps, input);
}

type RecapStorageObject = {
  name: string;
  id: string | null;
  metadata: { size?: number; mimetype?: string } | null;
};

export type FinalizeDependencies = {
  loadRecap(slug: string): Promise<EventRecap | undefined>;
  saveRecap(slug: string, data: Partial<EventRecap>): Promise<EventRecap | undefined>;
  listRecapObjects(slug: string, prefix: string): Promise<RecapStorageObject[]>;
  removeRecapObjects(paths: string[]): Promise<unknown>;
  getPublicUrl(path: string): { publicUrl: string };
  now(): number;
};

export type FinalizeInput = {
  slug: string;
  recapPayload?: EventRecap;
  uploaded: FinalizeEntry[];
};

export type FinalizeErrorCode =
  | "empty_upload"
  | "bad_path"
  | "missing_object"
  | "metadata_invalid"
  | "recap_not_found"
  | "save_failed";

export type FinalizeResult =
  | { ok: true; media: RecapMediaItem[]; recap: EventRecap }
  | { ok: false; code: FinalizeErrorCode; reason: string; cleanedUp: string[] };

async function cleanupPaths(
  deps: FinalizeDependencies,
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) return [];
  try {
    await deps.removeRecapObjects(paths);
    return paths;
  } catch (error) {
    console.error("[finalizeRecapMediaUploadResult] cleanup failed", { paths, error });
    return [];
  }
}

export async function finalizeRecapMediaUploadResult(
  deps: FinalizeDependencies,
  input: FinalizeInput,
): Promise<FinalizeResult> {
  const slug = input.slug;

  if (input.uploaded.length === 0) {
    return {
      ok: false,
      code: "empty_upload",
      reason: "At least one uploaded entry is required.",
      cleanedUp: [],
    };
  }

  // Validate every uploaded path independently before any service-role call.
  // Paths that fail validation are reported but never passed to removeRecapObjects,
  // so a browser-supplied path under another slug or with traversal cannot be
  // used to delete objects outside the recap's namespace.
  const safePaths: string[] = [];
  const safeEntries: { entry: FinalizeEntry; basename: string }[] = [];
  for (const entry of input.uploaded) {
    const result = validateRecapPath(entry.path, slug);
    if (!result.ok) {
      const cleanedUp = await cleanupPaths(deps, safePaths);
      return {
        ok: false,
        code: "bad_path",
        reason: result.reason,
        cleanedUp,
      };
    }
    safePaths.push(entry.path);
    safeEntries.push({ entry, basename: result.basename });
  }

  const prefix = safeRecapPrefix(slug);
  const objects = await deps.listRecapObjects(slug, prefix);
  const objectsByName = new Map<string, RecapStorageObject>();
  for (const obj of objects) {
    if (obj.id !== null) objectsByName.set(obj.name, obj);
  }

  for (const { entry, basename } of safeEntries) {
    const obj = objectsByName.get(basename);
    const mimetype = obj?.metadata?.mimetype;
    const size = obj?.metadata?.size;
    if (!obj || mimetype === undefined || size === undefined) {
      const cleanedUp = await cleanupPaths(deps, safePaths);
      return {
        ok: false,
        code: "missing_object",
        reason: `Uploaded object not found in storage: ${entry.path}`,
        cleanedUp,
      };
    }
    if (!RECAP_MEDIA_TYPES.has(mimetype) || size > RECAP_MEDIA_MAX_BYTES) {
      const cleanedUp = await cleanupPaths(deps, safePaths);
      return {
        ok: false,
        code: "metadata_invalid",
        reason: `Storage metadata for ${entry.path} failed validation (mimetype=${mimetype}, size=${size})`,
        cleanedUp,
      };
    }
  }

  const storedRecap = await deps.loadRecap(slug);
  if (!storedRecap) {
    const cleanedUp = await cleanupPaths(deps, safePaths);
    return {
      ok: false,
      code: "recap_not_found",
      reason: `Recap not found: ${slug}`,
      cleanedUp,
    };
  }
  const baseRecap = input.recapPayload ?? storedRecap;

  const newItems: RecapMediaItem[] = input.uploaded.map((entry, index) => ({
    id: `${deps.now()}-${index}-${entry.name}`,
    type: "image",
    url: deps.getPublicUrl(entry.path).publicUrl,
    storagePath: entry.path,
    order: baseRecap.media.length + index,
    isCover: false,
  }));

  const next = addMediaItems(baseRecap, newItems);

  let saved: EventRecap | undefined;
  try {
    saved = await deps.saveRecap(slug, {
      ...baseRecap,
      media: next.media,
      coverImage: next.coverImage,
    });
  } catch (error) {
    console.error("[finalizeRecapMediaUploadResult] saveRecap threw", error);
    const cleanedUp = await cleanupPaths(deps, safePaths);
    return {
      ok: false,
      code: "save_failed",
      reason: error instanceof Error ? error.message : "save failed",
      cleanedUp,
    };
  }
  if (!saved) {
    const cleanedUp = await cleanupPaths(deps, safePaths);
    return {
      ok: false,
      code: "save_failed",
      reason: `updateRecap returned undefined for slug ${slug}`,
      cleanedUp,
    };
  }

  return { ok: true, media: next.media, recap: saved };
}

export type FinalizeActionInput = {
  slug: string;
  recapPayload?: string;
  uploaded?: string;
};

function buildFinalizeDeps(): FinalizeDependencies {
  const admin = createAdminClient().storage.from(RECAP_MEDIA_BUCKET);
  return {
    loadRecap: getRecapAdmin,
    saveRecap: updateRecap,
    now: () => Date.now(),
    getPublicUrl: (path) => admin.getPublicUrl(path).data,
    listRecapObjects: async (_slug, prefix) => {
      const { data, error } = await admin.list(prefix, { limit: 1000 });
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []).map((obj) => ({
        name: obj.name,
        id: obj.id,
        metadata: obj.metadata
          ? { size: obj.metadata.size, mimetype: obj.metadata.mimetype }
          : null,
      }));
    },
    removeRecapObjects: async (paths) => {
      const { error } = await admin.remove(paths);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

export async function finalizeRecapMediaUploadAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const recapPayloadRaw = formText(formData, "recapPayload");
  const uploadedRaw = formText(formData, "uploaded");
  const deps = buildFinalizeDeps();

  let recapPayload: EventRecap | undefined;
  if (recapPayloadRaw) {
    try {
      const parsed: unknown = JSON.parse(recapPayloadRaw);
      recapPayload = isRecapPayload(parsed) ? parsed : undefined;
    } catch {
      recapPayload = undefined;
    }
  }

  let uploaded: FinalizeEntry[] = [];
  if (uploadedRaw) {
    try {
      const parsed: unknown = JSON.parse(uploadedRaw);
      const result = parseFinalizeEntries(parsed);
      if (result.ok) uploaded = result.entries;
    } catch {
      // Malformed JSON; treat as empty upload list.
    }
  }

  const result = await finalizeRecapMediaUploadResult(deps, {
    slug,
    ...(recapPayload ? { recapPayload } : {}),
    uploaded,
  });

  if (!result.ok) {
    redirect(`/admin/recaps/${slug}/edit?mediaError=${result.code}`);
  }
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

export type AbortDependencies = {
  removeRecapObjects(paths: string[]): Promise<unknown>;
};

export type AbortInput = {
  slug: string;
  paths: string[];
};

export type AbortResult = {
  ok: true;
  removed: string[];
  skipped: string[];
};

export async function abortRecapMediaUploadResult(
  deps: AbortDependencies,
  input: AbortInput,
): Promise<AbortResult> {
  const safe: string[] = [];
  const skipped: string[] = [];
  for (const path of input.paths) {
    const result = validateRecapPath(path, input.slug);
    if (!result.ok) {
      skipped.push(path);
      continue;
    }
    safe.push(path);
  }
  if (safe.length === 0) {
    return { ok: true, removed: [], skipped };
  }
  let removed: string[] = [];
  try {
    await deps.removeRecapObjects(safe);
    removed = safe;
  } catch (error) {
    console.error("[abortRecapMediaUploadResult] remove failed", { safe, error });
  }
  const attempted = new Set(safe);
  return {
    ok: true,
    removed,
    skipped: [...skipped, ...input.paths.filter((p) => attempted.has(p) && !removed.includes(p))],
  };
}

export type AbortActionInput = AbortInput | { formData: FormData };

function readAbortInput(input: AbortActionInput): AbortInput {
  if ("formData" in input) {
    const formData = input.formData;
    const slug = formText(formData, "slug");
    const raw = formText(formData, "paths");
    let paths: string[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          paths = parsed.filter((p): p is string => typeof p === "string");
        }
      } catch {
        // Best-effort: leave paths empty.
      }
    }
    return { slug, paths };
  }
  return input;
}

export async function abortRecapMediaUploadAction(
  input: AbortActionInput,
): Promise<AbortResult> {
  await requireAdmin();
  const normalized = readAbortInput(input);
  const admin = createAdminClient().storage.from(RECAP_MEDIA_BUCKET);
  const deps: AbortDependencies = {
    removeRecapObjects: async (paths) => {
      const { error } = await admin.remove(paths);
      if (error) throw new Error(error.message);
    },
  };
  return abortRecapMediaUploadResult(deps, normalized);
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
  const existingMedia = workingRecap.media.find((media) => media.id === mediaId);
  const englishCaption = formText(formData, "caption.en");
  let caption = { en: englishCaption, zh: "" };
  try {
    const translated = await translateRecapToChinese({ ...workingRecap, media: [{
      id: mediaId,
      type: "image",
      url: "",
      storagePath: "",
      order: 0,
      isCover: false,
      caption,
    }] });
    const translatedCaption = translated.media[0]?.caption;
    caption = translatedCaption
      ? { en: translatedCaption.en ?? englishCaption, zh: translatedCaption.zh ?? "" }
      : caption;
  } catch (error) {
    console.error("[updateRecapMediaCaptionAction] Chinese translation failed", error);
    caption.zh = existingMedia?.caption?.zh ?? "";
  }
  const next = updateMediaCaption(workingRecap, mediaId, caption);
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
