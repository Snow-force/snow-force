"use client";
import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { localizedText } from "@/lib/i18n/fallback";
import type { EventRecap } from "@/lib/types";
import { SafeRecapImage } from "./safe-recap-image";

export function RecapsView({ recaps }: { recaps: EventRecap[] }) {
  const { lang, t } = useLanguage();
  const [visible, setVisible] = useState(6);
  return <main className="min-h-screen bg-[#f4f4f1] px-4 py-14 text-gray-900 sm:px-6 sm:py-20">
    <div className="mx-auto max-w-6xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-snow-700">SNOWFORCE / FIELD NOTES</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">{t({ en: "Past Event Recaps", zh: "往期活动回顾" })}</h1>
      <p className="mt-5 max-w-2xl text-base leading-8 text-gray-600">{t({ en: "See the places, the people and the moments. Pick a story, then explore its photos.", zh: "看看雪山、同行的雪友和真实的活动瞬间。先选一段故事，再打开相册。" })}</p>
      {recaps.length === 0 ? <p className="py-20 text-lg text-gray-600">{t({ en: "No published recaps yet.", zh: "暂时还没有已发布的活动回顾。" })}</p> : <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {recaps.slice(0, visible).map((recap) => {
          const title = localizedText(recap.title, lang);
          const count = new Set([recap.coverImage, ...recap.media.map((item) => item.url)].filter(Boolean)).size;
          return <article key={recap.slug}>
            <Link href={`/recaps/${recap.slug}`} className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-snow-600">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-200"><SafeRecapImage src={recap.coverImage || recap.media[0]?.url || ""} alt={title} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" fallbackLabel={t({ en: "Community archive", zh: "社群影像" })} unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂不可用" })} /></div>
              <p className="mt-4 text-xs text-gray-500">{recap.date} · {localizedText(recap.location, lang)}</p>
              <h2 className="mt-2 text-xl font-semibold group-hover:text-snow-700">{title}</h2>
              <p className="mt-2 line-clamp-2 text-sm leading-7 text-gray-600">{localizedText(recap.summary, lang)}</p>
              <p className="mt-3 text-sm font-medium text-snow-700">{t({ en: "Open the full recap", zh: "打开完整回顾" })} · {count} {t({ en: count === 1 ? "photo" : "photos", zh: "张照片" })}</p>
            </Link>
          </article>;
        })}
      </div>}
      {visible < recaps.length && <button onClick={() => setVisible((count) => count + 6)} className="mt-10 min-h-11 rounded border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-snow-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-snow-600">{t({ en: "Show more recaps", zh: "查看更多回顾" })}</button>}
      <footer className="mt-14 flex flex-wrap items-center justify-between gap-5 border-t border-gray-300 pt-8"><p className="text-lg font-semibold">{t({ en: "Make the next story yours.", zh: "下一段故事，等你加入。" })}</p><Link href="/events" className="inline-flex min-h-11 items-center font-semibold text-snow-700 underline">{t({ en: "See open events", zh: "查看正在报名" })}</Link></footer>
    </div>
  </main>;
}
