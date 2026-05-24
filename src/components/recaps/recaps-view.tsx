"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";

export function RecapsView({ recaps }: { recaps: EventRecap[] }) {
  const { lang, t } = useLanguage();

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="section-title">
          {t({ en: "Past Event Recaps", zh: "往期活动回顾" })}
        </h1>
        <p className="mt-2 text-gray-500">
          {t({
            en: "Relive the best moments from past SnowForce events.",
            zh: "重温 SnowForce 往期活动的精彩瞬间。",
          })}
        </p>

        {recaps.length === 0 ? (
          <p className="mt-16 text-center text-lg text-gray-400">
            {t({ en: "No recaps yet. Stay tuned!", zh: "暂无回顾，敬请期待！" })}
          </p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                <h2 className="mt-3 text-lg font-semibold text-gray-900 group-hover:text-snow-600">
                  {t(recap.title)}
                </h2>
                <p className="mt-1 line-clamp-3 text-sm text-gray-500">{t(recap.summary)}</p>
                <div className="mt-4 flex items-center gap-3 text-sm text-gray-400">
                  <span>{t(recap.location)}</span>
                  <span>·</span>
                  <span>{new Date(recap.date).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
                {recap.media.length > 0 ? (
                  <div className="mt-3 text-xs text-snow-600">
                    {recap.media.length} {t({ en: "photos", zh: "张照片" })}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
