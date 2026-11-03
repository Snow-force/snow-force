import "server-only";

import type { User } from "@supabase/supabase-js";
import type { MemberProfile } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/server";

/** Recover pre-member registrations using only the verified Auth session identity. */
export async function recoverLegacyMemberRegistrations(
  user: Pick<User, "id" | "email" | "email_confirmed_at">,
  profile: Pick<MemberProfile, "id" | "userId" | "email">,
) {
  const email = user.email?.trim().toLowerCase();
  if (!user.email_confirmed_at || !email || profile.userId !== user.id ||
      profile.email.trim().toLowerCase() !== email) return;

  // Escape LIKE metacharacters: email addresses may contain underscores or %.
  // Never broaden the match by removing dots, plus tags, or changing domains.
  const emailPattern = email.replace(/[\\%_]/g, "\\$&");
  const { error } = await createAdminClient()
    .from("registrations")
    .update({ member_id: profile.id, booker_member_id: profile.id })
    .is("member_id", null)
    .is("booker_member_id", null)
    .eq("creation_source", "legacy")
    .eq("registration_kind", "self")
    .ilike("contact_email", emailPattern);

  if (error) throw new Error("Unable to recover legacy registration history.");
}
