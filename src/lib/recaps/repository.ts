import type { Bilingual, EventRecap } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";
import { seedRecaps } from "./seed";

export type RecapRow = {
  slug: string;
  status: EventRecap["status"];
  title_en: string;
  title_zh: string;
  summary_en: string | null;
  summary_zh: string | null;
  content_en: string | null;
  content_zh: string | null;
  date: string;
  location_en: string | null;
  location_zh: string | null;
  cover_image: string | null;
  media: unknown;
  tags_en: unknown;
  tags_zh: unknown;
  seo_title_en: string | null;
  seo_title_zh: string | null;
  seo_description_en: string | null;
  seo_description_zh: string | null;
  event_slug: string | null;
};

export type RecapSource = {
  listPublic(): Promise<RecapRow[]>;
  listAdmin(): Promise<RecapRow[]>;
  getPublic(slug: string): Promise<RecapRow | undefined>;
  insert(recap: EventRecap): Promise<RecapRow>;
  updateAdmin(slug: string, data: Partial<EventRecap>): Promise<RecapRow | undefined>;
};

const recapColumns = [
  "slug",
  "status",
  "title_en",
  "title_zh",
  "summary_en",
  "summary_zh",
  "content_en",
  "content_zh",
  "date",
  "location_en",
  "location_zh",
  "cover_image",
  "media",
  "tags_en",
  "tags_zh",
  "seo_title_en",
  "seo_title_zh",
  "seo_description_en",
  "seo_description_zh",
  "event_slug",
].join(",");

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function normalizeCaption(value: unknown): Partial<Bilingual> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const en = typeof obj.en === "string" ? obj.en : undefined;
  const zh = typeof obj.zh === "string" ? obj.zh : undefined;
  if (en === undefined && zh === undefined) return undefined;
  const caption: Partial<Bilingual> = {};
  if (en !== undefined) caption.en = en;
  if (zh !== undefined) caption.zh = zh;
  return caption;
}

function mediaItems(value: unknown, slug: string, coverImage: string): EventRecap["media"] {
  if (!Array.isArray(value)) return [];

  const items = value
    .map((item, index): EventRecap["media"][number] | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const media = item as Record<string, unknown>;
      if (typeof media.url !== "string" || !media.url) return undefined;

      return {
        id: typeof media.id === "string" && media.id ? media.id : `${slug}-${index}`,
        type: "image",
        url: media.url,
        storagePath: typeof media.storagePath === "string" ? media.storagePath : "",
        caption: normalizeCaption(media.caption),
        order: typeof media.order === "number" ? media.order : index,
        isCover: typeof media.isCover === "boolean" ? media.isCover : media.url === coverImage,
      };
    })
    .filter((item): item is EventRecap["media"][number] => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .map((item, order) => ({ ...item, order }));

  if (items.length > 0 && !items.some((item) => item.isCover)) {
    items[0] = { ...items[0], isCover: true };
  }

  return items;
}

function recapToRow(recap: Partial<EventRecap>) {
  return {
    ...(recap.status !== undefined ? { status: recap.status } : {}),
    ...(recap.title !== undefined ? { title_en: recap.title.en, title_zh: recap.title.zh } : {}),
    ...(recap.summary !== undefined ? { summary_en: recap.summary.en, summary_zh: recap.summary.zh } : {}),
    ...(recap.content !== undefined ? { content_en: recap.content.en, content_zh: recap.content.zh } : {}),
    ...(recap.date !== undefined ? { date: recap.date } : {}),
    ...(recap.location !== undefined ? { location_en: recap.location.en, location_zh: recap.location.zh } : {}),
    ...(recap.coverImage !== undefined ? { cover_image: recap.coverImage } : {}),
    ...(recap.media !== undefined ? { media: recap.media } : {}),
    ...(recap.tags !== undefined ? { tags_en: recap.tags.en, tags_zh: recap.tags.zh } : {}),
    ...(recap.seoTitle !== undefined ? { seo_title_en: recap.seoTitle.en, seo_title_zh: recap.seoTitle.zh } : {}),
    ...(recap.seoDescription !== undefined
      ? { seo_description_en: recap.seoDescription.en, seo_description_zh: recap.seoDescription.zh }
      : {}),
    ...("eventSlug" in recap ? { event_slug: recap.eventSlug as string | null } : {}),
  };
}

function rowToRecap(row: RecapRow): EventRecap {
  return {
    slug: row.slug,
    status: row.status,
    title: { en: row.title_en, zh: row.title_zh },
    summary: { en: row.summary_en ?? "", zh: row.summary_zh ?? "" },
    content: { en: row.content_en ?? "", zh: row.content_zh ?? "" },
    date: row.date,
    location: { en: row.location_en ?? "", zh: row.location_zh ?? "" },
    coverImage: row.cover_image ?? "",
    media: mediaItems(row.media, row.slug, row.cover_image ?? ""),
    tags: { en: stringArray(row.tags_en), zh: stringArray(row.tags_zh) },
    seoTitle: { en: row.seo_title_en ?? "", zh: row.seo_title_zh ?? "" },
    seoDescription: {
      en: row.seo_description_en ?? "",
      zh: row.seo_description_zh ?? "",
    },
    eventSlug: row.event_slug ?? undefined,
  };
}

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

function createPublicRecapClient() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Supabase publishable key is not configured.");

  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createAdminRecapClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase admin writes are not configured.");

  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function supabaseRecapSource(): RecapSource {
  return {
    async listPublic() {
      const { data, error } = await createPublicRecapClient()
        .from("event_recaps")
        .select(recapColumns)
        .order("date", { ascending: false });
      throwSupabaseError(error);
      return (data ?? []) as unknown as RecapRow[];
    },
    async listAdmin() {
      const { data, error } = await createAdminRecapClient()
        .from("event_recaps")
        .select(recapColumns)
        .order("date", { ascending: false });
      throwSupabaseError(error);
      return (data ?? []) as unknown as RecapRow[];
    },
    async getPublic(slug) {
      const { data, error } = await createPublicRecapClient()
        .from("event_recaps")
        .select(recapColumns)
        .eq("slug", slug)
        .maybeSingle();
      throwSupabaseError(error);
      return (data ?? undefined) as RecapRow | undefined;
    },
    async insert(recap) {
      const { data, error } = await createAdminRecapClient()
        .from("event_recaps")
        .insert({ slug: recap.slug, ...recapToRow(recap) })
        .select(recapColumns)
        .single();
      throwSupabaseError(error);
      return data as unknown as RecapRow;
    },
    async updateAdmin(slug, data) {
      const { data: row, error } = await createAdminRecapClient()
        .from("event_recaps")
        .update(recapToRow(data))
        .eq("slug", slug)
        .select(recapColumns)
        .maybeSingle();
      throwSupabaseError(error);
      return (row ?? undefined) as RecapRow | undefined;
    },
  };
}

function seedRecapSource(): RecapSource {
  const rows = seedRecaps.map<RecapRow>((recap) => ({
    slug: recap.slug,
    status: recap.status,
    title_en: recap.title.en,
    title_zh: recap.title.zh,
    summary_en: recap.summary.en,
    summary_zh: recap.summary.zh,
    content_en: recap.content.en,
    content_zh: recap.content.zh,
    date: recap.date,
    location_en: recap.location.en,
    location_zh: recap.location.zh,
    cover_image: recap.coverImage,
    media: recap.media,
    tags_en: recap.tags.en,
    tags_zh: recap.tags.zh,
    seo_title_en: recap.seoTitle.en,
    seo_title_zh: recap.seoTitle.zh,
    seo_description_en: recap.seoDescription.en,
    seo_description_zh: recap.seoDescription.zh,
    event_slug: null,
  }));

  return {
    listPublic: async () => rows.filter((row) => row.status === "published"),
    listAdmin: async () => rows,
    getPublic: async (slug) => rows.find((row) => row.slug === slug && row.status === "published"),
    insert: async (recap) => {
      const row: RecapRow = {
        slug: recap.slug,
        status: recap.status,
        title_en: recap.title.en,
        title_zh: recap.title.zh,
        summary_en: recap.summary.en,
        summary_zh: recap.summary.zh,
        content_en: recap.content.en,
        content_zh: recap.content.zh,
        date: recap.date,
        location_en: recap.location.en,
        location_zh: recap.location.zh,
        cover_image: recap.coverImage,
        media: recap.media,
        tags_en: recap.tags.en,
        tags_zh: recap.tags.zh,
        seo_title_en: recap.seoTitle.en,
        seo_title_zh: recap.seoTitle.zh,
        seo_description_en: recap.seoDescription.en,
        seo_description_zh: recap.seoDescription.zh,
        event_slug: null,
      };
      rows.push(row);
      return row;
    },
    updateAdmin: async (slug, data) => {
      const index = rows.findIndex((row) => row.slug === slug);
      if (index === -1) return undefined;
      rows[index] = { ...rows[index], ...recapToRow(data) };
      return rows[index];
    },
  };
}

export function createRecapRepository(source: RecapSource) {
  return {
    async getRecaps() {
      return (await source.listPublic())
        .filter((row) => row.status === "published")
        .map(rowToRecap);
    },
    async getRecap(slug: string) {
      const row = await source.getPublic(slug);
      return row?.status === "published" ? rowToRecap(row) : undefined;
    },
    async getRecapAdmin(slug: string) {
      const rows = await source.listAdmin();
      const row = rows.find((r) => r.slug === slug);
      return row ? rowToRecap(row) : undefined;
    },
    async getAllRecaps(options: { includeHidden?: boolean } = {}) {
      const rows = await source.listAdmin();
      return rows
        .filter((row) => options.includeHidden || row.status !== "hidden")
        .map(rowToRecap);
    },
    async insertRecap(recap: EventRecap) {
      return rowToRecap(await source.insert(recap));
    },
    async updateRecap(slug: string, data: Partial<EventRecap>) {
      const row = await source.updateAdmin(slug, data);
      return row ? rowToRecap(row) : undefined;
    },
  };
}

const repository = createRecapRepository(hasSupabaseConfig() ? supabaseRecapSource() : seedRecapSource());

export const getRecaps = repository.getRecaps;
export const getRecap = repository.getRecap;
export const getRecapAdmin = repository.getRecapAdmin;
export const getAllRecaps = repository.getAllRecaps;
export const insertRecap = repository.insertRecap;
export const updateRecap = repository.updateRecap;
