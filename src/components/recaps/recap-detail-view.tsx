"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";

import { localizedList, localizedText } from "@/lib/i18n/fallback";
import { useLanguage, type Lang } from "@/lib/language";
import type { EventRecap, PublicEventReview } from "@/lib/types";
import { SafeRecapImage } from "./safe-recap-image";
import { ScrollingMediaStream } from "./scrolling-media-stream";

const IMAGE_FALLBACK = "/team/group.jpg";

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
      <main className="bg-[#f4f4f1] px-4 py-24 text-center sm:px-6 sm:py-32">
        <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#0066cc]">
          {t({ en: "SnowForce field journal", zh: "SnowForce 山野日志" })}
        </p>
        <h1 className="mt-5 text-[40px] font-semibold tracking-[-0.04em] text-[#171719] sm:text-[58px]">
          {t({ en: "Recap not found", zh: "没有找到这场回顾" })}
        </h1>
        <Link
          href="/recaps"
          className="mt-8 inline-flex min-h-11 items-center gap-2 text-[16px] font-semibold text-[#0066cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0071e3]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t({ en: "Back to all recaps", zh: "返回全部回顾" })}
        </Link>
      </main>
    );
  }

  const title = localizedText(recap.title, lang);
  const secondaryTitle = localizedText(recap.title, otherLanguage(lang));
  const summary = localizedText(recap.summary, lang);
  const content = localizedText(recap.content, lang);
  const location = localizedText(recap.location, lang);
  const tags = localizedList(recap.tags, lang);

  return (
    <main className="bg-white text-[#171719]">
      <header className="grid bg-[#f4f4f1] lg:min-h-[760px] lg:grid-cols-[0.38fr_0.62fr]">
        <div className="flex min-w-0 flex-col px-4 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-14 xl:px-14">
          <Link
            href="/recaps"
            className="inline-flex min-h-11 w-fit items-center gap-2 text-[14px] font-semibold text-[#0066cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0071e3]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t({ en: "All recaps", zh: "全部回顾" })}
          </Link>

          <p className="mt-10 text-[13px] font-semibold uppercase tracking-[0.15em] text-[#0066cc]">
            {t({ en: "Event recap", zh: "活动回顾" })} · {recap.date.slice(0, 4)}
          </p>
          <h1 className="mt-5 break-words text-[40px] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[62px] sm:leading-[0.96] lg:text-[clamp(3.4rem,5vw,5.5rem)]">
            {title}
          </h1>
          {secondaryTitle && secondaryTitle !== title ? (
            <p className="mt-4 break-words text-[20px] leading-7 text-[#44464b] sm:text-[21px]">{secondaryTitle}</p>
          ) : null}

          <div className="mt-8 space-y-3 border-t border-black/[0.12] pt-6 text-[14px] leading-5 text-[#4e5055]">
            <p className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{location}</span>
            </p>
            <p className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{formatDate(recap.date, lang)}</span>
            </p>
          </div>

          <p className="mt-8 text-[17px] leading-8 text-[#57595e]">{summary}</p>
          {tags.length > 0 ? (
            <p className="mt-auto pt-10 text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-[#46484d]">
              {tags.join("  ·  ")}
            </p>
          ) : null}
        </div>

        <div className="relative min-h-[420px] overflow-hidden bg-[#111214] sm:min-h-[600px] lg:min-h-full">
          <div className="absolute inset-5 overflow-hidden rounded-[8px] sm:inset-8 lg:inset-10 xl:inset-12">
            <SafeRecapImage
              src={recap.coverImage}
              alt={summary || title}
              fallbackSrc={IMAGE_FALLBACK}
              fallbackAlt={t({ en: "SnowForce riders together on the mountain", zh: "SnowForce 雪友在山顶合影" })}
              fallbackLabel={t({ en: "Community archive fallback", zh: "社群影像替代图" })}
              unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })}
              sizes="(min-width: 1024px) 58vw, 100vw"
              priority
            />
          </div>
        </div>
      </header>

      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[0.28fr_0.72fr] lg:gap-20">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#0066cc]">
              {t({ en: "The story", zh: "活动故事" })}
            </p>
            <p className="mt-4 text-[28px] font-semibold leading-tight tracking-[-0.03em]">
              {t({ en: "What stayed with us after the lifts stopped.", zh: "缆车停下以后，留下来的那些瞬间。" })}
            </p>
          </div>
          <div className="whitespace-pre-line text-[17px] leading-8 text-[#56585d] sm:text-[19px] sm:leading-9">
            {content || summary}
          </div>
        </div>
      </section>

      {recap.media.length > 0 ? (
        <section className="bg-[#111214] px-4 py-20 text-white sm:px-6 sm:py-28">
          <div className="mx-auto max-w-[1320px]">
            <div className="flex flex-col gap-5 border-b border-white/[0.14] pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#2997ff]">
                  {t({ en: "Complete photo stream", zh: "完整照片流" })}
                </p>
                <h2 className="mt-4 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[64px]">
                  {t({ en: "Inside this chapter", zh: "走进这一章" })}
                </h2>
              </div>
              <p className="max-w-sm text-[15px] leading-7 text-white/60">
                {t({
                  en: "Open any frame for the full-screen viewer. Arrow keys move through the sequence.",
                  zh: "打开任意画面进入全屏浏览；可使用方向键依次查看。",
                })}
              </p>
            </div>
            <ScrollingMediaStream media={recap.media} />
          </div>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section className="bg-[#f4f4f1] px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-[1120px]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.12] pb-7">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-[#0066cc]">
                  {t({ en: "Community voice", zh: "社群声音" })}
                </p>
                <h2 className="mt-3 text-[34px] font-semibold tracking-[-0.03em] sm:text-[46px]">
                  {t({ en: "Member feedback", zh: "会员反馈" })}
                </h2>
                <p className="mt-2 text-[14px] leading-6 text-[#62646a]">
                  {t({
                    en: "Published with member consent after SnowForce moderation.",
                    zh: "经会员同意并由 SnowForce 审核后发布。",
                  })}
                </p>
              </div>
              <p className="text-[24px] font-semibold text-[#0066cc]">
                {(reviews.reduce((sum, review) => sum + review.overallRating, 0) / reviews.length).toFixed(1)}/5
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {reviews.map((review) => (
                <article key={review.id} className="rounded-[12px] border border-black/[0.12] bg-white p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{review.authorLabel}</p>
                    <p className="text-[14px] font-semibold text-[#0066cc]">{review.overallRating}/5</p>
                  </div>
                  {typeof review.answers.best_part === "string" ? (
                    <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#5b5d62]">
                      {review.answers.best_part}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
function otherLanguage(lang: Lang): Lang {
  return lang === "en" ? "zh" : "en";
}

function formatDate(date: string, lang: Lang): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
