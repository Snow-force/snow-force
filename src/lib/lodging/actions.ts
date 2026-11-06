"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { parseCatalogForm } from "./catalog";
import { lodgingAdminEnabled, saveCatalog } from "./repository";

export type CatalogState = { code: "idle" | "saved" | "invalid" | "conflict" | "unavailable"; field?: string };
export async function saveLodgingCatalog(_previous: CatalogState, form: FormData): Promise<CatalogState> {
  const staff = await requireAdmin();
  if (!lodgingAdminEnabled()) return { code: "unavailable" };
  const kind = form.get("kind");
  if (kind !== "property" && kind !== "room" && kind !== "offer") return { code: "invalid" };
  const result = parseCatalogForm(kind, form);
  if (!result.success) return { code: "invalid", field: result.error.issues[0]?.path.join(".") };
  try { await saveCatalog(kind, result.data, staff.userId); }
  catch (error) { return { code: error instanceof Error && error.message === "conflict" ? "conflict" : "unavailable" }; }
  revalidatePath("/admin/lodging");
  if (kind === "offer" && "event_slug" in result.data) revalidatePath(`/admin/events/${result.data.event_slug}/edit`);
  return { code: "saved" };
}
