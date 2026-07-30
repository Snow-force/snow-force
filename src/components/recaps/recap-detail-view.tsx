"use client";

import Link from "next/link";
import { localizedList, localizedText } from "@/lib/i18n/fallback";
import { useLanguage } from "@/lib/language";
import type { EventRecap, PublicEventReview } from "@/lib/types";
import { ScrollingMediaStream } from "./scrolling-media-stream";

export function RecapDetailView({
  recap,
  reviews,
}: {
  recap: EventRecap | undefined;
  reviews: PublicEventReview[];
}) {
  const { lang, t } = useLanguage();

  if (!recap) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          {t({ en: "Recap Not Found", zh: "回顾未找到" })}
        </h1>
        <Link href="/recaps" className="mt-4 inline-block text-sm font-medium text-snow-600 hover:text-snow-700">
          {t({ en: "← Back to Recaps", zh: "← 返回回顾列表" })}
        </Link>
      </div>
    );
  }

  const title = localizedText(recap.title, lang);
  const content = localizedText(recap.content, lang);
  const location = localizedText(recap.location, lang);
  const tags = localizedList(recap.tags, lang);

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-8 text-sm text-gray-400">
          <Link href="/recaps" className="hover:text-gray-600">{t({ en: "Recaps", zh: "往期回顾" })}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-600">{title}</span>
        </nav>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-block rounded-full bg-snow-50 px-2.5 py-0.5 text-xs font-medium text-snow-700">
              {tag}
            </span>
          ))}
        </div>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {title}
        </h1>

        <div className="mt-4 flex items-center gap-3 text-sm text-gray-400">
          <span>{location}</span>
          <span>·</span>
          <span>{new Date(recap.date).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>

        <div className="mt-8 whitespace-pre-line text-gray-600 leading-relaxed">
          {content}
        </div>

        {recap.media.length > 0 ? (
          <div className="mt-10">
            <h2 className="text-xl font-semibold text-gray-900">
              {t({ en: "Photos", zh: "活动照片" })}
            </h2>
            <ScrollingMediaStream media={recap.media} />
          </div>
        ) : null}

        {reviews.length > 0 ? (
          <section className="mt-12 border-t border-gray-200 pt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {t({ en: "Member feedback", zh: "会员反馈" })}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {t({
                    en: "Published with member consent after SnowForce moderation.",
                    zh: "经会员同意并由 SnowForce 审核后发布。",
                  })}
                </p>
              </div>
              <p className="text-sm font-semibold text-snow-700">
                {(reviews.reduce((sum, review) => sum + review.overallRating, 0) / reviews.length).toFixed(1)}/5
              </p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {reviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-900">{review.authorLabel}</p>
                    <p className="text-sm font-semibold text-snow-700">{review.overallRating}/5</p>
                  </div>
                  {typeof review.answers.best_part === "string" ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                      {review.answers.best_part}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
