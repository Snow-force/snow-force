import { createClient } from "@/lib/supabase/server";
import type { MemberEquipmentRow, MemberNotification, MemberPass, SavedEvent } from "@/lib/types";

type PassRow = { id: string; profile_id: string; pass_type: string; label: string; created_at: string };
type EquipmentRow = { id: string; profile_id: string; owns_skis: boolean; owns_snowboard: boolean; owns_boots: boolean; needs_rental_help: boolean; note: string; updated_at: string };
type SavedEventRow = { id: string; profile_id: string; event_slug: string; saved_at: string };
type NotificationRow = { id: string; profile_id: string; type: string; title: string; body: string; href: string; read_at: string | null; created_at: string };

function toPass(row: PassRow): MemberPass {
  return { id: row.id, profileId: row.profile_id, passType: row.pass_type as MemberPass["passType"], label: row.label, createdAt: row.created_at };
}
function toEquipment(row: EquipmentRow): MemberEquipmentRow {
  return { id: row.id, profileId: row.profile_id, ownsSkis: row.owns_skis, ownsSnowboard: row.owns_snowboard, ownsBoots: row.owns_boots, needsRentalHelp: row.needs_rental_help, note: row.note, updatedAt: row.updated_at };
}
function toSaved(row: SavedEventRow): SavedEvent {
  return { id: row.id, profileId: row.profile_id, eventSlug: row.event_slug, savedAt: row.saved_at };
}
function toNotification(row: NotificationRow): MemberNotification {
  return { id: row.id, profileId: row.profile_id, type: row.type as MemberNotification["type"], title: row.title, body: row.body, href: row.href, readAt: row.read_at, createdAt: row.created_at };
}

export async function getMemberPasses(profileId: string): Promise<MemberPass[]> {
  const { data } = await (await createClient()).from("member_passes").select("*").eq("profile_id", profileId).order("created_at");
  return ((data ?? []) as PassRow[]).map(toPass);
}

export async function addMemberPass(profileId: string, passType: MemberPass["passType"], label = "") {
  const { data } = await (await createClient()).from("member_passes").insert({ profile_id: profileId, pass_type: passType, label }).select("*").single();
  if (!data) return null;
  return toPass(data as PassRow);
}

export async function removeMemberPass(passId: string) {
  await (await createClient()).from("member_passes").delete().eq("id", passId);
}

export async function getMemberEquipment(profileId: string): Promise<MemberEquipmentRow | null> {
  const { data } = await (await createClient()).from("member_equipment").select("*").eq("profile_id", profileId).maybeSingle<EquipmentRow>();
  return data ? toEquipment(data) : null;
}

export async function upsertMemberEquipment(profileId: string, equipment: Partial<Omit<MemberEquipmentRow, "id" | "profileId" | "updatedAt">>) {
  const exists = await getMemberEquipment(profileId);
  const row = {
    profile_id: profileId,
    owns_skis: equipment.ownsSkis ?? false,
    owns_snowboard: equipment.ownsSnowboard ?? false,
    owns_boots: equipment.ownsBoots ?? false,
    needs_rental_help: equipment.needsRentalHelp ?? false,
    note: equipment.note ?? "",
  };
  if (exists) {
    const { data } = await (await createClient()).from("member_equipment").update(row).eq("profile_id", profileId).select("*").maybeSingle<EquipmentRow>();
    return data ? toEquipment(data) : null;
  }
  const { data } = await (await createClient()).from("member_equipment").insert(row).select("*").single<EquipmentRow>();
  return data ? toEquipment(data) : null;
}

export async function getSavedEvents(profileId: string): Promise<SavedEvent[]> {
  const { data } = await (await createClient()).from("saved_events").select("*").eq("profile_id", profileId).order("saved_at", { ascending: true });
  return ((data ?? []) as SavedEventRow[]).map(toSaved);
}

export async function saveEvent(profileId: string, eventSlug: string) {
  const { data } = await (await createClient()).from("saved_events").insert({ profile_id: profileId, event_slug: eventSlug }).select("*").single();
  return data ? toSaved(data as SavedEventRow) : null;
}

export async function unsaveEvent(profileId: string, eventSlug: string) {
  await (await createClient()).from("saved_events").delete().eq("profile_id", profileId).eq("event_slug", eventSlug);
}

export async function getNotifications(profileId: string): Promise<MemberNotification[]> {
  const { data } = await (await createClient()).from("notifications").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(20);
  return ((data ?? []) as NotificationRow[]).map(toNotification);
}

export async function markNotificationRead(notificationId: string) {
  await (await createClient()).from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
}

export async function createNotification(profileId: string, type: MemberNotification["type"], title: string, body = "", href = "") {
  const { data } = await (await createClient()).from("notifications").insert({ profile_id: profileId, type, title, body, href }).select("*").single();
  return data ? toNotification(data as NotificationRow) : null;
}
