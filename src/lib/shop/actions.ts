"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import type { ShopCategory, ShopItem, ShopItemStatus } from "./types";
import { saveShopItem, deleteShopItem } from "./repository";

export type ShopItemFormData = {
  id?: string;
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
  partner_brand: string;
  status: ShopItemStatus;
  sort_order: number;
};

export async function saveShopItemAction(data: ShopItemFormData) {
  await requireAdmin();

  const item: ShopItem = {
    id: data.id ?? "",
    slug: data.slug,
    name: { en: data.name_en, zh: data.name_zh },
    description: { en: data.description_en, zh: data.description_zh },
    category: data.category,
    priceUsd: data.price_usd,
    coverImage: data.cover_image,
    images: data.images,
    externalUrl: data.external_url,
    partnerBrand: data.partner_brand || null,
    status: data.status,
    sortOrder: data.sort_order,
    createdAt: new Date().toISOString(),
  };

  await saveShopItem(item);
  revalidatePath("/shop");
  revalidatePath("/admin/shop");

  return { success: true };
}

export async function deleteShopItemAction(slug: string) {
  await requireAdmin();

  await deleteShopItem(slug);
  revalidatePath("/shop");
  revalidatePath("/admin/shop");

  return { success: true };
}
