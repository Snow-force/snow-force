# Recap Management Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild recap administration around the event editor's modular workflow, add recap media storage/upload management, and complete archive/unarchive lifecycle behavior.

**Architecture:** Keep event and recap lifecycles separate: events remain `draft | published | archived`, while recaps move to `draft | published | hidden`. Recap editing becomes a client-side modular editor with a stepper, active-language state defaulting to Chinese, and dedicated server actions for recap content, media upload/ordering/cover/caption, and unarchive. Media remains stored in the `event_recaps.media` JSONB field for this version, with files uploaded to a new Supabase Storage bucket named `recap-media`.

**Tech Stack:** Next.js 14 App Router, React client components, TypeScript, Tailwind CSS, Supabase database/storage, Vitest.

---

## File Structure

**Schema / storage**
- Modify: `supabase/migrations/20260523231000_add_event_slug_to_recaps.sql` only for reference; do not edit existing migrations.
- Create: `supabase/migrations/20260526000100_recap_media_and_hidden_status.sql` to add the `recap-media` bucket and allow recap status `hidden`.

**Types and domain helpers**
- Modify: `src/lib/types.ts` to add `RecapStatus`, `RecapMediaItem`, and update `EventRecap.status` / `EventRecap.media`.
- Create: `src/lib/i18n/fallback.ts` for `localizedText()` and `localizedList()` helpers.
- Modify: public recap UI components to use fallback helpers.

**Recap repository/actions**
- Modify: `src/lib/recaps/repository.ts` to parse both legacy media (`{ url, caption }`) and new media (`{ id, type, url, storagePath, caption, order, isCover }`), filter public recaps to `published`, and filter admin list to non-hidden by default.
- Modify: `src/lib/recaps/repository.test.ts` for hidden filtering, media migration compatibility, cover sync, and fallback insert behavior.
- Modify: `src/lib/recaps/actions.ts` for content save, upload/delete/reorder/cover/caption actions, and unarchive.
- Create: `src/lib/recaps/actions.test.ts` for archive/unarchive and media operation pure helpers.

**Admin UI**
- Create: `src/components/admin/recap-editor-stepper.tsx` for recap-specific steps.
- Create: `src/components/admin/recap-basic-step.tsx` for basic fields.
- Create: `src/components/admin/recap-content-step.tsx` for single-language content editing.
- Create: `src/components/admin/recap-media-manager.tsx` for upload/delete/sort/cover/advanced caption UI.
- Create: `src/components/admin/recap-publish-step.tsx` for SEO and publish readiness.
- Modify: `src/components/admin/recap-editor-form.tsx` to orchestrate the modular editor.
- Modify: `src/components/admin/admin-recaps-view.tsx` to hide `hidden` recaps, show Unarchive, and confirm when unarchiving published recaps.
- Modify: `src/components/admin/admin-copy.ts` for new bilingual labels.

**Routes and public display**
- Modify: `src/app/admin/recaps/[slug]/edit/page.tsx` if prop shape changes.
- Modify: `src/app/admin/recaps/status/route.ts` to accept only `draft | published` for visible toggles; hidden only through unarchive.
- Modify: `src/components/recaps/recap-detail-view.tsx` and recap cards/list components to display media without requiring captions and fallback English to Chinese.
- Modify: event admin repository/list behavior if archived events still appear in the main activity management list.

---

### Task 1: Add recap status/media types and fallback helpers

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/i18n/fallback.ts`
- Create: `src/lib/i18n/fallback.test.ts`

- [ ] **Step 1: Write failing fallback helper tests**

Create `src/lib/i18n/fallback.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { localizedList, localizedText } from "./fallback";

describe("localized fallback helpers", () => {
  it("falls back from empty English text to Chinese", () => {
    expect(localizedText({ zh: "中文标题", en: "" }, "en")).toBe("中文标题");
  });

  it("uses English text when present", () => {
    expect(localizedText({ zh: "中文标题", en: "English title" }, "en")).toBe("English title");
  });

  it("falls back from empty English list to Chinese list", () => {
    expect(localizedList({ zh: ["雪场", "合影"], en: [] }, "en")).toEqual(["雪场", "合影"]);
  });
});
```

- [ ] **Step 2: Run fallback tests to verify RED**

Run:

```bash
npm test -- src/lib/i18n/fallback.test.ts
```

Expected: FAIL because `src/lib/i18n/fallback.ts` does not exist.

- [ ] **Step 3: Implement fallback helpers**

Create `src/lib/i18n/fallback.ts`:

```ts
import type { Bilingual } from "@/lib/types";

export type SupportedLanguage = "zh" | "en";

export function localizedText(value: Bilingual, lang: SupportedLanguage) {
  return value[lang] || value.zh || value.en || "";
}

export function localizedList(value: Bilingual<string[]>, lang: SupportedLanguage) {
  const preferred = value[lang];
  if (preferred.length > 0) return preferred;
  if (value.zh.length > 0) return value.zh;
  return value.en;
}
```

- [ ] **Step 4: Update shared recap types**

Modify the recap portion of `src/lib/types.ts`:

```ts
export type RecapStatus = "draft" | "published" | "hidden";
export type RecapMediaType = "image";

export interface RecapMediaItem {
  id: string;
  type: RecapMediaType;
  url: string;
  storagePath: string;
  caption?: Partial<Bilingual>;
  order: number;
  isCover: boolean;
}

export interface EventRecap {
  slug: string;
  status: RecapStatus;
  title: Bilingual;
  summary: Bilingual;
  content: Bilingual;
  date: string;
  location: Bilingual;
  coverImage: string;
  media: RecapMediaItem[];
  tags: Bilingual<string[]>;
  seoTitle: Bilingual;
  seoDescription: Bilingual;
  eventSlug?: string | null;
}
```

Keep `EventStatus` unchanged as `"draft" | "published" | "archived"`.

- [ ] **Step 5: Run fallback tests to verify GREEN**

Run:

```bash
npm test -- src/lib/i18n/fallback.test.ts
```

Expected: PASS.

---

### Task 2: Add Supabase migration for `hidden` recaps and `recap-media` bucket

**Files:**
- Create: `supabase/migrations/20260526000100_recap_media_and_hidden_status.sql`

- [ ] **Step 1: Inspect current recap and bucket migrations**

Read:

```bash
# Use Read tool instead of shell cat in OpenCode
supabase/migrations/20260523231000_add_event_slug_to_recaps.sql
supabase/migrations/20260525224800_create_event_covers_bucket.sql
```

Expected: Confirm existing `event_recaps.status` constraint style and storage bucket insertion style.

- [ ] **Step 2: Create migration**

Create `supabase/migrations/20260526000100_recap_media_and_hidden_status.sql`:

```sql
alter table public.event_recaps
  drop constraint if exists event_recaps_status_check;

alter table public.event_recaps
  add constraint event_recaps_status_check
  check (status in ('draft', 'published', 'hidden'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recap-media',
  'recap-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public recap media is readable"
  on storage.objects for select
  using (bucket_id = 'recap-media');
```

If an existing migration defines admin storage policies for `event-covers`, mirror that pattern for insert/update/delete if policies are required in this project. If storage writes use the service role key only, the bucket plus public read policy is enough for the first version.

- [ ] **Step 3: Verify SQL style manually**

Run:

```bash
npm test -- src/lib/recaps/repository.test.ts
```

Expected: Existing tests may fail after type changes until Task 3; do not change migration in response to TypeScript failures.

---

### Task 3: Update recap repository for hidden status and new media shape

**Files:**
- Modify: `src/lib/recaps/repository.ts`
- Modify: `src/lib/recaps/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add to `src/lib/recaps/repository.test.ts`:

```ts
it("keeps hidden recaps out of public and default admin lists", async () => {
  const repository = createRecapRepository(
    recapSource([
      recapRow("published", "published"),
      recapRow("draft", "draft"),
      recapRow("hidden", "hidden"),
    ]),
  );

  expect((await repository.getRecaps()).map((recap) => recap.slug)).toEqual(["published"]);
  expect((await repository.getAllRecaps()).map((recap) => recap.slug)).toEqual(["published", "draft"]);
  expect((await repository.getAllRecaps({ includeHidden: true })).map((recap) => recap.slug)).toEqual([
    "published",
    "draft",
    "hidden",
  ]);
});

it("normalizes legacy media rows into editable media items", async () => {
  const repository = createRecapRepository(
    recapSource([
      {
        ...recapRow("legacy-media", "draft"),
        media: [
          {
            url: "https://example.com/photo.jpg",
            caption: { zh: "合影", en: "" },
          },
        ],
      },
    ]),
  );

  expect((await repository.getRecapAdmin("legacy-media"))?.media).toEqual([
    {
      id: "legacy-media-0",
      type: "image",
      url: "https://example.com/photo.jpg",
      storagePath: "",
      caption: { zh: "合影", en: "" },
      order: 0,
      isCover: true,
    },
  ]);
});
```

Update the `recapRow` helper type to accept `RecapRow["status"]` after `RecapStatus` changes.

- [ ] **Step 2: Run repository tests to verify RED**

Run:

```bash
npm test -- src/lib/recaps/repository.test.ts
```

Expected: FAIL because hidden filtering and legacy media normalization do not exist yet.

- [ ] **Step 3: Implement media normalization**

In `src/lib/recaps/repository.ts`, replace `mediaItems()` with a normalizer that accepts both old and new shapes:

```ts
function mediaItems(value: unknown, slug: string, coverImage: string): EventRecap["media"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index): EventRecap["media"][number] | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const media = item as Record<string, unknown>;
      if (typeof media.url !== "string" || !media.url) return undefined;
      const caption = media.caption && typeof media.caption === "object"
        ? (media.caption as Partial<EventRecap["media"][number]["caption"]>)
        : undefined;

      return {
        id: typeof media.id === "string" && media.id ? media.id : `${slug}-${index}`,
        type: "image",
        url: media.url,
        storagePath: typeof media.storagePath === "string" ? media.storagePath : "",
        caption,
        order: typeof media.order === "number" ? media.order : index,
        isCover: typeof media.isCover === "boolean" ? media.isCover : media.url === coverImage || index === 0,
      };
    })
    .filter((item): item is EventRecap["media"][number] => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .map((item, order) => ({ ...item, order }));
}
```

Update `rowToRecap()`:

```ts
media: mediaItems(row.media, row.slug, row.cover_image ?? ""),
```

- [ ] **Step 4: Implement hidden filtering API**

Change repository method signature inside `createRecapRepository()`:

```ts
async getAllRecaps(options: { includeHidden?: boolean } = {}) {
  return (await source.listAdmin())
    .filter((row) => options.includeHidden || row.status !== "hidden")
    .map(rowToRecap);
}
```

Keep `getRecapAdmin(slug)` able to load hidden recaps by slug.

- [ ] **Step 5: Run repository tests to verify GREEN**

Run:

```bash
npm test -- src/lib/recaps/repository.test.ts
```

Expected: PASS.

---

### Task 4: Add pure recap media and unarchive helpers with tests

**Files:**
- Modify: `src/lib/recaps/actions.ts`
- Create: `src/lib/recaps/actions.test.ts`

- [ ] **Step 1: Write failing pure-helper tests**

Create `src/lib/recaps/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  addMediaItems,
  deleteMediaItem,
  moveMediaItem,
  setCoverMediaItem,
  updateMediaCaption,
} from "./actions";
import type { EventRecap, RecapMediaItem } from "../types";

function media(id: string, order: number, isCover = false): RecapMediaItem {
  return {
    id,
    type: "image",
    url: `https://example.com/${id}.jpg`,
    storagePath: `recaps/demo/${id}.jpg`,
    order,
    isCover,
  };
}

function recap(items: RecapMediaItem[]): EventRecap {
  return {
    slug: "demo",
    status: "draft",
    title: { zh: "中文", en: "" },
    summary: { zh: "摘要", en: "" },
    content: { zh: "正文", en: "" },
    date: "2026-01-01",
    location: { zh: "雪场", en: "" },
    coverImage: items.find((item) => item.isCover)?.url ?? "",
    media: items,
    tags: { zh: [], en: [] },
    seoTitle: { zh: "", en: "" },
    seoDescription: { zh: "", en: "" },
    eventSlug: "demo-event",
  };
}

describe("recap media helpers", () => {
  it("adds uploaded media and makes the first image cover when no cover exists", () => {
    const next = addMediaItems(recap([]), [media("a", 0), media("b", 1)]);

    expect(next.media.map((item) => [item.id, item.order, item.isCover])).toEqual([
      ["a", 0, true],
      ["b", 1, false],
    ]);
    expect(next.coverImage).toBe("https://example.com/a.jpg");
  });

  it("deletes cover media and promotes the first remaining image", () => {
    const next = deleteMediaItem(recap([media("a", 0, true), media("b", 1)]), "a");

    expect(next.media.map((item) => [item.id, item.order, item.isCover])).toEqual([["b", 0, true]]);
    expect(next.coverImage).toBe("https://example.com/b.jpg");
  });

  it("moves media by direction and reindexes order", () => {
    const next = moveMediaItem(recap([media("a", 0, true), media("b", 1), media("c", 2)]), "c", "up");

    expect(next.media.map((item) => [item.id, item.order])).toEqual([
      ["a", 0],
      ["c", 1],
      ["b", 2],
    ]);
  });

  it("sets one image as cover", () => {
    const next = setCoverMediaItem(recap([media("a", 0, true), media("b", 1)]), "b");

    expect(next.media.map((item) => [item.id, item.isCover])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(next.coverImage).toBe("https://example.com/b.jpg");
  });

  it("updates optional captions without requiring both languages", () => {
    const next = updateMediaCaption(recap([media("a", 0, true)]), "a", { zh: "合影" });

    expect(next.media[0].caption).toEqual({ zh: "合影" });
  });
});
```

- [ ] **Step 2: Run actions tests to verify RED**

Run:

```bash
npm test -- src/lib/recaps/actions.test.ts
```

Expected: FAIL because helper exports do not exist.

- [ ] **Step 3: Implement pure helpers**

Add to `src/lib/recaps/actions.ts` above server actions:

```ts
function reindexMedia(media: EventRecap["media"]) {
  return media.map((item, order) => ({ ...item, order }));
}

function ensureCover(recap: EventRecap): EventRecap {
  if (recap.media.length === 0) return { ...recap, coverImage: "" };
  if (recap.media.some((item) => item.isCover)) {
    const cover = recap.media.find((item) => item.isCover);
    return { ...recap, coverImage: cover?.url ?? recap.coverImage };
  }
  const [first, ...rest] = recap.media;
  return {
    ...recap,
    coverImage: first.url,
    media: [{ ...first, isCover: true }, ...rest],
  };
}

export function addMediaItems(recap: EventRecap, items: EventRecap["media"]): EventRecap {
  const existing = recap.media.map((item) => ({ ...item, isCover: item.isCover && recap.media.length > 0 }));
  const start = existing.length;
  const appended = items.map((item, index) => ({ ...item, order: start + index, isCover: false }));
  return ensureCover({ ...recap, media: reindexMedia([...existing, ...appended]) });
}

export function deleteMediaItem(recap: EventRecap, mediaId: string): EventRecap {
  const media = reindexMedia(recap.media.filter((item) => item.id !== mediaId));
  return ensureCover({ ...recap, media });
}

export function moveMediaItem(recap: EventRecap, mediaId: string, direction: "up" | "down"): EventRecap {
  const media = [...recap.media].sort((a, b) => a.order - b.order);
  const index = media.findIndex((item) => item.id === mediaId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= media.length) return recap;
  const current = media[index];
  media[index] = media[nextIndex];
  media[nextIndex] = current;
  return { ...recap, media: reindexMedia(media) };
}

export function setCoverMediaItem(recap: EventRecap, mediaId: string): EventRecap {
  const media = recap.media.map((item) => ({ ...item, isCover: item.id === mediaId }));
  return ensureCover({ ...recap, media });
}

export function updateMediaCaption(
  recap: EventRecap,
  mediaId: string,
  caption: EventRecap["media"][number]["caption"],
): EventRecap {
  return {
    ...recap,
    media: recap.media.map((item) => (item.id === mediaId ? { ...item, caption } : item)),
  };
}
```

- [ ] **Step 4: Run actions tests to verify GREEN**

Run:

```bash
npm test -- src/lib/recaps/actions.test.ts
```

Expected: PASS.

---

### Task 5: Add Supabase Storage upload/delete/cover/reorder/caption server actions

**Files:**
- Modify: `src/lib/recaps/actions.ts`
- Modify: `src/components/admin/admin-copy.ts`

- [ ] **Step 1: Add storage constants and helpers**

In `src/lib/recaps/actions.ts`, import `createAdminClient`:

```ts
import { createAdminClient } from "../supabase/server";
```

Add constants near existing helpers:

```ts
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
```

- [ ] **Step 2: Implement upload action**

Add:

```ts
export async function uploadRecapMediaAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");

  const files = formData.getAll("mediaFiles").filter(isUploadFile).filter((file) => file.size > 0);
  if (files.length === 0) redirect(`/admin/recaps/${slug}/edit?mediaError=missing`);

  const bucket = createAdminClient().storage.from(RECAP_MEDIA_BUCKET);
  const uploaded: EventRecap["media"] = [];

  for (const file of files) {
    if (!RECAP_MEDIA_TYPES.has(file.type) || file.size > RECAP_MEDIA_MAX_BYTES) {
      redirect(`/admin/recaps/${slug}/edit?mediaError=invalid`);
    }
    const path = safeRecapMediaPath(slug, file.name);
    const { error } = await bucket.upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (error) redirect(`/admin/recaps/${slug}/edit?mediaError=upload`);
    const { data } = bucket.getPublicUrl(path);
    uploaded.push({
      id: `${Date.now()}-${uploaded.length}`,
      type: "image",
      url: data.publicUrl,
      storagePath: path,
      order: recap.media.length + uploaded.length,
      isCover: false,
    });
  }

  const next = addMediaItems(recap, uploaded);
  await updateRecap(slug, { media: next.media, coverImage: next.coverImage });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}
```

- [ ] **Step 3: Implement delete/reorder/cover/caption actions**

Add:

```ts
export async function deleteRecapMediaAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const mediaId = formText(formData, "mediaId");
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");
  const item = recap.media.find((mediaItem) => mediaItem.id === mediaId);
  const next = deleteMediaItem(recap, mediaId);
  if (item?.storagePath) {
    await createAdminClient().storage.from(RECAP_MEDIA_BUCKET).remove([item.storagePath]);
  }
  await updateRecap(slug, { media: next.media, coverImage: next.coverImage });
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
  const next = moveMediaItem(recap, mediaId, direction);
  await updateRecap(slug, { media: next.media });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

export async function setRecapCoverAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const mediaId = formText(formData, "mediaId");
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");
  const next = setCoverMediaItem(recap, mediaId);
  await updateRecap(slug, { media: next.media, coverImage: next.coverImage });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}

export async function updateRecapMediaCaptionAction(formData: FormData) {
  await requireAdmin();
  const slug = formText(formData, "slug");
  const mediaId = formText(formData, "mediaId");
  const recap = await getRecapAdmin(slug);
  if (!recap) redirect("/admin/recaps");
  const next = updateMediaCaption(recap, mediaId, {
    zh: formText(formData, "caption.zh"),
    en: formText(formData, "caption.en"),
  });
  await updateRecap(slug, { media: next.media });
  refreshRecapPaths(slug);
  redirect(`/admin/recaps/${slug}/edit?saved=1`);
}
```

- [ ] **Step 4: Run action helper tests and build**

Run:

```bash
npm test -- src/lib/recaps/actions.test.ts
npm run build
```

Expected: actions tests PASS; build may fail until UI tasks import actions correctly. Fix only TypeScript errors in this file before continuing.

---

### Task 6: Implement unarchive action and recap hidden lifecycle

**Files:**
- Modify: `src/lib/recaps/actions.ts`
- Modify: `src/lib/recaps/actions.test.ts`
- Modify: `src/lib/events/repository.ts` if archived events still appear in admin main list
- Modify: `src/components/admin/admin-recaps-view.tsx`

- [ ] **Step 1: Add failing unarchive helper test**

Add to `src/lib/recaps/actions.test.ts`:

```ts
import { unarchiveRecapResult } from "./actions";

it("restores archived event to draft and hides the recap without deleting media", async () => {
  const recapWithMedia = recap([media("a", 0, true)]);
  const saved: Record<string, unknown> = {};

  const result = await unarchiveRecapResult(
    {
      loadRecap: async () => ({ ...recapWithMedia, status: "published" }),
      saveRecap: async (_slug, data) => {
        saved.recap = data;
        return { ...recapWithMedia, ...data };
      },
      saveEvent: async (_slug, data) => {
        saved.event = data;
        return {};
      },
    },
    "demo",
  );

  expect(result).toEqual({ success: true, eventSlug: "demo-event" });
  expect(saved.event).toEqual({ status: "draft" });
  expect(saved.recap).toEqual({ status: "hidden" });
});
```

- [ ] **Step 2: Run unarchive test to verify RED**

Run:

```bash
npm test -- src/lib/recaps/actions.test.ts
```

Expected: FAIL because `unarchiveRecapResult` does not exist.

- [ ] **Step 3: Implement unarchive helper/action**

In `src/lib/recaps/actions.ts`, import `updateEvent` from event repository:

```ts
import { updateEvent } from "../events/repository";
```

Add:

```ts
type UnarchiveDependencies = {
  loadRecap(slug: string): Promise<EventRecap | undefined>;
  saveRecap(slug: string, data: Partial<EventRecap>): Promise<EventRecap | undefined>;
  saveEvent(slug: string, data: { status: "draft" }): Promise<unknown>;
};

export async function unarchiveRecapResult(dependencies: UnarchiveDependencies, slug: string) {
  const recap = await dependencies.loadRecap(slug);
  if (!recap) return { success: false as const, message: "Recap not found." };
  if (!recap.eventSlug) return { success: false as const, message: "Recap has no source event." };

  await dependencies.saveEvent(recap.eventSlug, { status: "draft" });
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
```

- [ ] **Step 4: Update recap list Unarchive UI**

In `src/components/admin/admin-recaps-view.tsx`, import action:

```ts
import { unarchiveRecapAction } from "@/lib/recaps/actions";
```

Add a form next to edit/publish for recaps with `eventSlug`:

```tsx
{recap.eventSlug ? (
  <form action={unarchiveRecapAction}>
    <input type="hidden" name="slug" value={recap.slug} />
    <button
      className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      onClick={(event) => {
        if (recap.status === "published" && !window.confirm(t({
          en: "After restoring this as an activity, the recap will no longer be public. Continue?",
          zh: "恢复为活动后，该回顾将不再公开显示，是否继续？",
        }))) {
          event.preventDefault();
        }
      }}
    >
      {t({ en: "Unarchive", zh: "恢复为活动" })}
    </button>
  </form>
) : null}
```

- [ ] **Step 5: Run unarchive tests to verify GREEN**

Run:

```bash
npm test -- src/lib/recaps/actions.test.ts
```

Expected: PASS.

---

### Task 7: Build recap stepper and single-language content editor

**Files:**
- Create: `src/components/admin/recap-editor-stepper.tsx`
- Create: `src/components/admin/recap-basic-step.tsx`
- Create: `src/components/admin/recap-content-step.tsx`
- Modify: `src/components/admin/recap-editor-form.tsx`

- [ ] **Step 1: Create recap stepper**

Create `src/components/admin/recap-editor-stepper.tsx`:

```tsx
"use client";

import { useLanguage } from "@/lib/language";

export type RecapStepId = "basic" | "content" | "media" | "publish";

type RecapEditorStepperProps = {
  activeStep: RecapStepId;
  onStepChange(step: RecapStepId): void;
  summaries: Record<RecapStepId, string>;
};

const steps: Array<{ id: RecapStepId; label: { zh: string; en: string } }> = [
  { id: "basic", label: { zh: "基础信息", en: "Basic" } },
  { id: "content", label: { zh: "回顾内容", en: "Content" } },
  { id: "media", label: { zh: "照片与媒体", en: "Media" } },
  { id: "publish", label: { zh: "SEO 与发布", en: "Publish" } },
];

export function RecapEditorStepper({ activeStep, onStepChange, summaries }: RecapEditorStepperProps) {
  const { lang } = useLanguage();
  return (
    <nav aria-label="Recap editor steps" className="space-y-2">
      {steps.map((step) => {
        const isActive = activeStep === step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepChange(step.id)}
            className={`w-full rounded border px-3 py-2 text-left transition ${
              isActive
                ? "border-blue-500 bg-blue-50 text-blue-950"
                : "border-gray-200 bg-white text-gray-800 hover:border-blue-200 hover:bg-blue-50/50"
            }`}
          >
            <span className="block text-sm font-semibold">{step.label[lang]}</span>
            {!isActive ? <span className="mt-1 block break-words text-xs leading-5 text-gray-500">{summaries[step.id]}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Create basic step component**

Create `src/components/admin/recap-basic-step.tsx`:

```tsx
"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type RecapBasicStepProps = {
  recap: EventRecap;
  onChange(recap: EventRecap): void;
};

export function RecapBasicStep({ recap, onChange }: RecapBasicStepProps) {
  const { t } = useLanguage();
  return (
    <section className="card space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.basic)}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.slug)}
          <input value={recap.slug} readOnly className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-3 py-2" />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.recapEditor.date)}
          <input
            type="date"
            value={recap.date}
            onChange={(event) => onChange({ ...recap, date: event.currentTarget.value })}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600 md:col-span-2">
          {t(adminCopy.editor.coverImage)}
          <input
            value={recap.coverImage}
            onChange={(event) => onChange({ ...recap, coverImage: event.currentTarget.value })}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create content step with language switch**

Create `src/components/admin/recap-content-step.tsx`:

```tsx
"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type RecapContentStepProps = {
  recap: EventRecap;
  activeLang: ActiveLang;
  onLangChange(lang: ActiveLang): void;
  onChange(recap: EventRecap): void;
};

function updateList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function RecapContentStep({ recap, activeLang, onLangChange, onChange }: RecapContentStepProps) {
  const { t } = useLanguage();
  const languageLabel = activeLang === "zh" ? "中文" : "English";

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{t({ en: "Recap content", zh: "回顾内容" })}</h3>
        <div className="flex gap-2">
          {(["zh", "en"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onLangChange(option)}
              className={`rounded border px-3 py-1 text-sm font-medium ${
                activeLang === option
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              {option === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>
      </div>
      {activeLang === "en" ? (
        <p className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {t({ en: "English is optional. Empty fields fall back to Chinese on the public site.", zh: "英文内容为选填。为空时前台会自动显示中文。" })}
        </p>
      ) : null}
      <label className="block text-sm text-gray-600">
        {t(adminCopy.editor.title)} · {languageLabel}
        <input
          value={recap.title[activeLang]}
          onChange={(event) => onChange({ ...recap, title: { ...recap.title, [activeLang]: event.currentTarget.value } })}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.recapEditor.summary)} · {languageLabel}
        <textarea
          value={recap.summary[activeLang]}
          onChange={(event) => onChange({ ...recap, summary: { ...recap.summary, [activeLang]: event.currentTarget.value } })}
          rows={3}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.recapEditor.content)} · {languageLabel}
        <textarea
          value={recap.content[activeLang]}
          onChange={(event) => onChange({ ...recap, content: { ...recap.content, [activeLang]: event.currentTarget.value } })}
          rows={8}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.editor.locationZh)} · {languageLabel}
        <input
          value={recap.location[activeLang]}
          onChange={(event) => onChange({ ...recap, location: { ...recap.location, [activeLang]: event.currentTarget.value } })}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.editor.tags)} · {languageLabel}
        <textarea
          value={recap.tags[activeLang].join("\n")}
          onChange={(event) => onChange({ ...recap, tags: { ...recap.tags, [activeLang]: updateList(event.currentTarget.value) } })}
          rows={3}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
    </section>
  );
}
```

- [ ] **Step 4: Refactor recap editor form to use stepper and hidden JSON payload**

Replace the body of `src/components/admin/recap-editor-form.tsx` with a stateful structure similar to event editor:

```tsx
"use client";

import { useState } from "react";

import { useLanguage } from "@/lib/language";
import { updateRecapAction } from "@/lib/recaps/actions";
import type { EventRecap } from "@/lib/types";
import { localizedText } from "@/lib/i18n/fallback";
import { adminCopy } from "./admin-copy";
import { RecapBasicStep } from "./recap-basic-step";
import { RecapContentStep } from "./recap-content-step";
import { RecapEditorHeading } from "./recap-editor-heading";
import { RecapEditorStepper, type RecapStepId } from "./recap-editor-stepper";
import { RecapMediaManager } from "./recap-media-manager";
import { RecapPublishStep } from "./recap-publish-step";

type ActiveLang = "zh" | "en";

function recapPayload(recap: EventRecap) {
  return JSON.stringify(recap);
}

export function RecapEditorForm({ recap, saved }: { recap: EventRecap; saved?: boolean }) {
  const [draftRecap, setDraftRecap] = useState(recap);
  const [activeLang, setActiveLang] = useState<ActiveLang>("zh");
  const [activeStep, setActiveStep] = useState<RecapStepId>("basic");
  const { lang, t } = useLanguage();

  const summaries: Record<RecapStepId, string> = {
    basic: `${draftRecap.date || "—"} · ${localizedText(draftRecap.location, "zh") || draftRecap.slug}`,
    content: localizedText(draftRecap.title, activeLang) || draftRecap.slug,
    media: `${draftRecap.media.length} ${lang === "zh" ? "张照片" : "photos"}`,
    publish: draftRecap.status,
  };

  return (
    <div>
      <RecapEditorHeading recap={draftRecap} saved={saved} />
      <form action={updateRecapAction} className="space-y-5">
        <input type="hidden" name="slug" value={recap.slug} />
        <input type="hidden" name="recapPayload" value={recapPayload(draftRecap)} />
        <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
          <div className="xl:sticky xl:top-4 xl:self-start">
            <RecapEditorStepper activeStep={activeStep} onStepChange={setActiveStep} summaries={summaries} />
          </div>
          <div className="min-w-0">
            {activeStep === "basic" ? <RecapBasicStep recap={draftRecap} onChange={setDraftRecap} /> : null}
            {activeStep === "content" ? (
              <RecapContentStep recap={draftRecap} activeLang={activeLang} onLangChange={setActiveLang} onChange={setDraftRecap} />
            ) : null}
            {activeStep === "media" ? <RecapMediaManager recap={draftRecap} /> : null}
            {activeStep === "publish" ? <RecapPublishStep recap={draftRecap} activeLang={activeLang} onLangChange={setActiveLang} onChange={setDraftRecap} /> : null}
          </div>
          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
            <section className="card space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t({ en: "Preview", zh: "预览" })}</p>
              {draftRecap.coverImage ? <div className="h-32 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${draftRecap.coverImage})` }} /> : null}
              <h3 className="font-semibold text-gray-900">{localizedText(draftRecap.title, activeLang) || draftRecap.slug}</h3>
              <p className="text-sm text-gray-500">{localizedText(draftRecap.summary, activeLang)}</p>
            </section>
            <button type="submit" className="btn-primary w-full px-5 py-2">{t(adminCopy.editor.save)}</button>
          </aside>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Update `updateRecapAction` to parse JSON payload**

In `src/lib/recaps/actions.ts`, add:

```ts
function readRecapPayload(formData: FormData) {
  const raw = formText(formData, "recapPayload");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Partial<EventRecap>;
  } catch {
    return undefined;
  }
}
```

Change `updateRecapAction`:

```ts
const data = readRecapPayload(formData) ?? recapEditorInput(formData);
```

- [ ] **Step 6: Run build to catch component integration errors**

Run:

```bash
npm run build
```

Expected: Build may fail because `RecapMediaManager` and `RecapPublishStep` are not created yet. Type errors should only mention those missing modules.

---

### Task 8: Implement recap media manager UI

**Files:**
- Create: `src/components/admin/recap-media-manager.tsx`

- [ ] **Step 1: Create media manager component**

Create `src/components/admin/recap-media-manager.tsx`:

```tsx
"use client";

import { useState } from "react";

import {
  deleteRecapMediaAction,
  moveRecapMediaAction,
  setRecapCoverAction,
  updateRecapMediaCaptionAction,
  uploadRecapMediaAction,
} from "@/lib/recaps/actions";
import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

export function RecapMediaManager({ recap }: { recap: EventRecap }) {
  const { t } = useLanguage();
  const [advancedId, setAdvancedId] = useState<string | undefined>();

  return (
    <section className="card space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.recapEditor.media)}</h3>
        <p className="mt-1 text-sm text-gray-500">
          {t({ en: "Upload multiple recap photos, arrange the wall, and choose a cover image.", zh: "批量上传回顾照片，排序照片墙，并设置封面图。" })}
        </p>
      </div>

      <form action={uploadRecapMediaAction} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <input type="hidden" name="slug" value={recap.slug} />
        <label className="block text-sm font-medium text-gray-700">
          {t({ en: "Select photos", zh: "选择照片" })}
          <input name="mediaFiles" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="mt-2 block w-full text-sm text-gray-600" />
        </label>
        <button className="btn-primary mt-3 px-4 py-2 text-sm">{t({ en: "Upload selected photos", zh: "上传所选照片" })}</button>
      </form>

      {recap.media.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          {t({ en: "No photos yet. Upload photos to build the recap wall.", zh: "暂无照片。上传照片后即可生成回顾照片墙。" })}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recap.media.map((item, index) => (
            <article key={item.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="relative h-40 bg-gray-100">
                <img src={item.url} alt="" className="h-full w-full object-cover" />
                {item.isCover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {t({ en: "Cover", zh: "封面" })}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex flex-wrap gap-1">
                  <form action={moveRecapMediaAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button disabled={index === 0} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40">↑</button>
                  </form>
                  <form action={moveRecapMediaAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button disabled={index === recap.media.length - 1} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40">↓</button>
                  </form>
                  <form action={setRecapCoverAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <button className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">{t({ en: "Set cover", zh: "设为封面" })}</button>
                  </form>
                  <form action={deleteRecapMediaAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">{t(adminCopy.editor.delete)}</button>
                  </form>
                </div>
                <button type="button" onClick={() => setAdvancedId(advancedId === item.id ? undefined : item.id)} className="text-xs font-medium text-snow-600">
                  {t({ en: "Advanced settings", zh: "高级设置" })}
                </button>
                {advancedId === item.id ? (
                  <form action={updateRecapMediaCaptionAction} className="space-y-2 rounded bg-gray-50 p-2">
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <label className="block text-xs text-gray-600">
                      中文说明（选填）
                      <input name="caption.zh" defaultValue={item.caption?.zh ?? ""} className="mt-1 w-full rounded border border-gray-200 px-2 py-1" />
                    </label>
                    <label className="block text-xs text-gray-600">
                      English caption (optional)
                      <input name="caption.en" defaultValue={item.caption?.en ?? ""} className="mt-1 w-full rounded border border-gray-200 px-2 py-1" />
                    </label>
                    <button className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white">{t(adminCopy.editor.save)}</button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: Build may still fail because `RecapPublishStep` is missing; media manager imports should typecheck.

---

### Task 9: Implement publish/SEO step and public fallback display

**Files:**
- Create: `src/components/admin/recap-publish-step.tsx`
- Modify: `src/components/recaps/recap-detail-view.tsx`
- Modify: any recap list/card component under `src/components/recaps` or `src/app/recaps`

- [ ] **Step 1: Create publish step**

Create `src/components/admin/recap-publish-step.tsx`:

```tsx
"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type RecapPublishStepProps = {
  recap: EventRecap;
  activeLang: ActiveLang;
  onLangChange(lang: ActiveLang): void;
  onChange(recap: EventRecap): void;
};

export function RecapPublishStep({ recap, activeLang, onLangChange, onChange }: RecapPublishStepProps) {
  const { t } = useLanguage();
  const complete = Boolean(recap.title.zh && recap.summary.zh && recap.content.zh && recap.location.zh && recap.media.length > 0);

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.seoMedia)}</h3>
        <div className="flex gap-2">
          {(["zh", "en"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onLangChange(option)}
              className={`rounded border px-3 py-1 text-sm font-medium ${
                activeLang === option
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              {option === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>
      </div>
      <p className={complete ? "text-sm text-green-600" : "text-sm text-amber-600"}>
        {complete
          ? t({ en: "Chinese content and media are ready for publishing.", zh: "中文内容和照片已满足发布要求。" })
          : t({ en: "Complete Chinese title, summary, content, location, and at least one photo before publishing.", zh: "发布前请补全中文标题、摘要、正文、地点，并至少上传一张照片。" })}
      </p>
      <label className="block text-sm text-gray-600">
        {activeLang === "zh" ? t(adminCopy.editor.seoTitleZh) : t(adminCopy.editor.seoTitleEn)}
        <input
          value={recap.seoTitle[activeLang]}
          onChange={(event) => onChange({ ...recap, seoTitle: { ...recap.seoTitle, [activeLang]: event.currentTarget.value } })}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {activeLang === "zh" ? t(adminCopy.editor.seoDescriptionZh) : t(adminCopy.editor.seoDescriptionEn)}
        <textarea
          value={recap.seoDescription[activeLang]}
          onChange={(event) => onChange({ ...recap, seoDescription: { ...recap.seoDescription, [activeLang]: event.currentTarget.value } })}
          rows={3}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
    </section>
  );
}
```

- [ ] **Step 2: Update public recap detail fallback**

In `src/components/recaps/recap-detail-view.tsx`, import helper:

```ts
import { localizedList, localizedText } from "@/lib/i18n/fallback";
```

Replace direct bilingual reads with fallback:

```tsx
const title = localizedText(recap.title, lang);
const summary = localizedText(recap.summary, lang);
const content = localizedText(recap.content, lang);
const location = localizedText(recap.location, lang);
const tags = localizedList(recap.tags, lang);
```

Render media wall without requiring captions:

```tsx
{recap.media.map((item) => (
  <figure key={item.id} className="overflow-hidden rounded-2xl bg-white">
    <img src={item.url} alt={localizedText({ zh: item.caption?.zh ?? "", en: item.caption?.en ?? "" }, lang)} className="h-full w-full object-cover" />
    {localizedText({ zh: item.caption?.zh ?? "", en: item.caption?.en ?? "" }, lang) ? (
      <figcaption className="px-3 py-2 text-sm text-gray-500">
        {localizedText({ zh: item.caption?.zh ?? "", en: item.caption?.en ?? "" }, lang)}
      </figcaption>
    ) : null}
  </figure>
))}
```

- [ ] **Step 3: Update recap cards/list fallback**

Find recap card/list display under `src/components/recaps` and `src/app/recaps`. Replace direct `recap.title[lang]`, `recap.summary[lang]`, `recap.location[lang]`, and `recap.tags[lang]` with `localizedText()` / `localizedList()`.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS or warnings only. Fix any TypeScript errors before continuing.

---

### Task 10: Update recap publish/status behavior and admin list filters

**Files:**
- Modify: `src/app/admin/recaps/status/route.ts`
- Modify: `src/components/admin/admin-recaps-view.tsx`
- Modify: `src/lib/recaps/actions.ts`

- [ ] **Step 1: Enforce visible status changes only in status route**

In `src/app/admin/recaps/status/route.ts`, ensure only draft/published can be set from quick toggle:

```ts
if (slug && ["draft", "published"].includes(status)) {
  await updateRecap(slug, { status: status as "draft" | "published" });
  revalidatePath("/recaps");
  revalidatePath(`/recaps/${slug}`);
  revalidatePath("/admin/recaps");
}
```

Do not allow `hidden` from this route.

- [ ] **Step 2: Update publish checklist in list**

In `src/components/admin/admin-recaps-view.tsx`, change missing fields so English is not required:

```ts
function recapMissingFields(recap: EventRecap) {
  const missing: string[] = [];
  if (!recap.title.zh) missing.push("中文标题");
  if (!recap.summary.zh) missing.push("中文摘要");
  if (!recap.content.zh) missing.push("中文正文");
  if (!recap.location.zh) missing.push("中文地点");
  if (recap.media.length === 0) missing.push("media");
  return missing;
}
```

- [ ] **Step 3: Ensure admin list does not receive hidden recaps by default**

Confirm `src/app/admin/recaps/page.tsx` still calls:

```ts
recaps = await getAllRecaps();
```

Expected: hidden recaps excluded by Task 3 repository behavior.

- [ ] **Step 4: Run repository tests**

Run:

```bash
npm test -- src/lib/recaps/repository.test.ts
```

Expected: PASS.

---

### Task 11: Verify archive behavior and event list removal

**Files:**
- Modify: `src/lib/events/repository.ts` if needed
- Modify: `src/components/admin/admin-events-view.tsx` if needed
- Modify: `src/lib/events/actions.test.ts` if archive behavior tests exist

- [ ] **Step 1: Inspect admin event list source**

Read `src/lib/events/repository.ts` and find `getAllEvents()`. Determine whether archived events are included.

Expected desired behavior: `getAllEvents()` for activity management excludes `archived`, or `AdminEventsView` filters `events.filter((event) => event.status !== "archived")`.

- [ ] **Step 2: Write failing test if repository owns filtering**

If `getAllEvents()` should exclude archived, add a test in `src/lib/events/repository.test.ts`:

```ts
it("keeps archived events out of the admin event management list", async () => {
  const repository = createEventRepository(eventSource([
    eventRow("draft", "draft"),
    eventRow("archived", "archived"),
  ]));

  expect((await repository.getAllEvents()).map((event) => event.slug)).toEqual(["draft"]);
});
```

Use existing test helpers from that file; do not invent new helper names if different helpers already exist.

- [ ] **Step 3: Implement event filtering**

If repository owns filtering, update `getAllEvents()` to filter out archived. If UI owns filtering, update `AdminEventsView` input rendering:

```ts
const visibleEvents = events.filter((event) => event.status !== "archived");
```

Then map `visibleEvents` instead of `events`.

- [ ] **Step 4: Verify archive still redirects to recap management**

Run existing event actions tests:

```bash
npm test -- src/lib/events/actions.test.ts
```

Expected: PASS. If tests do not cover redirect, rely on build and existing archive helper behavior.

---

### Task 12: Final verification

**Files:**
- All changed files

- [ ] **Step 1: Run LSP diagnostics on changed TypeScript/TSX files**

Run `lsp_diagnostics` for:

```txt
src/lib/types.ts
src/lib/i18n/fallback.ts
src/lib/i18n/fallback.test.ts
src/lib/recaps/repository.ts
src/lib/recaps/repository.test.ts
src/lib/recaps/actions.ts
src/lib/recaps/actions.test.ts
src/components/admin/recap-editor-form.tsx
src/components/admin/recap-editor-stepper.tsx
src/components/admin/recap-basic-step.tsx
src/components/admin/recap-content-step.tsx
src/components/admin/recap-media-manager.tsx
src/components/admin/recap-publish-step.tsx
src/components/admin/admin-recaps-view.tsx
src/components/recaps/recap-detail-view.tsx
```

Expected: In this environment LSP may return `Not connected`; if so, record that and rely on build.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- src/lib/i18n/fallback.test.ts src/lib/recaps/repository.test.ts src/lib/recaps/actions.test.ts src/lib/events/actions.test.ts
```

Expected: PASS. If `src/lib/events/actions.test.ts` does not exist or fails from unrelated pre-existing behavior, report exact output and run the existing relevant events test file.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS or documented pre-existing failures unrelated to this change.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Existing `<img>` warnings are acceptable only if build exits 0.

- [ ] **Step 5: Manual browser QA**

Use the Playwright/webapp testing workflow against local dev server:

1. Start dev server with `npm run dev`.
2. Open `/staff-login` and authenticate using local admin credentials if available.
3. Open `/admin/events` and archive a draft/published test event.
4. Confirm event disappears from `/admin/events`.
5. Confirm corresponding recap appears in `/admin/recaps`.
6. Open recap editor.
7. Confirm default language is 中文.
8. Switch to English and leave fields empty.
9. Upload multiple images in the media step.
10. Confirm grid previews appear.
11. Set a cover image.
12. Move an image up/down.
13. Delete one image.
14. Open advanced settings and save a Chinese-only caption.
15. Publish recap.
16. Open public recap page in English and confirm empty English fields fallback to Chinese.
17. Return to admin recap list and Unarchive.
18. Confirm published recap prompts before restore.
19. Confirm event returns to `/admin/events` as draft.
20. Confirm recap disappears from `/admin/recaps` and public `/recaps`.

Expected: All steps work. If credentials are unavailable, document that browser QA could not authenticate and report automated verification only.

---

## Self-Review Notes

- Spec coverage: The plan covers modular editor, language switching, default Chinese, optional English, public fallback, media upload/delete/sort/cover/advanced caption, `recap-media` bucket, archive-to-recap, unarchive-to-draft/hidden, and test/build/manual verification.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain. Steps include concrete code or exact commands.
- Type consistency: `RecapStatus`, `RecapMediaItem`, `EventRecap.media`, `RecapStepId`, and server action names are defined before use.
