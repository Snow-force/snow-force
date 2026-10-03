import type { MemberProfile } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeMemberProfileRow,
  profileUpdateToRow,
  type StructuredMemberProfileRow,
} from "./profile-fields";

type MemberProfileRow = StructuredMemberProfileRow;

const memberProfileSelect = [
  "id",
  "user_id",
  "display_name",
  "email",
  "phone",
  "rider_level_en",
  "rider_level_zh",
  "emergency_contact",
  "emergency_phone",
  "rider_type",
  "rider_level",
  "home_mountain",
  "bio",
  "carpool_interest",
  "lodging_interest",
  "preferred_language",
  "instagram",
  "discord",
  "avatar_url",
  "passes",
  "equipment",
  "saved_event_slugs",
  "notification_preferences",
  "photo_social_media_consent",
  "marketing_email_opt_in",
  "created_at",
  "updated_at",
].join(",");

function toMemberProfile(row: MemberProfileRow): MemberProfile {
  return normalizeMemberProfileRow(row);
}

export async function getMemberProfile(userId: string): Promise<MemberProfile | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_profiles")
    .select(memberProfileSelect)
    .eq("user_id", userId)
    .maybeSingle<MemberProfileRow>();

  if (error || !data) return undefined;
  return toMemberProfile(data);
}

export async function updateMemberProfile(
  userId: string,
  data: Partial<Omit<MemberProfile, "id" | "userId" | "createdAt">>,
): Promise<MemberProfile | undefined> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("member_profiles")
    .update(profileUpdateToRow(data))
    .eq("user_id", userId)
    .select(memberProfileSelect)
    .maybeSingle<MemberProfileRow>();

  if (error || !row) return undefined;
  return toMemberProfile(row);
}
