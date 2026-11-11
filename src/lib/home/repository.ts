import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { getUsCommerceRegion } from "@/lib/shop/storefront-repository";
import { commerceClient, type CommerceRequest } from "@/lib/shop/commerce-client";
import { mapStoreProduct, nativeProductSchema } from "@/lib/shop/storefront";
import type { HomeEvent, HomeRecap } from "./types";

const text = z.string().nullish().transform(value => value ?? "");
const eventRow = z.object({
  slug: z.string(), status: z.enum(["draft", "published", "archived"]), registration_state: z.enum(["open", "full", "closed"]),
  title_en: text, title_zh: text, event_date: text, activity_location_en: text, activity_location_zh: text,
  cover_image: text, fee_amount: text, meet_time: text, meet_location_en: text, meet_location_zh: text, registration_close_at: text,
});
const recapRow = z.object({
  slug: z.string(), status: z.enum(["draft", "published", "hidden"]), title_en: text, title_zh: text,
  summary_en: text, summary_zh: text, date: text, location_en: text, location_zh: text, cover_image: text,
});

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Public homepage data is not configured.");
  // Deliberately independent of cookies, sessions and privileged credentials.
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadHomeEvents(client: SupabaseClient): Promise<HomeEvent[]> {
  const { data, error } = await client.from("events")
    .select(Object.keys(eventRow.shape).join(","))
    .eq("status", "published").in("registration_state", ["open", "full"])
    .order("registration_state", { ascending: false })
    .order("event_date", { ascending: true, nullsFirst: false }).order("slug").limit(3);
  if (error) throw new Error(error.message);
  return z.array(eventRow).parse(data ?? []).filter(row => row.status === "published" && row.registration_state !== "closed").slice(0, 3).map(row => ({
    slug: row.slug, status: row.status, registrationState: row.registration_state,
    title: { en: row.title_en, zh: row.title_zh }, eventDate: row.event_date,
    activityLocation: { en: row.activity_location_en, zh: row.activity_location_zh }, coverImage: row.cover_image,
    feeAmount: row.fee_amount, meetTime: row.meet_time, meetLocation: { en: row.meet_location_en, zh: row.meet_location_zh }, registrationCloseAt: row.registration_close_at,
  }));
}

export async function loadHomeRecaps(client: SupabaseClient): Promise<HomeRecap[]> {
  const { data, error } = await client.from("event_recaps").select(Object.keys(recapRow.shape).join(","))
    .eq("status", "published").order("date", { ascending: false }).order("slug").limit(3);
  if (error) throw new Error(error.message);
  return z.array(recapRow).parse(data ?? []).filter(row => row.status === "published").slice(0, 3).map(row => ({
    slug: row.slug, status: row.status, title: { en: row.title_en, zh: row.title_zh },
    summary: { en: row.summary_en, zh: row.summary_zh }, date: row.date,
    location: { en: row.location_en, zh: row.location_zh }, coverImage: row.cover_image,
  }));
}

/** A homepage needs three invitations, not a crawl of every SKU and collection. */
export async function loadHomeProducts(request: CommerceRequest) {
  const regionId = await getUsCommerceRegion(request);
  const query = new URLSearchParams({
    limit: "3", order: "created_at",
    fields: "id,handle,title,status,thumbnail,metadata,*variants,+variants.inventory_quantity" + (regionId ? ",+variants.calculated_price" : ""),
    ...(regionId ? { region_id: regionId, country_code: "us" } : {}),
  });
  const page = await request(`/store/products?${query}`, z.object({ products: z.array(nativeProductSchema), count: z.number() }));
  return page.products.slice(0, 3).flatMap(row => {
    const product = mapStoreProduct(row);
    if (!product) return [];
    // Only presentation data crosses the RSC boundary. Checkout reads current variants.
    return [{ ...product, description: { en: "", zh: "" }, images: [], options: [], variants: product.variants.map(variant => ({ ...variant, options: {} })) }];
  });
}

// Data Cache persists across requests; React.cache alone only deduplicates one render.
// Keep failures outside these functions so an outage is never cached as empty content.
const project = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "unconfigured";
export const getHomeEvents = unstable_cache(() => loadHomeEvents(publicClient()), ["home-events-v1", project], { revalidate: 300 });
export const getHomeRecaps = unstable_cache(() => loadHomeRecaps(publicClient()), ["home-recaps-v1", project], { revalidate: 300 });
export const getHomeProducts = unstable_cache(() => loadHomeProducts(commerceClient()), ["home-products-v1", process.env.MEDUSA_BACKEND_URL ?? "unconfigured", process.env.MEDUSA_US_REGION_ID ?? "auto"], { revalidate: 300 });
