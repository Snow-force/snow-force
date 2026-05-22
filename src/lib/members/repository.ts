import type { MemberProfile } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

type MemberProfileRow = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  rider_level_en: string | null;
  rider_level_zh: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  created_at: string;
  updated_at: string;
};

function toMemberProfile(row: MemberProfileRow): MemberProfile {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone ?? "",
    riderLevel: { en: row.rider_level_en ?? "", zh: row.rider_level_zh ?? "" },
    emergencyContact: row.emergency_contact ?? "",
    emergencyPhone: row.emergency_phone ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getMemberProfile(userId: string): Promise<MemberProfile | undefined> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("member_profiles")
    .select(
      "id,user_id,display_name,email,phone,rider_level_en,rider_level_zh,emergency_contact,emergency_phone,created_at,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle<MemberProfileRow>();

  if (error || !data) return undefined;
  return toMemberProfile(data);
}

export async function updateMemberProfile(
  userId: string,
  data: Partial<Omit<MemberProfile, "id" | "userId" | "createdAt">>,
): Promise<MemberProfile | undefined> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("member_profiles")
    .update({
      display_name: data.displayName,
      phone: data.phone,
      rider_level_en: data.riderLevel?.en,
      rider_level_zh: data.riderLevel?.zh,
      emergency_contact: data.emergencyContact,
      emergency_phone: data.emergencyPhone,
    })
    .eq("user_id", userId)
    .select(
      "id,user_id,display_name,email,phone,rider_level_en,rider_level_zh,emergency_contact,emergency_phone,created_at,updated_at",
    )
    .maybeSingle<MemberProfileRow>();

  if (error || !row) return undefined;
  return toMemberProfile(row);
}
