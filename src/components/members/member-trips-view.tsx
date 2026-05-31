import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { MemberDashboardData } from "@/lib/members/dashboard";
import type { MemberProfile, Registration } from "@/lib/types";
import { RegistrationHistory } from "./registration-history";
import { MemberSecondaryShell } from "./member-secondary-shell";

type MemberTripsViewProps = {
  dashboard: MemberDashboardData;
  profile: MemberProfile;
  registrations: Registration[];
  user: User;
};

function display(value: { en: string; zh: string }) {
  return value.en || value.zh;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MemberTripsView({ dashboard, profile, registrations, user }: MemberTripsViewProps) {
  const nextTrip = dashboard.upcomingTrips[0];

  const aside = (
    <>
      <section className="rounded-[24px] border border-[#e0e7f0] bg-white p-5 shadow-[0_14px_42px_rgba(15,23,42,0.04)]">
        <p className="text-[13px] font-semibold text-[#667085]">Trip count</p>
        <p className="mt-2 text-[32px] font-semibold">{dashboard.upcomingTrips.length + dashboard.registrationHistory.length}</p>
        <p className="mt-2 text-[14px] leading-6 text-[#667085]">Linked registrations across upcoming and past SnowForce rides.</p>
      </section>
      <Link href="/events" className="block rounded-[24px] border border-[#e0e7f0] bg-white p-5 shadow-[0_14px_42px_rgba(15,23,42,0.04)] transition hover:border-[#0066ff]/40">
        <p className="font-semibold">Browse Events</p>
        <p className="mt-2 text-[14px] leading-6 text-[#667085]">Find upcoming snow trips and sessions.</p>
      </Link>
    </>
  );

  return (
    <MemberSecondaryShell
      active="trips"
      aside={aside}
      profile={profile}
      subtitle="Upcoming registrations, saved rides, and your SnowForce history live here."
      title="Trips"
      user={user}
    >
      <section className="rounded-[24px] border border-[#e6ebf2] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        {nextTrip ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_180px] lg:items-end">
            <div>
              <p className="text-[13px] font-semibold text-[#667085]">Next trip</p>
              <h2 className="mt-3 text-[30px] font-semibold leading-tight">{display(nextTrip.event.title)}</h2>
              <p className="mt-2 text-[15px] text-[#667085]">
                {formatDate(nextTrip.event.eventDate)}{" \u00b7 "}{display(nextTrip.event.activityLocation)}
              </p>
            </div>
            <Link href={`/events/${nextTrip.event.slug}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0066ff] px-5 text-[15px] font-semibold text-white transition active:scale-95">
              View trip
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_180px] lg:items-end">
            <div>
              <p className="text-[13px] font-semibold text-[#667085]">No upcoming registration</p>
              <h2 className="mt-3 text-[30px] font-semibold leading-tight">Your next ride is still open.</h2>
              <p className="mt-2 text-[15px] text-[#667085]">Explore published events and save the ones you are considering.</p>
            </div>
            <Link href="/events" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0066ff] px-5 text-[15px] font-semibold text-white transition active:scale-95">
              Find events
            </Link>
          </div>
        )}
      </section>

      <RegistrationHistory registrations={registrations} />
    </MemberSecondaryShell>
  );
}
