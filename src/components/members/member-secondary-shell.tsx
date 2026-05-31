import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { MemberProfile } from "@/lib/types";

type IconName = "home" | "trips" | "profile" | "gear" | "recaps" | "settings" | "events" | "arrow";

type MemberSecondaryShellProps = {
  active: "account" | "settings" | "trips";
  aside?: ReactNode;
  children: ReactNode;
  profile: MemberProfile;
  subtitle: string;
  title: string;
  user: User;
};

const navItems: Array<{ href: string; key: string; label: string; icon: IconName; mobile?: boolean }> = [
  { href: "/member", key: "home", label: "Home", icon: "home", mobile: true },
  { href: "/member/trips", key: "trips", label: "My Trips", icon: "trips", mobile: true },
  { href: "/events", key: "events", label: "Events", icon: "events", mobile: true },
  { href: "/member/settings", key: "settings", label: "Profile", icon: "profile", mobile: true },
  { href: "/member/settings#passes", key: "gear", label: "Gear & Passes", icon: "gear" },
  { href: "/recaps", key: "recaps", label: "Recaps", icon: "recaps", mobile: true },
  { href: "/member/account-settings", key: "account", label: "Account Settings", icon: "settings" },
];

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
  return <svg {...common}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 font-semibold text-[#111827]">
      <span className="block h-8 w-10 text-[#183a5a]">
        <svg viewBox="0 0 48 36" className="h-full w-full" aria-hidden="true">
          <path d="M3 30 17 7l8 13 6-10 14 20H3Z" fill="currentColor" />
          <path d="m17 7 4 13 4-1L17 7Z" fill="#eef6ff" opacity=".9" />
        </svg>
      </span>
      <span className="text-[22px] tracking-[-0.3px]">SnowForce</span>
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

export function MemberSecondaryShell({
  active,
  aside,
  children,
  profile,
  subtitle,
  title,
  user,
}: MemberSecondaryShellProps) {
  const mobileItems = ["home", "trips", "events", "recaps", "settings"]
    .map((key) => navItems.find((item) => item.key === key))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#101828]">
      <aside className="fixed inset-y-0 left-0 hidden w-[288px] border-r border-[#edf1f6] bg-white px-7 py-9 xl:block">
        <Brand />
        <nav className="mt-14 space-y-3">
          {navItems.filter((item) => item.key !== "events").map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={`flex min-h-12 items-center gap-4 rounded-[14px] px-4 text-[16px] font-semibold transition ${
                  isActive ? "bg-[#eef5ff] text-[#0066ff]" : "text-[#536079] hover:bg-[#f6f8fb] hover:text-[#111827]"
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8 xl:ml-[288px] xl:px-20">
        <header className="flex items-center justify-between">
          <div className="xl:hidden">
            <Brand />
          </div>
          <div className="hidden xl:block" />
          <div className="flex items-center gap-5">
            <Link href="/member/settings" className="flex items-center gap-3">
              <UserAvatar profile={profile} user={user} />
              <span className="hidden text-[15px] font-semibold text-[#111827] lg:inline">{profile.displayName || user.email}</span>
            </Link>
          </div>
        </header>

        <div className="mx-auto mt-10 max-w-[1120px] xl:max-w-[1240px]">
          <div className="rounded-[30px] border border-[#e6ebf2] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-8">
            <Link href="/member" className="text-[14px] font-semibold text-[#0066ff]">Back to member center</Link>
            <h1 className="mt-5 text-[38px] font-semibold leading-tight tracking-[-0.3px] sm:text-[52px]">{title}</h1>
            <p className="mt-3 max-w-2xl text-[17px] leading-7 text-[#667085]">{subtitle}</p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <main className="min-w-0 space-y-6">{children}</main>
            {aside && <aside className="space-y-4 lg:sticky lg:top-24">{aside}</aside>}
          </div>
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#e5ebf3] bg-white/95 px-2 pb-5 pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        {mobileItems.map((item) => (
          <Link key={`${item.href}-${item.label}-mobile`} href={item.href} className={`flex flex-col items-center gap-1 text-[12px] font-semibold ${item.key === active ? "text-[#0066ff]" : "text-[#667085]"}`}>
            <Icon name={item.icon} className="h-7 w-7" />
            {item.label === "Events" ? "Events" : item.label.replace("My ", "")}
          </Link>
        ))}
      </nav>
    </div>
  );
}
