import { MemberAccountSettingsView } from "@/components/members/member-account-settings-view";
import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { getCurrentMemberAccount } from "@/lib/members/actions";

export default async function MemberAccountSettingsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const account = await getCurrentMemberAccount();

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
