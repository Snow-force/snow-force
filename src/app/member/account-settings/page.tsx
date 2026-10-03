import { MemberAccountSettingsView } from "@/components/members/member-account-settings-view";
import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { redirect } from "next/navigation";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { memberConsentPath } from "@/lib/members/member-consents";

export default async function MemberAccountSettingsPage(
  props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const account = await getCurrentMemberAccount();

  if (account && (!account.privacyAccepted || !account.profile)) redirect(memberConsentPath("/member/account-settings"));

  if (!account?.profile) {
    return <MemberAuthPanel searchParams={searchParams} />;
  }

  return (
    <MemberAccountSettingsView
      emailConfirmed={account.emailConfirmed}
      profile={account.profile}
      searchParams={searchParams}
      user={account.user}
    />
  );
}
