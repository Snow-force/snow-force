"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { localizedText } from "@/lib/i18n/fallback";
import { SafeRecapImage } from "@/components/recaps/safe-recap-image";
import type { HomeRecap } from "@/lib/home/types";

export function HomeStories({ recaps }: { recaps: HomeRecap[] }) {
  const { lang, t } = useLanguage();
  const published = recaps.filter(recap => recap.status === "published").slice(0, 3);
  return <section id="how-we-ride" className="sf-stories" aria-labelledby="home-community-title">
    <div className="sf-home-width">
      <div className="sf-section-heading sf-reveal">
        <div><p className="sf-eyebrow text-[#666]">02 / FIELD NOTES · {t({ en: "THE PEOPLE BEHIND THE RIDE", zh: "社群故事" })}</p><h2 id="home-community-title">{t({ en: "More than the ride.", zh: "滑行之外，也有同频的人。" })}</h2></div>
        <Link prefetch={false} href="/about" className="sf-text-link text-[#0066cc]">{t({ en: "Our story", zh: "认识 SnowForce" })}<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
      <div className="sf-story-layout">
        <figure className="sf-story-sticky sf-reveal">
          <div className="sf-story-photo"><SafeRecapImage src="/team/group.jpg" alt={t({ en: "SnowForce riders together on the mountain", zh: "SnowForce 雪友在山上的合影" })} sizes="(min-width: 1024px) 42vw, 100vw" imageClassName="object-cover object-bottom" fallbackLabel="SNOWFORCE" unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂不可用" })} /></div>
          <figcaption className="sf-eyebrow mt-4 text-[#666]">SNOWFORCE / {t({ en: "DIFFERENT LINES. SAME MOUNTAIN.", zh: "不同的雪道，同一座山。" })}</figcaption>
        </figure>
        <ol className="sf-story-steps">
          {[
            { number: "01", title: { en: "Find your ride.", zh: "出发" }, english: "DEPART", body: { en: "First tracks or your first turns? Choose a date and an activity that fits your level. Every good day starts with a plan that feels right.", zh: "第一次上雪，或是想滑得更远？按时间和水平选择适合的活动。好的雪日，从一份合适的计划开始。" }, href: "/events", action: { en: "Find an activity", zh: "寻找适合的活动" } },
            { number: "02", title: { en: "Know the plan.", zh: "准备" }, english: "GET READY", body: { en: "Check the meeting point, equipment, included costs and cancellation terms. A little clarity now means more time for the mountain later.", zh: "先看清集合地点、装备要求、费用包含项和取消规则。把准备做在前面，把时间留给雪山。" }, href: "/faq", action: { en: "Before you go", zh: "出发前，先看看" } },
            { number: "03", title: { en: "Go together.", zh: "同行" }, english: "TOGETHER", body: { en: "Join an activity, complete its registration steps, and find the details in your account. Come for the mountain. Stay for the people.", zh: "完成活动报名和所需确认，在账号中查看行程。为雪山而来，也为一起滑行的人，期待下一次。" }, href: "/member", action: { en: "Your mountain days", zh: "查看我的行程" } },
          ].map(step => <li key={step.number} className="sf-story-step sf-reveal"><span className="sf-step-number" aria-hidden="true">{step.number}</span><div><h3>{t(step.title)}</h3><p className="sf-eyebrow mt-2 text-[#777]">{step.english}</p><p className="mt-5 text-[16px] leading-8 text-[#5c6067]">{t(step.body)}</p><Link prefetch={false} href={step.href} className="sf-text-link mt-5 text-[#0066cc]">{t(step.action)}<ArrowUpRight size={16} aria-hidden="true" /></Link></div></li>)}
        </ol>
      </div>
      <div id="past-recaps" role="region" aria-label={t({ en: "Recent mountain days", zh: "最近的雪山日" })} className="sf-recap-section">
        <div className="flex flex-wrap items-end justify-between gap-5 sf-reveal"><div><p className="sf-eyebrow text-[#666]">FROM THE MOUNTAIN</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[40px]">{t({ en: "Good days. Kept close.", zh: "把一起滑过的日子，留下来。" })}</h2></div><Link prefetch={false} href="/recaps" className="sf-text-link text-[#0066cc]">{t({ en: "All recaps", zh: "全部回顾" })}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        {published.length ? <div className="sf-recap-grid">{published.map(recap => <Link prefetch={false} href={`/recaps/${recap.slug}`} key={recap.slug} className="sf-recap-link sf-reveal"><div className="sf-recap-photo"><SafeRecapImage src={recap.coverImage} alt={localizedText(recap.title, lang)} sizes="(min-width: 768px) 33vw, 100vw" fallbackLabel={t({ en: "Community archive", zh: "社群影像" })} unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂不可用" })} /></div><p className="mt-5 text-xs text-[#666]">{recap.date} · {localizedText(recap.location, lang)}</p><h3 className="mt-2 text-xl font-semibold">{localizedText(recap.title, lang)}</h3><p className="mt-3 line-clamp-2 text-sm leading-7 text-[#666]">{localizedText(recap.summary, lang)}</p></Link>)}</div> : <p className="mt-6 text-[16px] leading-8 text-[#666]">{t({ en: "The next story starts on the mountain. Explore an upcoming event.", zh: "下一段故事，从雪山开始。先看看即将出发的活动。" })}</p>}
      </div>
    </div>
  </section>;
}
