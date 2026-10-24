import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { MemberDashboard } from "@/components/members/member-dashboard";
import { redirect } from "next/navigation";
import { getEvents } from "@/lib/events/repository";
import { buildMemberDashboard } from "@/lib/members/dashboard";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { getRecaps } from "@/lib/recaps/repository";
import { getPendingRegistrationsByMember } from "@/lib/registrations/pending-repository";
import { getRegistrationsByMember } from "@/lib/registrations/repository";
import { memberConsentPath } from "@/lib/members/member-consents";
import { resolvePaymentReturnStatus } from "@/lib/payments/return-status";
import { memberOrderRepository } from "@/lib/shop/member-order-repository";
import { listEventBookings } from "@/lib/registrations/v2/repository";

export default async function MemberPage(
  props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const account = await getCurrentMemberAccount();

  if (account && (!account.privacyAccepted || !account.profile)) redirect(memberConsentPath("/member"));

  if (!account?.profile) {
    return <MemberAuthPanel searchParams={searchParams} />;
  }

  const verifiedPaymentStatus = searchParams.payment === "success"
    ? await resolvePaymentReturnStatus(searchParams.session_id, account.profile.id)
    : undefined;
  const [registrations, pendingRegistrations, events, recaps, orders] = await Promise.all([
    getRegistrationsByMember(account.profile.id),
    getPendingRegistrationsByMember(account.profile.id),
    getEvents(),
    getRecaps(),
    memberOrderRepository.list(account.user.id),
  ]);
  const dashboard = buildMemberDashboard({
    profile: account.profile,
    emailConfirmed: account.emailConfirmed,
    registrations,
    pendingRegistrations,
    events,
    recaps,
  });

  return (
    <MemberDashboard
      dashboard={dashboard}
      proxyRegistrations={registrations.filter((row) => row.registrationKind === "proxy")}
      orders={orders}
      profile={account.profile}
      searchParams={searchParams}
      user={account.user}
      verifiedPaymentStatus={verifiedPaymentStatus}
      groupBookings={await listEventBookings(account.profile.id)}
    />
  );
}
