import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { MemberDashboardData } from "@/lib/members/dashboard";
import type { MemberProfile, Registration } from "@/lib/types";
import { logoutMember } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";
import { ProfileForm } from "./profile-form";
import { RegistrationHistory } from "./registration-history";
import { SecurityForm } from "./security-form";

type MemberDashboardProps = {
  dashboard: MemberDashboardData;
  emailConfirmed: boolean;
  profile: MemberProfile;
  registrations: Registration[];
  searchParams: Record<string, string | undefined>;
  user: User;
};

export function MemberDashboard({
  dashboard,
  emailConfirmed,
  profile,
  registrations,
  searchParams,
  user,
}: MemberDashboardProps) {
  const nextTrip = dashboard.upcomingTrips[0];

  return (
    <div className="bg-[#f6f7fb] py-8 text-[#15171b] sm:py-12 lg:py-14">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] bg-[#071018] text-white shadow-[0_24px_80px_rgba(20,32,55,0.18)]">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#7dd3fc]">Member command center</p>
              <h1 className="mt-4 text-[42px] font-semibold leading-[0.98] tracking-[-1px] sm:text-[58px]">
                {profile.displayName || user.email}, your next ride starts here.
              </h1>
              <div className="mt-6 flex flex-wrap gap-2 text-[13px] font-semibold">
                <span className="rounded-full bg-white px-4 py-2 text-[#071018]">{emailConfirmed ? "Email verified" : "Verify email"}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white/82">{dashboard.profileCompletion}% profile ready</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white/82">{registrations.length} registrations</span>
              </div>
            </div>
            <div className="bg-[radial-gradient(circle_at_30%_10%,rgba(0,91,234,0.44),transparent_38%),linear-gradient(145deg,#10233a,#071018)] p-6 sm:p-8 lg:p-10">
              <div className="rounded-[28px] border border-white/12 bg-white/10 p-5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/58">Next trip</p>
                {nextTrip ? (
                  <>
                    <h2 className="mt-3 text-[28px] font-semibold leading-[1.08]">{nextTrip.event.title.en || nextTrip.event.title.zh}</h2>
                    <p className="mt-2 text-white/64">{nextTrip.event.activityLocation.en || nextTrip.event.activityLocation.zh} · {nextTrip.event.eventDate}</p>
                    <Link href={`/events/${nextTrip.event.slug}`} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-[#071018] transition active:scale-95">
                      View trip
                    </Link>
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 text-[28px] font-semibold leading-[1.08]">No trip booked yet</h2>
                    <p className="mt-2 text-white/64">Find a snow day that fits your crew and level.</p>
                    <Link href="/events" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-[#071018] transition active:scale-95">
                      Browse events
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6">
          <MemberStatusMessage searchParams={searchParams} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              {dashboard.quickActions.map((action) => (
                <Link key={action.href} href={action.href} className="rounded-[24px] border border-[#dce3ed] bg-white p-5 text-[17px] font-semibold text-[#15171b] transition hover:-translate-y-0.5 hover:border-[#005bea]/40">
                  {action.label}
                  <span className="mt-3 block text-[13px] font-normal text-[#667085]">Open</span>
                </Link>
              ))}
            </section>

            <RegistrationHistory registrations={registrations} />

            <section className="rounded-[28px] border border-[#dce3ed] bg-white p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Saved events</p>
                  <h2 className="mt-2 text-[24px] font-semibold">Interested rides</h2>
                </div>
                <Link href="/events" className="text-[14px] font-semibold text-[#005bea]">Explore</Link>
              </div>
              {dashboard.savedEvents.length === 0 ? (
                <p className="mt-5 rounded-[20px] border border-dashed border-[#dce3ed] bg-[#f6f7fb] p-5 text-[15px] text-[#667085]">Save events you are considering. They will appear here.</p>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {dashboard.savedEvents.map((event) => (
                    <Link key={event.slug} href={`/events/${event.slug}`} className="rounded-[20px] border border-[#edf1f6] bg-[#f9fbfd] p-4 transition hover:border-[#005bea]/40">
                      <p className="font-semibold">{event.title.en || event.title.zh}</p>
                      <p className="mt-1 text-[13px] text-[#667085]">{event.eventDate} · {event.activityLocation.en || event.activityLocation.zh}</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section id="profile">
              <ProfileForm profile={profile} />
            </section>
            <section id="security">
              <SecurityForm />
            </section>
          </main>

          <aside className="space-y-6">
            <section className="rounded-[28px] border border-[#dce3ed] bg-white p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Notifications</p>
              <div className="mt-4 space-y-3">
                {dashboard.notifications.length === 0 ? (
                  <p className="text-[15px] text-[#667085]">You are all caught up.</p>
                ) : dashboard.notifications.map((notification) => (
                  <Link key={notification.id} href={notification.href} className="block rounded-[20px] bg-[#f6f7fb] p-4 transition hover:bg-[#eef3f8]">
                    <p className="font-semibold">{notification.title}</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#667085]">{notification.body}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-[#dce3ed] bg-white p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Recent recaps</p>
              <div className="mt-4 space-y-3">
                {dashboard.recentRecaps.length === 0 ? (
                  <p className="text-[15px] text-[#667085]">Trip photos and stories will appear after recaps are published.</p>
                ) : dashboard.recentRecaps.map((recap) => (
                  <Link key={recap.slug} href={`/recaps/${recap.slug}`} className="block rounded-[20px] bg-[#f6f7fb] p-4 transition hover:bg-[#eef3f8]">
                    <p className="font-semibold">{recap.title.en || recap.title.zh}</p>
                    <p className="mt-1 text-[13px] text-[#667085]">{recap.location.en || recap.location.zh}</p>
                  </Link>
                ))}
              </div>
            </section>

            <form action={logoutMember}>
              <button className="btn-secondary w-full border-[#dce3ed] text-[#15171b]">Sign out</button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
