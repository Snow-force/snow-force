import { createClient } from "@supabase/supabase-js";

import type { ShopCategory, ShopItem } from "./types";

export type ShopItemRow = {
  id: string;
  slug: string;
  name_en: string;
  name_zh: string;
  description_en: string;
  description_zh: string;
  category: ShopCategory;
  price_usd: number;
  cover_image: string;
  images: string[];
  external_url: string;
  partner_brand: string | null;
  status: ShopItem["status"];
  sort_order: number;
  created_at: string;
};

export type ShopSource = {
  listPublished(): Promise<ShopItemRow[]>;
  getBySlug(slug: string): Promise<ShopItemRow | undefined>;
  listAll(): Promise<ShopItemRow[]>;
  upsert(row: ShopItemRow): Promise<ShopItemRow>;
  deleteBySlug(slug: string): Promise<void>;
};

function rowToShopItem(row: ShopItemRow): ShopItem {
  return {
    id: row.id,
    slug: row.slug,
    name: { en: row.name_en, zh: row.name_zh },
    description: { en: row.description_en, zh: row.description_zh },
    category: row.category,
    priceUsd: row.price_usd,
    coverImage: row.cover_image,
    images: row.images ?? [],
    externalUrl: row.external_url,
    partnerBrand: row.partner_brand,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error("Supabase is not configured.");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase admin key is not configured.");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function supabaseShopSource(): ShopSource {
  return {
    async listPublished() {
      const { data, error } = await createPublicClient()
        .from("shop_items")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true });

      throwSupabaseError(error);
      return (data ?? []) as ShopItemRow[];
    },
    async getBySlug(slug) {
      const { data, error } = await createPublicClient()
        .from("shop_items")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      throwSupabaseError(error);
      return (data ?? undefined) as ShopItemRow | undefined;
    },
    async listAll() {
      const { data, error } = await createAdminClient()
        .from("shop_items")
        .select("*")
        .order("sort_order", { ascending: true });

      throwSupabaseError(error);
      return (data ?? []) as ShopItemRow[];
    },
    async upsert(row) {
      const { data, error } = await createAdminClient()
        .from("shop_items")
        .upsert(row)
        .select("*")
        .single();

      throwSupabaseError(error);
      return data as ShopItemRow;
    },
    async deleteBySlug(slug) {
      const { error } = await createAdminClient()
        .from("shop_items")
        .delete()
        .eq("slug", slug);

      throwSupabaseError(error);
    },
  };
}

export function createShopRepository(source: ShopSource) {
  return {
    async getShopItems(): Promise<ShopItem[]> {
      return (await source.listPublished()).map(rowToShopItem);
    },
    async getShopItem(slug: string): Promise<ShopItem | undefined> {
      const row = await source.getBySlug(slug);
      return row ? rowToShopItem(row) : undefined;
    },
    async getRelatedItems(item: ShopItem): Promise<ShopItem[]> {
      const all = await source.listPublished();
      return all
        .filter((row) => row.category === item.category && row.slug !== item.slug)
        .slice(0, 3)
        .map(rowToShopItem);
    },
    async getAllShopItems(): Promise<ShopItem[]> {
      return (await source.listAll()).map(rowToShopItem);
    },
    async saveShopItem(item: ShopItem): Promise<ShopItem> {
      const row: ShopItemRow = {
        id: item.id,
        slug: item.slug,
        name_en: item.name.en,
        name_zh: item.name.zh,
        description_en: item.description.en,
        description_zh: item.description.zh,
        category: item.category,
        price_usd: item.priceUsd,
        cover_image: item.coverImage,
        images: item.images,
        external_url: item.externalUrl,
        partner_brand: item.partnerBrand,
        status: item.status,
        sort_order: item.sortOrder,
        created_at: item.createdAt,
      };
      const saved = await source.upsert(row);
      return rowToShopItem(saved);
    },
    async deleteShopItem(slug: string): Promise<void> {
      await source.deleteBySlug(slug);
    },
  };
}

const repository = createShopRepository(supabaseShopSource());

export const getShopItems = repository.getShopItems;
export const getShopItem = repository.getShopItem;
export const getRelatedItems = repository.getRelatedItems;
export const getAllShopItems = repository.getAllShopItems;
export const saveShopItem = repository.saveShopItem;
export const deleteShopItem = repository.deleteShopItem;
