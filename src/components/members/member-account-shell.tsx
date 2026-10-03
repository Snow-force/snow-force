"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarDays, Home, MapPin, Package, Settings, ShoppingBag, UserRound } from "lucide-react";
import { useLanguage } from "@/lib/language";
import type { MemberProfile } from "@/lib/types";

export type MemberSection = "home" | "orders" | "addresses" | "trips" | "settings" | "account";
const navigation = [
  { key: "home", href: "/member", label: { en: "Overview", zh: "我的概览" }, icon: Home },
  { key: "orders", href: "/member/orders", label: { en: "My orders", zh: "我的订单" }, icon: Package },
  { key: "trips", href: "/member/trips", label: { en: "My trips", zh: "我的活动" }, icon: CalendarDays },
  { key: "addresses", href: "/member/addresses", label: { en: "Shipping addresses", zh: "收货地址" }, icon: MapPin },
  { key: "settings", href: "/member/settings", label: { en: "Rider profile", zh: "滑手资料" }, icon: UserRound },
  { key: "account", href: "/member/account-settings", label: { en: "Account & security", zh: "账号与安全" }, icon: Settings },
] as const;

export function previewMemberHref(href: string, preview = false): string {
  if (!preview) return href;
  if (href === "/member") return "/design-preview/member";
  if (href.startsWith("/member/orders/")) return `/design-preview/member?view=detail&id=${encodeURIComponent(href.split("/").pop() || "")}`;
  if (href.startsWith("/member/orders")) return `/design-preview/member?view=orders${href.includes("?") ? `&${href.split("?")[1]}` : ""}`;
  if (href === "/member/addresses") return "/design-preview/member?view=addresses";
  return href;
}

export function MemberAccountShell({ active, profile, title, subtitle, children, preview = false }: {
  active: MemberSection;
  profile: Pick<MemberProfile, "displayName" | "email" | "avatarUrl">;
  title: string;
  subtitle: string;
  children: ReactNode;
  preview?: boolean;
}) {
  const { t } = useLanguage();
  const initials = profile.displayName.slice(0, 2).toUpperCase() || "SF";
  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#f5f5f2] px-4 pb-16 pt-7 text-[#17191b] sm:px-8 lg:pt-11">
      <div className="mx-auto max-w-[1320px]">
        {preview && <p role="note" className="mb-5 border border-[#c9d9e8] bg-white px-4 py-3 text-sm text-[#33485e]">{t({ en: "Design preview · Sample orders and addresses. Nothing is written to a real account.", zh: "设计预览 · 订单与地址均为示例，不会写入真实账户。" })}</p>}
        <header className="mb-7 flex items-start justify-between gap-4 border-b border-[#d9dcd9] pb-7 sm:mb-9">
          <div className="min-w-0">
            <p className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-[#0066cc]">MY SNOWFORCE</p>
            <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.8px] sm:text-[38px]">{title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#62696c] sm:text-[15px]">{subtitle}</p>
          </div>
          <Link href="/shop" className="hidden min-h-11 shrink-0 items-center gap-2 rounded-full border border-[#cfd4d2] bg-white px-5 text-sm font-semibold transition hover:border-[#0066cc] hover:text-[#0066cc] sm:inline-flex">
            <ShoppingBag size={16} />{t({ en: "Gear shop", zh: "逛逛装备商城" })}<ArrowUpRight size={15} />
          </Link>
        </header>
        <div className="grid gap-7 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10">
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="mb-6 hidden items-center gap-3 lg:flex">
              {profile.avatarUrl ? <Image src={profile.avatarUrl} alt="" width={44} height={44} unoptimized className="h-11 w-11 rounded-full object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#1d3430] text-sm font-semibold text-white">{initials}</span>}
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{profile.displayName}</p><p className="mt-1 truncate text-xs text-[#6c7372]">{profile.email}</p></div>
            </div>
            <nav aria-label={t({ en: "Member navigation", zh: "会员中心导航" })} className="flex gap-1 overflow-x-auto border-b border-[#d9dcd9] pb-3 lg:block lg:space-y-1 lg:border-b-0 lg:pb-0">
              {navigation.map(({ key, href, label, icon: Icon }) => <Link key={key} href={previewMemberHref(href, preview)} aria-current={active === key ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3.5 text-sm font-medium transition lg:flex ${active === key ? "bg-[#171b1d] text-white" : "text-[#626a6b] hover:bg-white hover:text-[#0066cc]"}`}><Icon size={17} aria-hidden="true" />{t(label)}</Link>)}
            </nav>
            <div className="mt-7 hidden border-t border-[#d9dcd9] pt-5 lg:block"><p className="text-xs font-semibold text-[#50585a]">{t({ en: "Need a hand?", zh: "需要帮忙？" })}</p><a href="mailto:snowforceclub@gmail.com" className="mt-2 inline-flex min-h-9 items-center gap-2 text-sm text-[#0066cc]">{t({ en: "Contact SnowForce", zh: "联系 SnowForce" })}<ArrowUpRight size={14} /></a></div>
          </aside>
          <div className="min-w-0 space-y-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
