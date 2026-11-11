"use client";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { localizedText } from "@/lib/i18n/fallback";
import type { EventRecap } from "@/lib/types";
import { SafeRecapImage } from "./safe-recap-image";

/** One cover per story; opening an album is an explicit customer decision. */
export function RecapHighlights({ recaps }: { recaps: EventRecap[] }) {
  const { lang, t } = useLanguage();
  return <section id="past-recaps" aria-label={t({ en: "Recent mountain days", zh: "最近的雪山日" })} className="bg-[#f4f4f1] px-4 py-16 text-gray-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-snow-700">SNOWFORCE / FIELD NOTES</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{t({ en: "See what a day together feels like.", zh: "看看，上一次我们怎么玩。" })}</h2></div><Link href="/recaps" className="inline-flex min-h-11 items-center text-sm font-semibold text-snow-700 underline">{t({ en: "All recaps", zh: "全部回顾" })}</Link></div>
      {recaps.length === 0 ? <p className="mt-8 text-sm text-gray-600">{t({ en: "The next story starts on the mountain. Explore an upcoming event.", zh: "下一段故事，从雪山开始。先看看即将出发的活动。" })}</p> : <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {recaps.slice(0, 3).map((recap) => <Link key={recap.slug} href={`/recaps/${recap.slug}`} className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-snow-600">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-200"><SafeRecapImage src={recap.coverImage || recap.media[0]?.url || ""} alt={localizedText(recap.title, lang)} sizes="(min-width: 640px) 33vw, 100vw" fallbackLabel={t({ en: "Community archive", zh: "社群影像" })} unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂不可用" })} /></div>
          <p className="mt-4 text-xs text-gray-500">{recap.date} · {localizedText(recap.location, lang)}</p><h3 className="mt-2 text-xl font-semibold group-hover:text-snow-700">{localizedText(recap.title, lang)}</h3><p className="mt-2 line-clamp-2 text-sm leading-7 text-gray-600">{localizedText(recap.summary, lang)}</p>
        </Link>)}
      </div>}
    </div>
  </section>;
}
