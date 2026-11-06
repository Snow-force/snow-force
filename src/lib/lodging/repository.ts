import "server-only";
import { createClient } from "@supabase/supabase-js";
import { catalogTables, type Catalog, type CatalogKind } from "./catalog";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Lodging database is not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export function lodgingAdminEnabled() { return process.env.LODGING_ADMIN_ENABLED === "true"; }
export async function loadCatalog(eventSlug?: string): Promise<Catalog> {
  const db = client();
  const results = await Promise.all(Object.values(catalogTables).map(t => {
    const query = db.from(t).select("*");
    return (eventSlug && t === catalogTables.offer ? query.eq("event_slug", eventSlug) : query).order("created_at");
  }));
  for (const result of results) if (result.error) throw new Error(result.error.message);
  return { properties: results[0].data ?? [], rooms: results[1].data ?? [], offers: results[2].data ?? [] };
}
export async function saveCatalog(kind: CatalogKind, input: Record<string, unknown>, actor: string) {
  const { id, version, ...fields } = input;
  const db = client();
  const row = { ...fields, updated_by: actor };
  if (id) {
    const { data, error } = await db.from(catalogTables[kind]).update({ ...row, version: Number(version) + 1 }).eq("id", id).eq("version", version).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("conflict");
  } else {
    const { error } = await db.from(catalogTables[kind]).insert(row);
    if (error) throw new Error(error.message);
  }
}
