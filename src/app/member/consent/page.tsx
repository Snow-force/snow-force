import { redirect } from "next/navigation";
import { MemberConsentStep } from "@/components/members/member-consent-step";
import {
  ensureMemberProfileAfterConsent,
  hasCurrentPrivacyConsent,
  memberConsentNextPath,
} from "@/lib/members/member-consents";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MemberConsentPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const next = memberConsentNextPath(searchParams.next);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/member?next=${encodeURIComponent(next)}`);
  if (!user.email_confirmed_at) redirect("/member?registered=1");

  if (await hasCurrentPrivacyConsent(user.id, supabase)) {
    if (await ensureMemberProfileAfterConsent(user, supabase)) redirect(next);
    redirect("/member?error=profile");
  }

  return <MemberConsentStep error={searchParams.error} next={next} />;
}
