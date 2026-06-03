import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { MemberDashboardData, MemberDashboardTrip } from "@/lib/members/dashboard";
import type { Event, MemberProfile, Registration } from "@/lib/types";
import { confirmMemberPendingRegistrationAction, logoutMember } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";

type MemberDashboardProps = {
  dashboard: MemberDashboardData;
  profile: MemberProfile;
  searchParams: Record<string, string | undefined>;
  user: User;
};

type IconName =
  | "home"
  | "trips"
  | "profile"
  | "gear"
  | "recaps"
  | "settings"
  | "events"
  | "calendar"
  | "location"
  | "group"
  | "arrow"
  | "bookmark";

const fallbackMountainImage =
  "https://images.unsplash.com/photo-1483664852095-d6cc6870702d?auto=format&fit=crop&w=1400&q=80";

const navItems: Array<{ href: string; label: string; icon: IconName; active?: boolean; mobile?: boolean }> = [
  { href: "/member", label: "Home", icon: "home", active: true, mobile: true },
  { href: "/member/trips", label: "My Trips", icon: "trips", mobile: true },
  { href: "/events", label: "Events", icon: "events", mobile: true },
  { href: "/member/settings", label: "Profile", icon: "profile", mobile: true },
  { href: "/member/settings#passes", label: "Gear & Passes", icon: "gear" },
  { href: "/recaps", label: "Recaps", icon: "recaps", mobile: true },
  { href: "/member/account-settings", label: "Account Settings", icon: "settings" },
];

const quickActions: Array<{ href: string; title: string; body: string; icon: IconName; tone: string }> = [
  { href: "/events", title: "Browse Events", body: "Find upcoming snow trips and sessions", icon: "calendar", tone: "bg-[#d8e8ff] text-[#0066ff]" },
  { href: "/member/trips", title: "My Trips", body: "View your bookings and registrations", icon: "bookmark", tone: "bg-[#d8f6e5] text-[#19a865]" },
  { href: "/member/settings", title: "Profile", body: "Manage your info and preferences", icon: "profile", tone: "bg-[#e7d7ff] text-[#7c3aed]" },
  { href: "/recaps", title: "Recaps", body: "Photos, stories, and trip highlights", icon: "recaps", tone: "bg-[#ffe7bd] text-[#f28c18]" },
];

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

function statusLabel(status: Registration["status"]) {
  if (status === "confirmed") return "Confirmed";
  if (status === "waitlist") return "Waitlist";
  return "Cancelled";
}

function statusClassName(status: Registration["status"]) {
  if (status === "confirmed") return "bg-[#dcf8e8] text-[#159255]";
  if (status === "waitlist") return "bg-[#fff0d8] text-[#f28c18]";
  return "bg-[#eef1f6] text-[#667085]";
}

function tripImage(event: Event | undefined) {
  return event?.coverImage || fallbackMountainImage;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SF";
}

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "home") return <svg {...common}><path d="m3.5 11 8.5-7 8.5 7" /><path d="M5.5 10.5V20h5v-5h3v5h5v-9.5" /></svg>;
  if (name === "trips") return <svg {...common}><path d="M5 5.5h14v14H5z" /><path d="m8 10 2.5 2.5L16 7" /></svg>;
  if (name === "profile") return <svg {...common}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>;
  if (name === "gear") return <svg {...common}><path d="M7 7h10v13H7z" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M9.5 11h5" /></svg>;
  if (name === "recaps") return <svg {...common}><path d="M5 4.5h14v15H5z" /><path d="m8 15 2.5-3 2 2 3.5-4.5" /><path d="M8 8h.01" /></svg>;
  if (name === "settings") return <svg {...common}><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19 12a7 7 0 0 0-.1-1.1l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-1.9-1.1L14.3 3h-4.6l-.3 2.9A7.5 7.5 0 0 0 7.5 7l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.1l-2 1.5 2 3.4 2.4-1c.6.5 1.2.8 1.9 1.1l.3 2.9h4.6l.3-2.9c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1.1Z" /></svg>;
  if (name === "events") return <svg {...common}><path d="M7 3.5v3" /><path d="M17 3.5v3" /><path d="M4.5 8h15" /><path d="M5 5.5h14v14H5z" /></svg>;
  if (name === "calendar") return <svg {...common}><path d="M7 3.5v3" /><path d="M17 3.5v3" /><path d="M4.5 8h15" /><path d="M5 5.5h14v14H5z" /></svg>;
  if (name === "location") return <svg {...common}><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" /><path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /></svg>;
  if (name === "group") return <svg {...common}><path d="M16 11a3 3 0 1 0 0-6" /><path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" /><path d="M2.5 19a5.5 5.5 0 0 1 11 0" /><path d="M14.5 14a5.5 5.5 0 0 1 7 5" /></svg>;
  if (name === "bookmark") return <svg {...common}><path d="M7 4.5h10v15l-5-3-5 3z" /></svg>;
  return <svg {...common}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 font-semibold text-[#111827]">
      <span className="relative block h-8 w-10 text-[#183a5a]">
        <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden="true">
          <path d="M3 30 17 7l8 13 6-10 14 20H3Z" fill="currentColor" />
          <path d="m17 7 4 13 4-1L17 7Z" fill="#eef6ff" opacity=".9" />
        </svg>
      </span>
      {!compact && <span className="text-[22px] tracking-[-0.3px]">SnowForce</span>}
    </Link>
  );
}

function MobileBrand() {
  return (
    <Link href="/" className="flex items-center gap-3 font-semibold text-white">
      <span className="block h-8 w-10">
        <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden="true">
          <path d="M3 30 17 7l8 13 6-10 14 20H3Z" fill="currentColor" />
          <path d="m17 7 4 13 4-1L17 7Z" fill="#ffffff" opacity=".75" />
        </svg>
      </span>
      <span className="text-[25px] tracking-[-0.3px]">SnowForce</span>
    </Link>
  );
}

function UserAvatar({ profile, user }: { profile: MemberProfile; user: User }) {
  const label = profile.displayName || user.email || "SnowForce";
  if (profile.avatarUrl) {
    return <img src={profile.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white" />;
  }
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#183a5a] text-[13px] font-semibold text-white ring-2 ring-white">
      {initials(label)}
    </span>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[288px] border-r border-[#edf1f6] bg-white px-7 py-9 xl:block">
      <Brand />
      <nav className="mt-14 space-y-3">
        {navItems.filter((item) => !item.mobile || item.href !== "/events").map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            className={`flex min-h-12 items-center gap-4 rounded-[14px] px-4 text-[16px] font-semibold transition ${
              item.active ? "bg-[#eef5ff] text-[#0066ff]" : "text-[#536079] hover:bg-[#f6f8fb] hover:text-[#111827]"
            }`}
          >
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
      <Link href="/events" className="absolute bottom-9 left-7 right-7 overflow-hidden rounded-[20px] border border-[#e0e7f0] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[#111827]">Explore events</p>
              <p className="mt-2 text-[14px] leading-6 text-[#6b7488]">Find your next snow adventure.</p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dce3ed] text-[#536079]">
              <Icon name="arrow" className="h-5 w-5" />
            </span>
          </div>
        </div>
        <div className="h-28 bg-cover bg-center" style={{ backgroundImage: `url("${fallbackMountainImage}")` }} />
      </Link>
    </aside>
  );
}

function TopBar({ profile, user }: { profile: MemberProfile; user: User }) {
  return (
    <header className="hidden items-center justify-between md:flex">
      <div className="xl:hidden">
        <Brand />
      </div>
      <div className="hidden xl:block" />
      <div className="flex items-center gap-5">
        <Link href="/member/settings" className="flex items-center gap-3">
          <UserAvatar profile={profile} user={user} />
          <span className="hidden text-[15px] font-semibold text-[#111827] lg:inline">{profile.displayName || user.email}</span>
          <Icon name="arrow" className="hidden h-4 w-4 rotate-90 text-[#536079] lg:block" />
        </Link>
      </div>
    </header>
  );
}

function MobileHero({ firstName, profile, user, nextEvent }: { firstName: string; profile: MemberProfile; user: User; nextEvent?: Event }) {
  return (
    <section
      className="relative -mx-4 -mt-6 min-h-[400px] overflow-hidden bg-cover bg-center px-8 pb-24 pt-10 text-white md:hidden"
      style={{ backgroundImage: `linear-gradient(180deg, rgba(28,47,76,0.32), rgba(246,248,252,0.18) 68%, #f6f8fc 100%), url("${tripImage(nextEvent)}")` }}
    >
      <div className="relative z-10 flex items-center justify-between">
        <MobileBrand />
        <div className="flex items-center gap-3">
          <UserAvatar profile={profile} user={user} />
        </div>
      </div>
      <div className="relative z-10 mt-28">
        <h1 className="text-[42px] font-semibold leading-[1.05] tracking-[-0.4px] text-[#111827]">
          Hi, {firstName}<span aria-hidden="true">{" \uD83D\uDC4B"}</span>
        </h1>
        <p className="mt-3 text-[20px] font-semibold text-[#4f5f78]">Your next ride starts here.</p>
      </div>
    </section>
  );
}

function NextTripCard({ trip }: { trip?: MemberDashboardTrip }) {
  const event = trip?.event;
  const status = trip?.registration.status || "confirmed";

  return (
    <section className="rounded-[24px] border border-[#e6ebf2] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:rounded-[22px] md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[22px] font-semibold tracking-[-0.2px] md:text-[19px]">Next Trip</h2>
        <Link href="/member/trips" className="text-[17px] font-semibold text-[#0066ff] md:hidden">View all</Link>
        <div className="hidden gap-3 md:flex">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#e4e9f1] text-[#667085]"><Icon name="arrow" className="h-4 w-4 rotate-180" /></span>
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#e4e9f1] text-[#667085]"><Icon name="arrow" className="h-4 w-4" /></span>
        </div>
      </div>

      {event ? (
        <div className="grid gap-5 md:grid-cols-[minmax(260px,0.84fr)_1fr] md:items-center">
          <div className="aspect-[1.35] overflow-hidden rounded-[12px] md:aspect-[2.55]">
            <img src={tripImage(event)} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <span className={`inline-flex rounded-full px-3 py-1 text-[13px] font-semibold ${statusClassName(status)}`}>{statusLabel(status)}</span>
              <h3 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.2px] md:text-[22px]">{display(event.title)}</h3>
              <div className="mt-4 space-y-3 text-[16px] font-medium text-[#667085] md:text-[14px]">
                <p className="flex items-center gap-3"><Icon name="calendar" className="h-5 w-5" />{formatDate(event.eventDate)}</p>
                <p className="flex items-center gap-3"><Icon name="location" className="h-5 w-5" />{display(event.activityLocation)}</p>
                <p className="flex items-center gap-3"><Icon name="group" className="h-5 w-5" />Group{" \u00b7 "}{Math.max(event.registrationCount, 1)} going</p>
              </div>
            </div>
            <Link href={`/events/${event.slug}`} className="grid h-14 w-14 place-items-center rounded-full border border-[#e4e9f1] text-[#536079] md:h-auto md:w-auto md:min-w-[122px] md:bg-[#0066ff] md:px-6 md:py-3 md:text-[15px] md:font-semibold md:text-white">
              <span className="hidden md:inline">View Details</span>
              <Icon name="arrow" className="h-6 w-6 md:hidden" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(260px,0.84fr)_1fr] md:items-center">
          <div className="aspect-[1.35] overflow-hidden rounded-[12px] md:aspect-[2.55]">
            <img src={fallbackMountainImage} alt="" className="h-full w-full object-cover" />
          </div>
          <div>
            <span className="inline-flex rounded-full bg-[#eef5ff] px-3 py-1 text-[13px] font-semibold text-[#0066ff]">Open</span>
            <h3 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.2px] md:text-[22px]">Choose your next SnowForce ride.</h3>
            <p className="mt-3 max-w-md text-[16px] leading-7 text-[#667085] md:text-[15px]">Browse upcoming events and save the ones that match your mountain, level, and weekend.</p>
            <Link href="/events" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#0066ff] px-6 text-[15px] font-semibold text-white transition active:scale-95">Browse Events</Link>
          </div>
        </div>
      )}
    </section>
  );
}

function RecentRegistrations({ trips }: { trips: MemberDashboardTrip[] }) {
  const preview = trips.slice(0, 3);

  return (
    <section className="rounded-[24px] border border-[#e6ebf2] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[22px] font-semibold tracking-[-0.2px] md:text-[19px]">Recent Registrations</h2>
        <Link href="/member/trips" className="text-[15px] font-semibold text-[#0066ff]">View all</Link>
      </div>
      {preview.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[#dce3ed] bg-[#f6f8fc] p-5 text-[15px] leading-6 text-[#667085]">
          Your SnowForce registrations will appear here after you join a trip.
        </p>
      ) : (
        <div className="space-y-4">
          {preview.map((trip) => (
            <Link key={trip.registration.id} href={`/events/${trip.event.slug}`} className="grid grid-cols-[76px_1fr_auto] items-center gap-4 rounded-[16px] transition hover:bg-[#f8fafc] md:grid-cols-[72px_1fr_auto_auto]">
              <img src={tripImage(trip.event)} alt="" className="h-[72px] w-[72px] rounded-[12px] object-cover" />
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold tracking-[-0.1px] md:text-[16px]">{display(trip.event.title)}</p>
                <p className="mt-1 text-[15px] font-medium text-[#667085] md:text-[14px]">{formatDate(trip.event.eventDate)}</p>
              </div>
              <span className={`hidden rounded-full px-3 py-1 text-[13px] font-semibold sm:inline-flex ${statusClassName(trip.registration.status)}`}>{statusLabel(trip.registration.status)}</span>
              <Icon name="arrow" className="h-5 w-5 text-[#536079]" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function PendingConfirmations({ dashboard }: { dashboard: MemberDashboardData }) {
  if (dashboard.pendingConfirmations.length === 0) return null;

  return (
    <section className="rounded-[24px] border border-[#b9d7ff] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.2px] md:text-[19px]">Pending Confirmation</h2>
          <p className="mt-1 text-[14px] leading-6 text-[#667085]">Confirm logged-in registrations here. No second email check is needed.</p>
        </div>
      </div>
      <div className="space-y-4">
        {dashboard.pendingConfirmations.map(({ event, pending }) => (
          <div key={pending.id} className="grid gap-4 rounded-[16px] border border-[#e2e8f0] p-4 md:grid-cols-[72px_1fr_auto] md:items-center">
            <img src={tripImage(event)} alt="" className="h-[72px] w-[72px] rounded-[12px] object-cover" />
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold tracking-[-0.1px] md:text-[16px]">{display(event.title)}</p>
              <p className="mt-1 text-[14px] font-medium text-[#667085]">{pending.contactName || pending.contactEmail}</p>
              <p className="mt-1 text-[13px] text-[#8a94a6]">{pending.contactEmail}</p>
            </div>
            <form action={confirmMemberPendingRegistrationAction}>
              <input type="hidden" name="pendingId" value={pending.id} />
              <button className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0066ff] px-6 text-[15px] font-semibold text-white transition active:scale-95">
                Confirm
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActions() {
  return (
    <section className="rounded-[24px] border border-[#e6ebf2] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <h2 className="mb-5 text-[22px] font-semibold tracking-[-0.2px] md:text-[19px]">Quick Actions</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href} className="grid min-h-[106px] grid-cols-[52px_1fr_auto] items-center gap-4 rounded-[16px] border border-[#e2e8f0] bg-white p-4 transition hover:border-[#0066ff]/35">
            <span className={`grid h-11 w-11 place-items-center rounded-full ${action.tone}`}>
              <Icon name={action.icon} className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-[16px] font-semibold">{action.title}</span>
              <span className="mt-1 block text-[14px] leading-6 text-[#667085]">{action.body}</span>
            </span>
            <Icon name="arrow" className="h-5 w-5 text-[#536079]" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecapStrip({ dashboard }: { dashboard: MemberDashboardData }) {
  const recaps = dashboard.recentRecaps.slice(0, 3);
  const images = recaps.length > 0
    ? recaps.map((recap) => ({ href: `/recaps/${recap.slug}`, title: display(recap.title), image: recap.coverImage || fallbackMountainImage }))
    : [];

  return (
    <section className="rounded-[24px] border border-[#e6ebf2] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[22px] font-semibold tracking-[-0.2px] md:text-[19px]">Latest Community Recaps</h2>
        <Link href="/recaps" className="text-[15px] font-semibold text-[#0066ff]">View all</Link>
      </div>
      {images.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[#dce3ed] bg-[#f6f8fc] p-5 text-[15px] leading-6 text-[#667085]">
          Photos, stories, and trip highlights will appear here after community recaps are published.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(3,minmax(220px,1fr))] gap-5 overflow-x-auto pb-1">
          {images.map((item) => (
            <Link key={item.href} href={item.href} className="group min-w-[220px] overflow-hidden rounded-[14px]">
              <img src={item.image} alt="" className="aspect-[1.7] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              <p className="mt-3 truncate text-[15px] font-semibold">{item.title}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function BottomNav() {
  const mobileItems = [
    "Home",
    "My Trips",
    "Events",
    "Recaps",
    "Profile",
  ].map((label) => navItems.find((item) => item.label === label)).filter((item): item is (typeof navItems)[number] => Boolean(item));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#e5ebf3] bg-white/95 px-2 pb-5 pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      {mobileItems.map((item) => (
        <Link key={`${item.href}-${item.label}-mobile`} href={item.href} className={`flex flex-col items-center gap-1 text-[12px] font-semibold ${item.active ? "text-[#0066ff]" : "text-[#667085]"}`}>
          <Icon name={item.icon} className="h-7 w-7" />
          {item.label === "Events" ? "Events" : item.label.replace("My ", "")}
        </Link>
      ))}
    </nav>
  );
}

export function MemberDashboard({
  dashboard,
  profile,
  searchParams,
  user,
}: MemberDashboardProps) {
  const firstName = profile.displayName || user.email?.split("@")[0] || "Rider";
  const trips = [...dashboard.upcomingTrips, ...dashboard.registrationHistory];
  const nextTrip = dashboard.upcomingTrips[0];

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#101828]">
      <Sidebar />
      <main className="px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8 xl:ml-[288px] xl:px-20">
        <TopBar profile={profile} user={user} />
        <MobileHero firstName={firstName} profile={profile} user={user} nextEvent={nextTrip?.event} />

        <div className="relative z-10 mx-auto max-w-[1120px] md:mt-12 xl:max-w-[1240px]">
          <div className="hidden md:block">
            <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.3px]">
              Hi, {firstName}<span aria-hidden="true">{" \uD83D\uDC4B"}</span>
            </h1>
            <p className="mt-2 text-[19px] font-medium text-[#667085]">Your next ride starts here.</p>
          </div>

          <div className="-mt-16 md:mt-6">
            <MemberStatusMessage searchParams={searchParams} />
          </div>

          <div className="mt-5 md:mt-6">
            <NextTripCard trip={nextTrip} />
          </div>

          <div className="mt-6">
            <PendingConfirmations dashboard={dashboard} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.98fr)_minmax(440px,1fr)]">
            <RecentRegistrations trips={trips} />
            <QuickActions />
          </div>

          <div className="mt-6">
            <RecapStrip dashboard={dashboard} />
          </div>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-[22px] border border-[#e6ebf2] bg-white p-5">
              <p className="text-[13px] font-semibold text-[#667085]">Rider readiness</p>
              <p className="mt-2 text-[30px] font-semibold">{dashboard.profileCompletion}%</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef2f7]">
                <div className="h-full rounded-full bg-[#0066ff]" style={{ width: `${dashboard.profileCompletion}%` }} />
              </div>
            </div>
            <form action={logoutMember} className="rounded-[22px] border border-[#e6ebf2] bg-white p-5">
              <p className="text-[13px] font-semibold text-[#667085]">Account</p>
              <p className="mt-2 truncate text-[20px] font-semibold">{profile.email}</p>
              <button className="mt-4 inline-flex text-[14px] font-semibold text-[#0066ff]">Sign out</button>
            </form>
          </section>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
