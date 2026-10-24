import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** Called only after the invitation's email-control proof is checked. Profile emails are hints, never authorization. */
export async function resolveVerifiedAttendeeMember(email: string): Promise<string | null> {
  const client = createAdminClient();
  const { data: candidates, error } = await client.from("member_profiles").select("id,user_id").eq("email", email).limit(5);
  if (error) throw new Error("Verified attendee identity unavailable");
  for (const candidate of candidates ?? []) {
    const { data, error: authError } = await client.auth.admin.getUserById(candidate.user_id);
    if (authError) throw new Error("Verified attendee identity unavailable");
    if (data.user?.email_confirmed_at && data.user.email?.toLowerCase() === email.toLowerCase()) return String(candidate.id);
  }
  return null;
}
