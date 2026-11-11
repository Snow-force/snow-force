"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { localizedText } from "@/lib/i18n/fallback";
import { SafeRecapImage } from "@/components/recaps/safe-recap-image";
import type { HomeEvent } from "@/lib/home/types";

export function HomeDepartures({ events, loadError }: { events: HomeEvent[]; loadError: boolean }) {
  const { lang, t } = useLanguage();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const departures = events.filter(event => event.status === "published" && event.registrationState !== "closed").slice(0, 3);
  const selected = departures.find(event => event.slug === selectedSlug) ?? departures[0];
  const date = (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? t({ en: "Date to be announced", zh: "日期待公布" }) : parsed.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  const imageAlt = selected && !loadError ? localizedText(selected.title, lang) : t({ en: "A skier finding their line on the mountain", zh: "雪山上的滑行瞬间" });

  return <section id="next-departures" aria-label={t({ en: "Next departure", zh: "下一次出发" })} className="sf-departures">
    <div className="sf-home-width">
      <div className="sf-section-heading sf-reveal">
        <div><p className="sf-eyebrow text-white/55">01 / {t({ en: "THE RIDE BOARD", zh: "出发看板" })}</p><h2>{t({ en: "Next departure", zh: "下一次出发" })}{lang === "zh" && <span>NEXT DEPARTURE</span>}</h2></div>
        <Link prefetch={false} href="/events" className="sf-text-link sf-link-on-dark">{t({ en: "All events", zh: "全部活动" })}<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
      {!loadError && departures.length > 1 && <div className="sf-departure-tabs" role="group" aria-label={t({ en: "Choose a departure", zh: "选择出发活动" })}>
        {departures.map((event, index) => <button key={event.slug} aria-pressed={selected?.slug === event.slug} aria-controls="home-departure-preview" onClick={() => setSelectedSlug(event.slug)} className="sf-departure-choice"><span className="text-xs opacity-60">0{index + 1}</span>{localizedText(event.title, lang)}<ArrowUpRight size={16} aria-hidden="true" /></button>)}
      </div>}
      <div className="sf-departure-layout sf-reveal" id="home-departure-preview" role="region" aria-label={t({ en: "Departure preview", zh: "出发预览" })} aria-live="polite" aria-atomic="true">
        <div className="sf-departure-photo" key={selected && !loadError ? selected.slug : "empty"}>
          <SafeRecapImage src={selected && !loadError ? selected.coverImage : "/shop/mountain-editorial.webp"} alt={imageAlt} sizes="(min-width: 1024px) 55vw, 100vw" fallbackSrc="/shop/mountain-editorial.webp" fallbackAlt={t({ en: "Mountain riding", zh: "雪山滑行" })} fallbackLabel={t({ en: "On the mountain", zh: "雪山影像" })} unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂不可用" })} />
          <span className="sf-image-caption">SNOWFORCE / {t({ en: "SEE YOU UP THERE", zh: "山上见" })}</span>
        </div>
        <div className="sf-departure-copy">
          {loadError || !selected ? <>
            <p className="sf-eyebrow text-white/50">{t({ en: "GOOD DAYS ARE WORTH THE WAIT", zh: "下一程，值得期待" })}</p>
            <h3>{loadError ? t({ en: "The schedule is taking a moment.", zh: "出发计划暂时未能加载。" }) : t({ en: "The next ride is in the making.", zh: "新活动正在筹备。" })}</h3>
            <p className="sf-body-muted">{loadError ? t({ en: "Try the event board for the latest details. Availability has not been confirmed.", zh: "请前往活动列表重试，报名状态暂未确认。" }) : t({ en: "Get to know the crew. The next mountain day starts with people like you.", zh: "先看看我们如何一起滑。下一场雪日，期待和你同行。" })}</p>
            <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3"><Link prefetch={false} href={loadError ? "/events" : "/recaps"} className="sf-text-link sf-link-on-dark">{loadError ? t({ en: "Try the event board", zh: "重试活动列表" }) : t({ en: "Meet the crew", zh: "认识雪友" })}<ArrowUpRight size={18} aria-hidden="true" /></Link><Link prefetch={false} href="/faq" className="sf-text-link text-white/80">{t({ en: "First trip? Start here", zh: "第一次来？看看常见问题" })}<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
          </> : <>
            <p className="sf-eyebrow text-white/55">{selected.registrationState === "full" ? t({ en: "LISTED AS FULL", zh: "活动标记为已满" }) : t({ en: "YOUR NEXT MOUNTAIN DAY", zh: "下一程，就和我们一起" })}</p>
            <h3>{localizedText(selected.title, lang)}</h3>
            <dl className="sf-departure-facts"><div><dt><CalendarDays size={15} aria-hidden="true" />{t({ en: "Date", zh: "活动日期" })}</dt><dd>{date(selected.eventDate)}</dd></div><div><dt><MapPin size={15} aria-hidden="true" />{t({ en: "Mountain / venue", zh: "雪场 / 场地" })}</dt><dd>{localizedText(selected.activityLocation, lang) || t({ en: "To be announced", zh: "待公布" })}</dd></div><div><dt>{t({ en: "Listed fee", zh: "活动标价" })}</dt><dd>{selected.feeAmount || t({ en: "See event details", zh: "查看活动详情" })}</dd></div></dl>
            <Link prefetch={false} href={`/events/${selected.slug}`} className="sf-action mt-7">{t({ en: "View event details", zh: "查看活动详情" })}<ArrowUpRight size={18} aria-hidden="true" /></Link>
            <p className="mt-4 text-xs leading-5 text-white/60">{t({ en: "Availability and final pricing are confirmed on the event page.", zh: "当前名额与最终价格，请以活动详情页为准。" })}</p>
          </>}
        </div>
      </div>
    </div>
  </section>;
}
