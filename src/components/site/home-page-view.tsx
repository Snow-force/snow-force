"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { getRecaps } from "@/lib/recaps/repository";
import { getFAQs } from "@/lib/faqs/repository";
import type { Event } from "@/lib/types";

export function HomePageView({
  events,
  eventLoadError = false,
}: {
  events: Event[];
  eventLoadError?: boolean;
}) {
  const { lang, t } = useLanguage();
  const recaps = getRecaps().slice(0, 2);
  const faqs = getFAQs().slice(0, 3);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-snow-50 to-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            SnowForce
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
            {t({
              en: "Community-driven snow sports in China. Join events, level up your riding, and share the stoke with riders who love the mountain as much as you do.",
              zh: "社群驱动的中国滑雪运动平台。参加活动、提升技术、和与你一样热爱雪山的滑手分享热情。",
            })}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/events" className="btn-primary text-base px-8 py-3">
              {t({ en: "Browse Events", zh: "浏览活动" })}
            </Link>
            <Link href="/recaps" className="btn-secondary text-base px-8 py-3">
              {t({ en: "See Past Recaps", zh: "往期回顾" })}
            </Link>
          </div>
        </div>
      </section>

      {/* Current Events */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="section-title">
                {t({ en: "Current Events", zh: "当前活动" })}
              </h2>
              <p className="mt-2 text-gray-500">
                {t({
                  en: "Upcoming SnowForce events open for registration.",
                  zh: "即将举办的 SnowForce 活动，现已开放报名。",
                })}
              </p>
            </div>
            <Link href="/events" className="hidden text-sm font-medium text-snow-600 hover:text-snow-700 sm:block">
              {t({ en: "View all events →", zh: "查看全部活动 →" })}
            </Link>
          </div>

          {eventLoadError ? (
            <p className="mt-8 text-center text-amber-700">
              {t({
                en: "Event data is not ready yet. Check the Supabase event setup.",
                zh: "活动数据尚未就绪，请检查 Supabase 活动配置。",
              })}
            </p>
          ) : events.length === 0 ? (
            <p className="mt-8 text-center text-gray-400">
              {t({ en: "No upcoming events right now. Check back soon!", zh: "暂无活动，敬请期待！" })}
            </p>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {events.map((event) => (
                <Link
                  key={event.slug}
                  href={`/events/${event.slug}`}
                  className="card group transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {(t(event.tags) as string[]).map((tag) => (
                          <span key={tag} className="inline-block rounded-full bg-snow-50 px-2.5 py-0.5 text-xs font-medium text-snow-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-gray-900 group-hover:text-snow-600">
                        {t(event.title)}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">{t(event.subtitle)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      event.registrationState === "open" ? "bg-green-50 text-green-700 ring-1 ring-green-600/20" : "bg-red-50 text-red-700 ring-1 ring-red-600/20"
                    }`}>
                      {event.registrationState === "open"
                        ? t({ en: "Open", zh: "报名中" })
                        : t({ en: "Closed", zh: "已关闭" })}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>{t(event.location)}</span>
                    <span>·</span>
                    <span>{new Date(event.eventStartAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</span>
                    <span>·</span>
                    <span>{t(event.audienceLevel)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 text-center sm:hidden">
            <Link href="/events" className="text-sm font-medium text-snow-600 hover:text-snow-700">
              {t({ en: "View all events →", zh: "查看全部活动 →" })}
            </Link>
          </div>
        </div>
      </section>

      {/* Recaps */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="section-title">
                {t({ en: "Past Recaps", zh: "往期回顾" })}
              </h2>
              <p className="mt-2 text-gray-500">
                {t({
                  en: "Relive the best moments from past SnowForce events.",
                  zh: "重温 SnowForce 往期活动的精彩瞬间。",
                })}
              </p>
            </div>
            <Link href="/recaps" className="hidden text-sm font-medium text-snow-600 hover:text-snow-700 sm:block">
              {t({ en: "All recaps →", zh: "全部回顾 →" })}
            </Link>
          </div>

          {recaps.length === 0 ? (
            <p className="mt-8 text-center text-gray-400">
              {t({ en: "No recaps yet. Stay tuned!", zh: "暂无回顾，敬请期待！" })}
            </p>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {recaps.map((recap) => (
                <Link
                  key={recap.slug}
                  href={`/recaps/${recap.slug}`}
                  className="card group transition hover:shadow-md"
                >
                  <div className="flex flex-wrap gap-2">
                    {(t(recap.tags) as string[]).map((tag) => (
                      <span key={tag} className="inline-block rounded-full bg-snow-50 px-2.5 py-0.5 text-xs font-medium text-snow-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-gray-900 group-hover:text-snow-600">
                    {t(recap.title)}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{t(recap.summary)}</p>
                  <div className="mt-4 flex gap-4 text-sm text-gray-400">
                    <span>{t(recap.location)}</span>
                    <span>·</span>
                    <span>{new Date(recap.date).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 text-center sm:hidden">
            <Link href="/recaps" className="text-sm font-medium text-snow-600 hover:text-snow-700">
              {t({ en: "All recaps →", zh: "全部回顾 →" })}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Teaser */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="section-title text-center">
            {t({ en: "Frequently Asked Questions", zh: "常见问题" })}
          </h2>
          <div className="mx-auto mt-8 max-w-3xl divide-y divide-gray-200">
            {faqs.map((faq) => (
              <details key={faq.id} className="group py-4">
                <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-gray-900">
                  {t(faq.question)}
                  <span className="ml-2 shrink-0 text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="mt-3 text-sm text-gray-500">{t(faq.answer)}</p>
              </details>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link href="/faq" className="text-sm font-medium text-snow-600 hover:text-snow-700">
              {t({ en: "View all FAQs →", zh: "查看全部 FAQ →" })}
            </Link>
          </div>
        </div>
      </section>

      {/* Partner Teaser */}
      <section className="bg-snow-600 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t({ en: "Want to partner with SnowForce?", zh: "想与 SnowForce 合作？" })}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-snow-100">
            {t({
              en: "We work with brands, resorts, and community organizations to create amazing snow experiences. Let's talk.",
              zh: "我们与品牌、雪场和社群组织合作，共同创造精彩的滑雪体验。来聊聊吧。",
            })}
          </p>
          <Link href="/partner" className="mt-8 inline-block rounded-lg bg-white px-8 py-3 text-sm font-semibold text-snow-700 shadow-sm transition hover:bg-gray-50">
            {t({ en: "Partner Inquiry", zh: "合作咨询" })}
          </Link>
        </div>
      </section>
    </div>
  );
}
