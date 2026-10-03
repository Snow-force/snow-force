"use client";

import { useFormStatus } from "react-dom";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, CalendarDays, CreditCard, LogOut, MapPin, Package, ShoppingBag, Truck } from "lucide-react";
import type { MemberDashboardData } from "@/lib/members/dashboard";
import type { MemberProfile } from "@/lib/types";
import { confirmMemberPendingRegistrationAction, logoutMember } from "@/lib/members/actions";
import { useLanguage } from "@/lib/language";
import type { MemberOrderList } from "@/lib/shop/member-order-repository";
import { formatOrderDate } from "@/lib/shop/member-orders";
import type { VerifiedPaymentStatus } from "@/lib/payments/checkout-attempt";
import { MemberStatusMessage } from "./member-status-message";
import { PendingPaymentButton } from "./pending-payment-button";
import { MemberAccountShell, previewMemberHref } from "./member-account-shell";
import { OrderCard, OrderReadNotice, OrdersEmptyState } from "./member-orders-view";

type MemberDashboardProps = {
  dashboard: MemberDashboardData;
  orders: MemberOrderList;
  profile: MemberProfile;
  searchParams: Record<string, string | undefined>;
  verifiedPaymentStatus?: VerifiedPaymentStatus;
  user: User;
  preview?: boolean;
};

function PendingConfirmations({ dashboard, preview }: { dashboard: MemberDashboardData; preview: boolean }) {
  const { t } = useLanguage();
  if (!dashboard.pendingConfirmations.length) return null;

  return (
    <section className="rounded-[18px] border border-[#bdcfe0] bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{t({ en: "Finish your event registration", zh: "完成活动报名" })}</h2>
      <p className="mt-2 text-sm leading-6 text-[#687267]">{t({ en: "Your saved registration needs confirmation or payment.", zh: "你已提交的活动报名还需要确认或付款。" })}</p>
      <div className="mt-4 divide-y divide-[#edf0e9]">
        {dashboard.pendingConfirmations.map(({ event, pending }) => (
          <div key={pending.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0"><Link href={`/events/${event.slug}`} className="font-semibold hover:text-[#0066cc]">{t(event.title)}</Link><p className="mt-1 text-xs text-[#6d756a]">{pending.contactName || pending.contactEmail}</p></div>
            {preview ? <button disabled className="min-h-11 rounded-full border border-[#d3ddce] px-5 text-sm">{t({ en: "Preview", zh: "预览示例" })}</button> : event.paymentModel === "free" && !pending.checkoutAttempt ? (
              <form action={confirmMemberPendingRegistrationAction}><input type="hidden" name="pendingId" value={pending.id} /><FreeConfirmationButton /></form>
            ) : <PendingPaymentButton label={pending.checkoutAttempt ? t({ en: "Check / continue payment", zh: "查看 / 继续付款" }) : t({ en: "Continue payment", zh: "继续付款" })} pendingRegistrationId={pending.id} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function FreeConfirmationButton() {
  const { pending } = useFormStatus();
  const { t } = useLanguage();
  return <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white disabled:opacity-50">{t(pending ? { en: "Confirming…", zh: "确认中…" } : { en: "Confirm registration", zh: "确认报名" })}</button>;
}

export function MemberDashboard({ dashboard, orders, profile, searchParams, verifiedPaymentStatus, user, preview = false }: MemberDashboardProps) {
  const { t, lang } = useLanguage();
  const firstName = profile.displayName || user.email?.split("@")[0] || t({ en: "rider", zh: "滑手" });
  const nextTrip = dashboard.upcomingTrips[0];
  const orderActions = [
    { filter: "pending", label: { en: "Awaiting payment", zh: "待付款" }, icon: CreditCard },
    { filter: "processing", label: { en: "To be shipped", zh: "待发货" }, icon: Package },
    { filter: "shipped", label: { en: "In transit", zh: "运输中" }, icon: Truck },
    { filter: "after-sales", label: { en: "Cancelled & refunded", zh: "取消 / 退款" }, icon: ShoppingBag },
  ];

  return <MemberAccountShell active="home" profile={profile} preview={preview}
    title={t({ en: `Welcome back, ${firstName}.`, zh: `欢迎回来，${firstName}。` })}
    subtitle={t({ en: "Your gear orders, mountain plans and rider details. All in one place.", zh: "装备订单、雪山行程和滑手资料，都在这里。" })}>
    <MemberStatusMessage searchParams={searchParams} verifiedPaymentStatus={verifiedPaymentStatus} />
    {dashboard.notifications.some((item) => item.type === "email_verification") && <p role="status" className="rounded-lg border border-[#bdcfe0] bg-white px-5 py-4 text-sm leading-6">{t({ en: "Verify your email to complete registrations and save shipping addresses.", zh: "请验证邮箱，以完成活动报名和保存收货地址。" })} <Link href="/member/account-settings" className="font-semibold text-[#0066cc]">{t({ en: "Account settings", zh: "查看账号设置" })}</Link></p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.85fr)]">
      <section className="relative flex min-h-[230px] items-center overflow-hidden rounded-[18px] bg-[#162723] p-6 text-white sm:p-8">
        <div className="relative z-10 max-w-[68%]"><p className="text-[10px] font-semibold tracking-[0.2em] text-[#b3ccbf]">SNOWFORCE / GEAR</p><h2 className="mt-4 text-[26px] font-semibold leading-[1.25] tracking-[-0.5px]">{t({ en: "Gear up for the next mountain day.", zh: "下一趟滑行，装备就位。" })}</h2><p className="mt-3 text-xs leading-6 text-[#b5c2b9]">{t({ en: "Find your next layer, lens or little rider’s essential.", zh: "从雪服、雪镜到儿童装备，找到下一套心仪装备。" })}</p><Link href="/shop" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-[#1b2c21]">{t({ en: "Explore gear", zh: "逛逛商城" })}<ArrowUpRight size={14} /></Link></div>
        <Image src="/shop/isee-magnetic-goggles.webp" alt="" priority width={190} height={235} className="absolute -right-3 bottom-0 h-[230px] w-[37%] object-contain opacity-90 sm:right-1" />
      </section>
      <section className="rounded-[18px] border border-[#dbe1d7] bg-white p-6">
        <div className="flex items-center justify-between"><p className="text-[11px] font-semibold tracking-[0.12em] text-[#6d7765]">{t({ en: "RIDER PROFILE", zh: "滑手资料" })}</p><span className="text-lg font-semibold">{dashboard.profileCompletion}%</span></div>
        <h2 className="mt-5 text-lg font-semibold">{t({ en: "Ready for your next ride?", zh: "为下一次出发做好准备。" })}</h2>
        <p className="mt-2 text-xs leading-6 text-[#737c6a]">{t({ en: "Keep your riding level and emergency contact up to date for easier event registration.", zh: "更新滑行水平与紧急联系人，让活动报名更方便。" })}</p>
        <div role="progressbar" aria-label={t({ en: "Profile completion", zh: "资料完成度" })} aria-valuenow={dashboard.profileCompletion} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#edf0e8]"><div className="h-full bg-[#0066cc]" style={{ width: `${dashboard.profileCompletion}%` }} /></div>
        <Link href="/member/settings" className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#0066cc]">{t({ en: "Edit rider profile", zh: "编辑滑手资料" })}<ArrowUpRight size={14} /></Link>
      </section>
    </div>
    <section aria-labelledby="member-order-heading">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id="member-order-heading" className="text-xl font-semibold">{t({ en: "My orders", zh: "我的订单" })}</h2><Link href={previewMemberHref("/member/orders", preview)} className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#0066cc]">{t({ en: "View all", zh: "查看全部" })}<ArrowRight size={14} /></Link></div>
      <div className="mb-5 grid grid-cols-4 divide-x divide-[#e3e8dd] rounded-[18px] border border-[#dce2d6] bg-white">
        {orderActions.map(({ filter, label, icon: Icon }) => <Link key={filter} href={previewMemberHref(`/member/orders?status=${filter}`, preview)} className="flex min-h-[94px] flex-col items-center justify-center gap-3 px-1 py-4 text-center text-[11px] font-medium text-[#526148] transition hover:text-[#0066cc] sm:text-xs"><Icon size={21} strokeWidth={1.5} />{t(label)}</Link>)}
      </div>
      {orders.state === "unavailable" ? <OrderReadNotice /> : orders.orders.length ? <div className="space-y-5">{orders.orders.slice(0, 2).map((order) => <OrderCard key={order.id} order={order} preview={preview} />)}</div> : <OrdersEmptyState />}
    </section>
    <PendingConfirmations dashboard={dashboard} preview={preview} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(250px,0.8fr)]">
      <section className="rounded-[18px] border border-[#dce2d7] bg-white p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={18} />{t({ en: "Next mountain day", zh: "下一趟雪山行程" })}</h2><Link href="/member/trips" className="min-h-10 content-center text-xs font-semibold text-[#0066cc]">{t({ en: "My trips", zh: "我的活动" })}</Link></div>
        {nextTrip ? <div className="mt-5 flex items-center gap-4">{nextTrip.event.coverImage && <Image src={nextTrip.event.coverImage} alt="" width={100} height={85} unoptimized className="hidden h-[85px] w-[100px] rounded-lg object-cover sm:block" />}<div className="min-w-0"><span className="text-[11px] font-semibold text-[#0066cc]">{t(nextTrip.registration.status === "waitlist" ? { en: "Waitlisted", zh: "候补中" } : { en: "Confirmed", zh: "已确认" })}</span><h3 className="mt-2 text-base font-semibold leading-6">{t(nextTrip.event.title)}</h3><p className="mt-2 text-xs text-[#748068]">{formatOrderDate(nextTrip.event.eventDate, lang)} · {t(nextTrip.event.activityLocation)}</p><Link href={`/events/${nextTrip.event.slug}`} className="mt-2 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#0066cc]">{t({ en: "Trip details", zh: "查看行程" })}<ArrowUpRight size={13} /></Link></div></div> : <div className="mt-5 border-t border-[#edf0e6] pt-5"><h3 className="text-base font-semibold">{t({ en: "Your next ride is still open.", zh: "下一趟出发，还等着你。" })}</h3><p className="mt-2 text-sm leading-6 text-[#738066]">{t({ en: "Explore upcoming sessions and find a trip that fits your level.", zh: "探索即将开放的活动，找到适合自己水平的行程。" })}</p><Link href="/events" className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#0066cc]">{t({ en: "Find an event", zh: "看看当前活动" })}<ArrowUpRight size={14} /></Link></div>}
      </section>
      <section className="rounded-[18px] border border-[#dce2d7] bg-white p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin size={18} />{t({ en: "Delivery details", zh: "收货信息" })}</h2><p className="mt-4 text-sm leading-6 text-[#738066]">{t({ en: "Manage your US addresses and choose where your next order goes.", zh: "管理美国收货地址，为下一笔订单选择送达地点。" })}</p><Link href={previewMemberHref("/member/addresses", preview)} className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#0066cc]">{t({ en: "Manage addresses", zh: "管理收货地址" })}<ArrowUpRight size={14} /></Link></section>
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d9dfd4] pt-5">
      <p className="min-w-0 break-all text-xs text-[#78816d]">{profile.email}</p>
      <button disabled={preview} onClick={() => logoutMember()} className="inline-flex min-h-11 items-center gap-2 text-xs text-[#627054] disabled:opacity-40"><LogOut size={14} />{t({ en: "Sign out", zh: "退出登录" })}</button>
    </footer>
  </MemberAccountShell>;
}
