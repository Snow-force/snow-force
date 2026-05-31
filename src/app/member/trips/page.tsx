import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { MemberTripsView } from "@/components/members/member-trips-view";
import { getEvents } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { buildMemberDashboard } from "@/lib/members/dashboard";
import { getRecaps } from "@/lib/recaps/repository";
import { getRegistrationsByMember } from "@/lib/registrations/repository";

export default async function MemberTripsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const account = await getCurrentMemberAccount();

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

  return <MemberTripsView dashboard={dashboard} profile={account.profile} registrations={registrations} user={account.user} />;
}
