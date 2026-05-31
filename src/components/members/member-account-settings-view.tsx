import type { User } from "@supabase/supabase-js";
import type { MemberProfile } from "@/lib/types";
import { MemberStatusMessage } from "./member-status-message";
import { MemberSecondaryShell } from "./member-secondary-shell";
import { SecurityForm } from "./security-form";

type MemberAccountSettingsViewProps = {
  emailConfirmed: boolean;
  profile: MemberProfile;
  searchParams: Record<string, string | undefined>;
  user: User;
};

export function MemberAccountSettingsView({
  emailConfirmed,
  profile,
  searchParams,
  user,
}: MemberAccountSettingsViewProps) {
  const aside = (
    <>
      <section className="rounded-[24px] border border-[#e0e7f0] bg-white p-5 shadow-[0_14px_42px_rgba(15,23,42,0.04)]">
        <p className="text-[13px] font-semibold text-[#667085]">Signed in as</p>
        <p className="mt-2 break-words text-[18px] font-semibold">{profile.displayName || user.email}</p>
        <p className="mt-1 text-[14px] text-[#667085]">{profile.email}</p>
      </section>
      <section className="rounded-[24px] border border-[#e0e7f0] bg-white p-5 shadow-[0_14px_42px_rgba(15,23,42,0.04)]">
        <p className="text-[13px] font-semibold text-[#667085]">Email status</p>
        <p className="mt-2 text-[20px] font-semibold">{emailConfirmed ? "Verified" : "Needs verification"}</p>
        <p className="mt-2 text-[14px] leading-6 text-[#667085]">
          {emailConfirmed ? "Your account can use member-linked registration." : "Verify your email before using member-linked registration."}
        </p>
      </section>
    </>
  );

  return (
    <MemberSecondaryShell
      active="account"
      aside={aside}
      profile={profile}
      subtitle="Manage account access and password settings separately from your riding profile."
      title="Account settings"
      user={user}
    >
      <MemberStatusMessage searchParams={searchParams} />
      <SecurityForm />
    </MemberSecondaryShell>
  );
}
