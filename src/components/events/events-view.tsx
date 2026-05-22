"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import type { Event } from "@/lib/types";

export function EventsView({
  events,
  loadError = false,
}: {
  events: Event[];
  loadError?: boolean;
}) {
  const { lang, t } = useLanguage();

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="section-title">
          {t({ en: "Current Events", zh: "当前活动" })}
        </h1>
        <p className="mt-2 text-gray-500">
          {t({
            en: "Discover and register for upcoming SnowForce events.",
            zh: "发现并报名即将举办的 SnowForce 活动。",
          })}
        </p>

        {loadError ? (
          <div className="mt-16 text-center">
            <p className="text-lg text-amber-700">
              {t({
                en: "Event data is not ready yet. Check the Supabase event setup.",
                zh: "活动数据尚未就绪，请检查 Supabase 活动配置。",
              })}
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-gray-400 text-lg">
              {t({ en: "No upcoming events right now. Check back soon!", zh: "暂无活动，敬请期待！" })}
            </p>
            <Link href="/recaps" className="mt-4 inline-block text-sm font-medium text-snow-600 hover:text-snow-700">
              {t({ en: "Browse past recaps →", zh: "浏览往期回顾 →" })}
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {events.map((event) => (
              <Link
                key={event.slug}
                href={`/events/${event.slug}`}
                className="card group transition hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      {(t(event.tags) as string[]).map((tag) => (
                        <span key={tag} className="inline-block rounded-full bg-snow-50 px-2.5 py-0.5 text-xs font-medium text-snow-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-gray-900 group-hover:text-snow-600">
                      {t(event.title)}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">{t(event.subtitle)}</p>
                  </div>
                  <span className={`ml-3 shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    event.registrationState === "open"
                      ? "bg-green-50 text-green-700 ring-1 ring-green-600/20"
                      : event.registrationState === "full"
                        ? "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20"
                        : "bg-red-50 text-red-700 ring-1 ring-red-600/20"
                  }`}>
                    {event.registrationState === "open"
                      ? t({ en: "Open", zh: "报名中" })
                      : event.registrationState === "full"
                        ? t({ en: "Full", zh: "已满" })
                        : t({ en: "Closed", zh: "已关闭" })}
                  </span>
                </div>

                <p className="mt-3 text-sm text-gray-500 line-clamp-2">{t(event.description)}</p>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                    {t(event.location)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
                    {new Date(event.eventStartAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span>{t(event.audienceLevel)}</span>
                  <span>
                    {event.registrationCount}/{event.capacity} {t({ en: "registered", zh: "已报名" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
