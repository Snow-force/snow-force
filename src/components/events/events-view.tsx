"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Mountain,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useLanguage } from "@/lib/language";
import { getEventAvailabilitySnapshot } from "@/lib/events/availability";
import { EventCard } from "@/components/events/event-card";
import type { Bilingual, Event } from "@/lib/types";

const control =
  "min-h-11 rounded-full border border-[#d2d2d7] bg-white px-4 text-[14px] text-[#1d1d1f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]";

export function EventsView({
  events,
  loadError = false,
}: {
  events: Event[];
  loadError?: boolean;
}) {
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const comparisonTitle = useRef<HTMLHeadingElement>(null);
  const selected = events.filter((event) => selectedSlugs.includes(event.slug));
  const months = [
    ...new Set(
      events
        .map((event) => event.eventDate.slice(0, 7))
        .filter((value) => /^\d{4}-\d{2}$/.test(value)),
    ),
  ].sort();
  const text = (value: Bilingual) =>
    value[lang] || value[lang === "en" ? "zh" : "en"];
  const visible = events.filter((event) => {
    const searchable = [
      event.title.en,
      event.title.zh,
      event.activityLocation.en,
      event.activityLocation.zh,
      event.meetLocation.en,
      event.meetLocation.zh,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      searchable.includes(query.trim().toLocaleLowerCase()) &&
      (!month || event.eventDate.startsWith(month)) &&
      (!openOnly || getEventAvailabilitySnapshot(event).open)
    );
  });
  const date = (value: string, monthOnly = false) => {
    const parsed = new Date(`${value}${monthOnly ? "-01" : ""}T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? t({ en: "To be announced", zh: "待公布" })
      : parsed.toLocaleDateString(
          lang === "zh" ? "zh-CN" : "en-US",
          monthOnly
            ? { month: "long", year: "numeric" }
            : {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              },
        );
  };
  const toggle = (slug: string) => {
    setSelectedSlugs((current) =>
      current.includes(slug)
        ? current.filter((value) => value !== slug)
        : current.length < 3
          ? [...current, slug]
          : current,
    );
  };
  const reset = () => {
    setQuery("");
    setMonth("");
    setOpenOnly(false);
  };

  return (
    <div className="bg-[#f5f5f7] text-[#1d1d1f]">
      <header className="bg-[#252527] px-4 py-12 text-white sm:px-6 sm:py-16">
        <div className="mx-auto grid max-w-[1100px] gap-10 md:grid-cols-[1.5fr_1fr] md:items-end">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#cccccc]">
              <Mountain size={18} aria-hidden="true" /> SnowForce /{" "}
              {t({ en: "Ride together", zh: "一起上雪" })}
            </p>
            <h1 className="mt-5 max-w-xl text-[40px] font-semibold leading-[1.07] tracking-tight sm:text-[56px]">
              {t({
                en: "Less planning.\nMore mountain.",
                zh: "少些纠结，\n多些雪山。",
              })
                .split("\n")
                .map((line: string, index: number) => (
                  <span key={line} className="block">
                    {index > 0 && <span className="sr-only"> </span>}
                    {line}
                  </span>
                ))}
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-[#cccccc]">
              {t({
                en: "Find your next crew. Shortlist up to three events and compare the details before you commit.",
                zh: "找到下一程的雪友。选出最多三个活动，对比安排，再决定出发。",
              })}
            </p>
          </div>
          <div className="border-t border-white/20 pt-6">
            <p className="text-[24px] font-semibold">
              {t({
                en: "Your next ride starts here.",
                zh: "下一次滑行，从这里开始。",
              })}
            </p>
            <ol className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-[14px] text-[#cccccc]">
              {[
                { en: "Explore", zh: "发现" },
                { en: "Compare", zh: "对比" },
                { en: "Join the crew", zh: "加入雪友" },
              ].map((step, index) => (
                <li key={step.en}>
                  <span className="mr-2 text-white">0{index + 1}</span>
                  {t(step)}
                </li>
              ))}
            </ol>
            <a
              href="#ride-board"
              className="mt-6 inline-flex min-h-11 items-center gap-2 text-[14px] text-[#2997ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {t({ en: "Explore current events", zh: "探索当前活动" })}
              <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <div
        id="ride-board"
        className="mx-auto max-w-[1148px] scroll-mt-28 px-4 py-10 sm:px-6 sm:py-14"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">
            {t({ en: "The ride board", zh: "出发清单" })}
          </h2>
          {!loadError && (
            <p role="status" className="text-[14px] text-[#555555]">
              {t({
                en: `${visible.length} of ${events.length} events`,
                zh: `${visible.length} / ${events.length} 个活动`,
              })}
            </p>
          )}
        </div>

        {!loadError && events.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-end gap-3 rounded-[18px] border border-[#e0e0e0] bg-white p-4 sm:p-5">
              <div className="min-w-0 flex-[2_1_240px]">
                <label
                  htmlFor="ride-search"
                  className="mb-2 block text-[12px] font-semibold"
                >
                  {t({
                    en: "Where do you want to ride?",
                    zh: "想去哪里滑雪？",
                  })}
                </label>
                <div className="relative">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-3 text-[#555555]"
                    aria-hidden="true"
                  />
                  <input
                    id="ride-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t({
                      en: "Search events or mountains",
                      zh: "搜索活动或雪场",
                    })}
                    className={`${control} w-full pl-11`}
                  />
                </div>
              </div>
              <div className="flex-[1_1_180px]">
                <label
                  htmlFor="ride-month"
                  className="mb-2 block text-[12px] font-semibold"
                >
                  {t({ en: "When", zh: "出发月份" })}
                </label>
                <select
                  id="ride-month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className={`${control} w-full`}
                >
                  <option value="">
                    {t({ en: "Any month", zh: "所有月份" })}
                  </option>
                  {months.map((value) => (
                    <option key={value} value={value}>
                      {date(value, true)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                aria-pressed={openOnly}
                onClick={() => setOpenOnly(!openOnly)}
                className={`${control} inline-flex items-center gap-2 ${openOnly ? "border-[#0066cc] bg-[#f0f7ff] text-[#0555a1]" : ""}`}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                {t({ en: "Open for registration", zh: "仅看可报名" })}
                {openOnly && <Check size={16} aria-hidden="true" />}
              </button>
              {(query || month || openOnly) && (
                <button
                  type="button"
                  onClick={reset}
                  className={`${control} text-[#0066cc]`}
                >
                  {t({ en: "Reset", zh: "重置" })}
                </button>
              )}
            </div>
            <p className="mt-4 text-[14px] text-[#555555]">
              {t({
                en: "Different mountain? Different plan? Add your favorites to compare them side by side.",
                zh: "不同雪场，不同安排？将心仪活动加入清单，一眼对比。",
              })}
            </p>
          </>
        )}

        {loadError ? (
          <EmptyPanel>
            <p>
              {t({
                en: "We couldn’t load the events. Please try again in a moment.",
                zh: "暂时无法加载活动，请稍后重试。",
              })}
            </p>
            <Link href="/events" className="mt-4 inline-block text-[#0066cc]">
              {t({ en: "Try again", zh: "重试" })}
            </Link>
          </EmptyPanel>
        ) : events.length === 0 ? (
          <EmptyPanel>
            <p>
              {t({
                en: "The next adventure is still taking shape. Check back soon.",
                zh: "下一场活动正在筹备中，敬请期待。",
              })}
            </p>
            <Link href="/recaps" className="mt-4 inline-block text-[#0066cc]">
              {t({
                en: "Meet the crew through past recaps",
                zh: "通过往期回顾认识雪友",
              })}{" "}
              →
            </Link>
          </EmptyPanel>
        ) : visible.length === 0 ? (
          <EmptyPanel>
            <h3 className="text-[24px] font-semibold">
              {t({
                en: "No rides match just yet.",
                zh: "暂时没有符合条件的活动。",
              })}
            </h3>
            <p className="mt-2">
              {t({
                en: "Try another mountain or month, or include events with closed registration.",
                zh: "试试其他雪场或月份，或查看全部报名状态。",
              })}
            </p>
            <button
              type="button"
              onClick={reset}
              className={`${control} mt-5 text-[#0066cc]`}
            >
              {t({ en: "Show all events", zh: "查看所有活动" })}
            </button>
          </EmptyPanel>
        ) : (
          <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((event) => {
              const added = selectedSlugs.includes(event.slug);
              return (
                <div key={event.slug} className="min-w-0">
                  <EventCard event={event} lang={lang} t={t} />
                  <button
                    type="button"
                    aria-pressed={added}
                    aria-label={`${t({ en: added ? "Remove from comparison" : "Add to comparison", zh: added ? "从对比中移除" : "加入对比" })}: ${text(event.title)}`}
                    disabled={!added && selected.length >= 3}
                    onClick={() => toggle(event.slug)}
                    className={`${control} mt-3 flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${added ? "border-[#0066cc] bg-[#e0effe] text-[#0555a1]" : ""}`}
                  >
                    {added ? (
                      <Check size={16} aria-hidden="true" />
                    ) : (
                      <Plus size={16} aria-hidden="true" />
                    )}
                    {t({
                      en: added ? "On your shortlist" : "Add to compare",
                      zh: added ? "已加入清单" : "加入对比",
                    })}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {comparing && selected.length >= 2 && (
          <section
            className="mt-14 scroll-mt-28"
            aria-labelledby="ride-comparison-title"
          >
            <h2
              ref={comparisonTitle}
              id="ride-comparison-title"
              tabIndex={-1}
              className="text-[28px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0071e3]"
            >
              {t({ en: "Which ride is yours?", zh: "哪一程，更适合你？" })}
            </h2>
            <p className="mt-2 text-[14px] text-[#555555]">
              {t({
                en: "Compare the essentials. Open an event for the full plan and registration requirements.",
                zh: "先对比关键信息，再进入活动查看完整安排与报名要求。",
              })}
            </p>
            <p className="mt-3 text-[12px] text-[#555555] sm:hidden">
              {t({
                en: "Swipe the table to compare every ride →",
                zh: "左右滑动表格，对比每个活动 →",
              })}
            </p>
            <div
              role="region"
              aria-label={t({
                en: "Event comparison; scroll horizontally on smaller screens",
                zh: "活动对比；小屏幕可横向滚动",
              })}
              tabIndex={0}
              className="mt-6 overflow-x-auto rounded-[18px] border border-[#e0e0e0] bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0071e3]"
            >
              <table className="w-full border-collapse text-left text-[14px]">
                <caption className="sr-only">
                  {t({ en: "Your shortlisted events", zh: "心仪活动对比" })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="min-w-28 p-5 text-[#555555]">
                      {t({ en: "The essentials", zh: "关键信息" })}
                    </th>
                    {selected.map((event) => (
                      <th
                        scope="col"
                        key={event.slug}
                        className="min-w-[220px] p-5 align-top text-[21px] font-semibold"
                      >
                        {text(event.title)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: { en: "Date", zh: "日期" },
                      value: (event: Event) => date(event.eventDate),
                    },
                    {
                      label: { en: "Mountain / venue", zh: "雪场 / 场地" },
                      value: (event: Event) =>
                        text(event.activityLocation) ||
                        t({ en: "To be announced", zh: "待公布" }),
                    },
                    {
                      label: { en: "Meet-up", zh: "集合安排" },
                      value: (event: Event) =>
                        [event.meetTime, text(event.meetLocation)]
                          .filter(Boolean)
                          .join(" · ") ||
                        t({ en: "To be announced", zh: "待公布" }),
                    },
                    {
                      label: { en: "Listed fee", zh: "活动标价" },
                      value: (event: Event) =>
                        event.feeAmount ||
                        t({ en: "See event details", zh: "查看活动详情" }),
                    },
                    {
                      label: { en: "Registration", zh: "报名状态" },
                      value: (event: Event) => {
                        const availability =
                          getEventAvailabilitySnapshot(event);
                        return availability.open
                          ? availability.remaining === undefined
                            ? t({
                                en: "Open · No capacity limit",
                                zh: "报名中 · 不限名额",
                              })
                            : t({
                                en: `Open · ${availability.remaining} spots left`,
                                zh: `报名中 · 剩余 ${availability.remaining} 个名额`,
                              })
                          : event.registrationState === "full" ||
                              availability.remaining === 0
                            ? t({ en: "Full", zh: "已满" })
                            : t({ en: "Closed", zh: "已关闭" });
                      },
                    },
                  ].map((row) => (
                    <tr
                      key={row.label.en}
                      className="border-t border-[#e0e0e0] even:bg-[#f5f5f7]"
                    >
                      <th
                        scope="row"
                        className="p-5 align-top font-medium text-[#555555]"
                      >
                        {t(row.label)}
                      </th>
                      {selected.map((event) => (
                        <td key={event.slug} className="p-5 align-top">
                          {row.value(event)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-[#e0e0e0]">
                    <th scope="row" className="p-5 font-medium text-[#555555]">
                      {t({ en: "Next step", zh: "下一步" })}
                    </th>
                    {selected.map((event) => (
                      <td key={event.slug} className="p-5">
                        <Link
                          href={`/events/${event.slug}`}
                          aria-label={`${t({ en: "View event", zh: "查看活动" })}: ${text(event.title)}`}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
                        >
                          {t({ en: "View event", zh: "查看活动" })}
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-[#555555]">
              {t({
                en: "Fees are shown as published by the organizer. Check each event for inclusions, deposits, and final payment terms. Availability is confirmed when you register.",
                zh: "标价以主办方发布为准。费用包含项目、定金及尾款安排请查看各活动详情。名额以报名时确认为准。",
              })}
            </p>
          </section>
        )}
      </div>

      {selected.length > 0 && !loadError && (
        <aside
          aria-label={t({ en: "Your ride shortlist", zh: "心仪活动清单" })}
          className="sticky bottom-0 z-40 border-t border-[#d2d2d7] bg-white px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] sm:px-6"
        >
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3">
            <div className="mr-auto min-w-0 flex-1 sm:flex-none">
              <p role="status" className="text-[14px] font-semibold">
                {t({
                  en: `${selected.length}/3 on your shortlist`,
                  zh: `已选 ${selected.length}/3 个活动`,
                })}
              </p>
              <p className="mt-1 text-[12px] text-[#555555]">
                {t({
                  en:
                    selected.length < 2
                      ? "Add one more event to compare."
                      : selected.length === 3
                        ? "Shortlist full. Remove one to swap in another."
                        : "Ready for a side-by-side look?",
                  zh:
                    selected.length < 2
                      ? "再选一个活动即可对比。"
                      : selected.length === 3
                        ? "清单已满，移除一个即可更换。"
                        : "准备好对比活动了吗？",
                })}
              </p>
            </div>
            <div className="order-3 flex w-full gap-2 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:max-w-[55%]">
              {selected.map((event) => (
                <button
                  key={event.slug}
                  type="button"
                  onClick={() => toggle(event.slug)}
                  aria-label={`${t({ en: "Remove from shortlist", zh: "从清单移除" })}: ${text(event.title)}`}
                  className={`${control} flex max-w-[220px] shrink-0 items-center gap-2`}
                >
                  <span className="truncate">{text(event.title)}</span>
                  <X size={14} className="shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={selected.length < 2}
              onClick={() => {
                setComparing(true);
                requestAnimationFrame(() => {
                  comparisonTitle.current?.scrollIntoView({
                    block: "start",
                    behavior: "instant",
                  });
                  comparisonTitle.current?.focus({ preventScroll: true });
                });
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-5 text-[14px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] disabled:cursor-not-allowed disabled:bg-[#e0e0e0] disabled:text-[#555555]"
            >
              {t({ en: "Compare rides", zh: "对比活动" })}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 rounded-[18px] border border-[#e0e0e0] bg-white px-6 py-12 text-center text-[17px] leading-relaxed text-[#333333]">
      {children}
    </div>
  );
}
