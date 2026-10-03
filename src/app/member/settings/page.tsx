import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { redirect } from "next/navigation";
import { MemberSettingsView } from "@/components/members/member-settings-view";
import { getEvents } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { buildMemberDashboard } from "@/lib/members/dashboard";
import { getRecaps } from "@/lib/recaps/repository";
import { getRegistrationsByMember } from "@/lib/registrations/repository";
import { memberConsentPath } from "@/lib/members/member-consents";

export default async function MemberSettingsPage(
  props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const account = await getCurrentMemberAccount();

  if (account && (!account.privacyAccepted || !account.profile)) redirect(memberConsentPath("/member/settings"));

  if (!account?.profile) {
    return <MemberAuthPanel searchParams={searchParams} />;
  }

  const [registrations, events, recaps] = await Promise.all([
    getRegistrationsByMember(account.profile.id),
    getEvents(),
    getRecaps(),
  ]);
  const dashboard = buildMemberDashboard({
    profile: account.profile,
    emailConfirmed: account.emailConfirmed,
    registrations,
    events,
    recaps,
  });

  return (
    <MemberSettingsView
      emailConfirmed={account.emailConfirmed}
      profile={account.profile}
      profileCompletion={dashboard.profileCompletion}
      searchParams={searchParams}
      user={account.user}
    />
  );
}
