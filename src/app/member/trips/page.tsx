import { getCancellationCases } from "@/lib/registrations/cancellation-repository";
import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { redirect } from "next/navigation";
import { MemberTripsView } from "@/components/members/member-trips-view";
import { getEvents } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { buildMemberDashboard } from "@/lib/members/dashboard";
import { getRecaps } from "@/lib/recaps/repository";
import { getRegistrationsByMember } from "@/lib/registrations/repository";
import { memberConsentPath } from "@/lib/members/member-consents";
import { listEventBookings } from "@/lib/registrations/v2/repository";

export default async function MemberTripsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const account = await getCurrentMemberAccount();

  if (account && (!account.privacyAccepted || !account.profile))
    redirect(memberConsentPath("/member/trips"));

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
    <MemberTripsView
      dashboard={dashboard}
      profile={account.profile}
      registrations={registrations}
      user={account.user}
      cancellationCases={await getCancellationCases(
        registrations,
        account.profile.id,
      )}
      bookings={await listEventBookings(account.profile.id)}
    />
  );
}
