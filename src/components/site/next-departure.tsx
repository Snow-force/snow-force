"use client";

import { useState } from "react";
import { PublicImage as Image } from "@/components/media/public-image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Mountain } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { getEventAvailabilitySnapshot } from "@/lib/events/availability";
import { selectPublicDisplayEvents } from "@/lib/events/public-display";
import type { Bilingual, Event } from "@/lib/types";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0071e3]";

/** An early, actionable way into the real schedule, before the brand story. */
export function NextDeparture({ events, loadError = false }: { events: Event[]; loadError?: boolean }) {
  const { lang, t } = useLanguage();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const departures = selectPublicDisplayEvents(events).slice(0, 3);
  const selected = departures.find((event) => event.slug === selectedSlug) ?? departures[0];
  const text = (value: Bilingual) => value[lang] || value[lang === "en" ? "zh" : "en"];
  const date = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? t({ en: "Date to be announced", zh: "日期待公布" })
      : parsed.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", weekday: "short", year: "numeric" });
  };
  const status = (event: Event) => {
    const availability = getEventAvailabilitySnapshot(event);
    if (!availability.open) {
      return event.registrationState === "full" || availability.remaining === 0
        ? t({ en: "Full", zh: "已满" })
        : t({ en: "Registration closed", zh: "报名已关闭" });
    }
    return availability.remaining === undefined
      ? t({ en: "Registration open", zh: "报名开放中" })
      : t({ en: `${availability.remaining} spots left`, zh: `剩余 ${availability.remaining} 个名额` });
  };

  return (
    <section id="next-departures" aria-labelledby="next-departure-title" className="scroll-mt-24 bg-[#f0f7ff] px-4 py-14 text-[#1d1d1f] sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#555555]">SnowForce / {t({ en: "Departure board", zh: "出发看板" })}</p>
            <h2 id="next-departure-title" className="mt-3 text-[38px] font-semibold leading-[1.08] sm:text-[56px]">{t({ en: "Make the next one yours.", zh: "下一程，就和我们一起。" })}</h2>
          </div>
          <Link href="/events" className={`inline-flex min-h-11 items-center gap-2 text-[17px] text-[#0066cc] ${focus}`}>
            {t({ en: "Full ride board", zh: "全部出发计划" })}<ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>

        {loadError || !selected ? (
          <div className="rounded-[18px] border border-[#d2d2d7] bg-white p-6 sm:p-10">
            <Mountain size={28} aria-hidden="true" className="mb-5 text-[#555555]" />
            <p className="text-[24px] font-semibold">{loadError ? t({ en: "The schedule is taking a moment.", zh: "出发计划暂时未能加载。" }) : t({ en: "The next ride is in the making.", zh: "下一程，正在筹备。" })}</p>
            <p className="mt-3 max-w-xl text-[17px] text-[#555555]">{loadError ? t({ en: "Check the event board for the latest details. Registration availability has not been confirmed.", zh: "请前往活动列表重试，报名状态暂未确认。" }) : t({ en: "Get to know the crew through past mountain days while we prepare the next gathering.", zh: "等待下一次相聚的同时，先通过往期雪山日常认识雪友。" })}</p>
            <Link href={loadError ? "/events" : "/recaps"} className={`mt-5 inline-flex min-h-11 items-center gap-2 text-[#0066cc] ${focus}`}>
              {loadError ? t({ en: "Try the event board", zh: "重试活动列表" }) : t({ en: "Meet the crew", zh: "认识雪友" })}<ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="grid overflow-hidden rounded-[18px] border border-[#d2d2d7] bg-white lg:grid-cols-[0.85fr_1.15fr]">
            <div className="p-6 sm:p-8">
              <p className="mb-5 text-[17px] text-[#555555]">{t({ en: "Pick a date. Preview the plan.", zh: "选一程，先看看怎么出发。" })}</p>
              <div role="group" aria-label={t({ en: "Choose a departure", zh: "选择出发活动" })} className="divide-y divide-[#e0e0e0]">
                {departures.map((event, index) => (
                  <button key={event.slug} type="button" aria-pressed={selected.slug === event.slug} aria-controls="departure-preview" onClick={() => setSelectedSlug(event.slug)}
                    className={`flex min-h-24 w-full items-start gap-4 rounded-[8px] p-4 text-left ${focus} ${selected.slug === event.slug ? "bg-[#e0effe]" : "hover:bg-[#f5f5f7]"}`}>
                    <span className="pt-1 text-[12px] font-semibold text-[#555555]">0{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[14px] text-[#555555]">{date(event.eventDate)}</span><span className="mt-2 block text-[21px] font-semibold leading-tight">{text(event.title)}</span><span className="mt-2 block text-[14px] text-[#555555]">{status(event)}</span></span>
                    {selected.slug === event.slug && <ArrowRight size={20} aria-hidden="true" className="mt-1 shrink-0 text-[#0066cc]" />}
                  </button>
                ))}
              </div>
            </div>

            <div id="departure-preview" role="region" aria-label={t({ en: "Departure preview", zh: "出发预览" })} aria-live="polite" aria-atomic="true" className="min-w-0 bg-[#252527] text-white">
              {selected.coverImage ? <DepartureCover key={selected.coverImage} src={selected.coverImage} title={text(selected.title)} /> : null}
              <div className="p-6 sm:p-8">
                <p className="text-[14px] text-[#cccccc]">{date(selected.eventDate)} · {status(selected)}</p>
                <h3 className="mt-3 text-[28px] font-semibold leading-tight">{text(selected.title)}</h3>
                <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div><dt className="flex items-center gap-2 text-[12px] text-[#cccccc]"><MapPin size={14} aria-hidden="true" />{t({ en: "Mountain / venue", zh: "雪场 / 场地" })}</dt><dd className="mt-2 text-[17px]">{text(selected.activityLocation) || t({ en: "To be announced", zh: "待公布" })}</dd></div>
                  <div><dt className="flex items-center gap-2 text-[12px] text-[#cccccc]"><Clock size={14} aria-hidden="true" />{t({ en: "Meet-up", zh: "集合安排" })}</dt><dd className="mt-2 text-[17px]">{[selected.meetTime, text(selected.meetLocation)].filter(Boolean).join(" · ") || t({ en: "To be announced", zh: "待公布" })}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-[12px] text-[#cccccc]">{t({ en: "Listed fee", zh: "活动标价" })}</dt><dd className="mt-2 text-[21px] font-semibold">{selected.feeAmount || t({ en: "See event details", zh: "查看活动详情" })}</dd>{text(selected.paymentInstructions) && <dd className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[#cccccc]">{text(selected.paymentInstructions)}</dd>}</div>
                </dl>
                <Link href={`/events/${selected.slug}`} className={`mt-7 inline-flex min-h-11 items-center gap-3 rounded-full bg-[#0066cc] px-6 py-3 text-[17px] text-white hover:bg-[#0071e3] ${focus}`}>
                  {getEventAvailabilitySnapshot(selected).open ? t({ en: "See the plan & join", zh: "查看安排并报名" }) : t({ en: "View event details", zh: "查看活动详情" })}<ArrowRight size={18} aria-hidden="true" />
                </Link>
                <p className="mt-3 text-[12px] text-[#cccccc]">{t({ en: "Review the full requirements before registering.", zh: "报名前，请先查看完整活动要求。" })}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DepartureCover({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <div className="relative h-48 sm:h-56"><Image src={src} alt={title} fill sizes="(max-width: 1023px) 100vw, 600px" className="object-cover" onError={() => setFailed(true)} /></div>;
}
