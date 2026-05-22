"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { isEventOpen } from "@/lib/events/availability";
import { RegistrationForm } from "@/components/events/registration-form";
import type { Event } from "@/lib/types";

export function EventDetailView({
  event,
  loadError = false,
}: {
  event: Event | undefined;
  loadError?: boolean;
}) {
  const { lang, t } = useLanguage();

  if (loadError) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          {t({ en: "Event Data Unavailable", zh: "活动数据不可用" })}
        </h1>
        <p className="mt-2 text-amber-700">
          {t({
            en: "Check the Supabase event setup before viewing activity details.",
            zh: "查看活动详情前，请检查 Supabase 活动配置。",
          })}
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          {t({ en: "Event Not Found", zh: "活动未找到" })}
        </h1>
        <p className="mt-2 text-gray-500">
          {t({ en: "The event you're looking for doesn't exist or has been removed.", zh: "你查找的活动不存在或已被移除。" })}
        </p>
        <Link href="/events" className="mt-4 inline-block text-sm font-medium text-snow-600 hover:text-snow-700">
          {t({ en: "← Back to Events", zh: "← 返回活动列表" })}
        </Link>
      </div>
    );
  }

  const open = isEventOpen(event);
  const eventDate = new Date(event.eventStartAt);
  const eventEndDate = new Date(event.eventEndAt);
  const dateFormatter = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 text-sm text-gray-400">
          <Link href="/events" className="hover:text-gray-600">{t({ en: "Events", zh: "活动" })}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-600">{t(event.title)}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  open ? "bg-green-50 text-green-700 ring-1 ring-green-600/20" : "bg-red-50 text-red-700 ring-1 ring-red-600/20"
                }`}>
                  {open ? t({ en: "Registration Open", zh: "报名开放中" }) : t({ en: "Registration Closed", zh: "报名已关闭" })}
                </span>
                {(t(event.tags) as string[]).map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-full bg-snow-50 px-2.5 py-0.5 text-xs font-medium text-snow-700">
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {t(event.title)}
              </h1>
              <p className="mt-3 text-lg text-gray-500">{t(event.subtitle)}</p>
            </div>

            {/* Meta grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card">
                <div className="text-xs font-medium text-gray-400 uppercase">{t({ en: "Date & Time", zh: "时间" })}</div>
                <div className="mt-1 text-sm font-medium text-gray-900">{dateFormatter.format(eventDate)}</div>
                <div className="text-sm text-gray-500">
                  {eventDate.toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })} — {eventEndDate.toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="card">
                <div className="text-xs font-medium text-gray-400 uppercase">{t({ en: "Location", zh: "地点" })}</div>
                <div className="mt-1 text-sm font-medium text-gray-900">{t(event.location)}</div>
                <a href={event.locationUrl} target="_blank" rel="noopener" className="text-sm text-snow-600 hover:text-snow-700">
                  {t({ en: "View on map →", zh: "查看地图 →" })}
                </a>
              </div>
              <div className="card">
                <div className="text-xs font-medium text-gray-400 uppercase">{t({ en: "Audience Level", zh: "适合人群" })}</div>
                <div className="mt-1 text-sm font-medium text-gray-900">{t(event.audienceLevel)}</div>
              </div>
              <div className="card">
                <div className="text-xs font-medium text-gray-400 uppercase">{t({ en: "Capacity", zh: "名额" })}</div>
                <div className="mt-1 text-sm font-medium text-gray-900">
                  {event.registrationCount} / {event.capacity}
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-snow-500 transition"
                    style={{ width: `${Math.min((event.registrationCount / event.capacity) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t({ en: "About This Event", zh: "活动介绍" })}
              </h2>
              <div className="mt-3 whitespace-pre-line text-gray-600">{t(event.description)}</div>
            </div>

            {/* Highlights */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t({ en: "Highlights", zh: "活动亮点" })}
              </h2>
              <ul className="mt-3 space-y-2">
                {(t(event.highlights) as string[]).map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-600">
                    <svg className="mt-1 h-4 w-4 shrink-0 text-snow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* Schedule */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t({ en: "Schedule", zh: "活动流程" })}
              </h2>
              <pre className="mt-3 whitespace-pre-line rounded-lg bg-gray-50 p-4 text-sm text-gray-600 font-sans">
                {t(event.schedule)}
              </pre>
            </div>

            {/* Fee Info */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t({ en: "Fee Information", zh: "费用说明" })}
              </h2>
              <p className="mt-3 text-gray-600">{t(event.feeInfo)}</p>
            </div>

            {/* Notices */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t({ en: "Important Notices", zh: "注意事项" })}
              </h2>
              <ul className="mt-3 space-y-2">
                {(t(event.notices) as string[]).map((n, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-600">
                    <svg className="mt-1 h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {open ? (
                <RegistrationForm event={event} />
              ) : (
                <div className="card border-gray-200 bg-gray-50 text-center">
                  <p className="text-sm font-medium text-gray-500">
                    {t({ en: "Registration is currently closed for this event.", zh: "此活动当前不接受报名。" })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
