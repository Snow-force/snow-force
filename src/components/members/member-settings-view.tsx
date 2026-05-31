import type { User } from "@supabase/supabase-js";
import type { MemberProfile } from "@/lib/types";
import { MemberStatusMessage } from "./member-status-message";
import { ProfileForm } from "./profile-form";
import { MemberSecondaryShell } from "./member-secondary-shell";

type MemberSettingsViewProps = {
  emailConfirmed: boolean;
  profile: MemberProfile;
  profileCompletion: number;
  searchParams: Record<string, string | undefined>;
  user: User;
};

export function MemberSettingsView({
  emailConfirmed,
  profile,
  profileCompletion,
  searchParams,
  user,
}: MemberSettingsViewProps) {
  const aside = (
    <>
      <section className="rounded-[24px] border border-[#e0e7f0] bg-white p-5 shadow-[0_14px_42px_rgba(15,23,42,0.04)]">
        <p className="text-[13px] font-semibold text-[#667085]">Signed in as</p>
        <p className="mt-2 break-words text-[18px] font-semibold">{profile.displayName || user.email}</p>
        <p className="mt-1 text-[14px] text-[#667085]">{profile.email}</p>
      </section>
      <section className="rounded-[24px] border border-[#e0e7f0] bg-white p-5 shadow-[0_14px_42px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[15px] font-semibold">Rider readiness</p>
          <span className="text-[22px] font-semibold">{profileCompletion}%</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef2f7]">
          <div className="h-full rounded-full bg-[#0066ff]" style={{ width: `${profileCompletion}%` }} />
        </div>
        <p className="mt-4 text-[14px] leading-6 text-[#667085]">
          {emailConfirmed ? "Email verified." : "Email verification is still needed for member-linked registration."}
        </p>
      </section>
      <nav className="rounded-[24px] border border-[#e0e7f0] bg-white p-3 shadow-[0_14px_42px_rgba(15,23,42,0.04)]">
        <a href="#profile" className="block rounded-[16px] px-4 py-3 text-[14px] font-semibold hover:bg-[#f6f8fc]">Profile</a>
        <a href="#passes" className="block rounded-[16px] px-4 py-3 text-[14px] font-semibold hover:bg-[#f6f8fc]">Gear & passes</a>
        <a href="#equipment" className="block rounded-[16px] px-4 py-3 text-[14px] font-semibold hover:bg-[#f6f8fc]">Equipment</a>
      </nav>
    </>
  );

  return (
    <MemberSecondaryShell
      active="settings"
      aside={aside}
      profile={profile}
      subtitle="Keep the details that speed up SnowForce registration in one dedicated place."
      title="Profile"
      user={user}
    >
      <MemberStatusMessage searchParams={searchParams} />
      <ProfileForm profile={profile} />
    </MemberSecondaryShell>
  );
}
