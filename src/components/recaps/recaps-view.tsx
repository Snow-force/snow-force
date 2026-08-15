"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Images, MapPin } from "lucide-react";

import { localizedList, localizedText } from "@/lib/i18n/fallback";
import { useLanguage, type Lang } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { SafeRecapImage } from "./safe-recap-image";

const IMAGE_FALLBACK = "/team/group.jpg";

export function RecapsView({ recaps }: { recaps: EventRecap[] }) {
  const { lang, t } = useLanguage();

  return (
    <main className="bg-[#f4f4f1] text-[#171719]">
      <header className="border-b border-black/[0.12] px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-[1320px] gap-10 lg:grid-cols-[0.62fr_0.38fr] lg:items-end">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#0066cc]">
              {t({ en: "SnowForce field journal", zh: "SnowForce 山野日志" })}
            </p>
            <h1 className={`mt-5 break-words font-semibold leading-[0.96] tracking-[-0.05em] sm:text-[84px] sm:leading-[0.92] sm:tracking-[-0.055em] lg:text-[112px] ${lang === "zh" ? "whitespace-nowrap text-[44px]" : "text-[48px]"}`}>
              {t({ en: "Past Event Recaps", zh: "往期活动回顾" })}
            </h1>
          </div>
          <p className="max-w-md text-[17px] leading-8 text-[#5a5c61] lg:pb-2">
            {t({
              en: "Real mountain days, kept as chapters. Open a recap for the complete photo stream and the stories behind it.",
              zh: "把真实发生过的雪山日留成章节。打开一场回顾，查看完整照片流和照片背后的故事。",
            })}
          </p>
        </div>
      </header>

      {recaps.length === 0 ? (
        <section className="px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-[920px] border-y border-black/[0.14] py-14 text-center">
            <p className="text-[34px] font-semibold leading-tight sm:text-[48px]">
              {t({ en: "No published recaps yet.", zh: "暂时还没有已发布的活动回顾。" })}
            </p>
            <p className="mx-auto mt-4 max-w-lg text-[16px] leading-7 text-[#63656a]">
              {t({ en: "Come back after the next community ride.", zh: "下一场社群活动结束后，再回来看看。" })}
            </p>
          </div>
        </section>
      ) : (
        <div>
          {recaps.map((recap, index) => {
            const title = localizedText(recap.title, lang);
            const secondaryTitle = localizedText(recap.title, otherLanguage(lang));
            const summary = localizedText(recap.summary, lang);
            const location = localizedText(recap.location, lang);
            const tags = localizedList(recap.tags, lang);
            const photoCount = recap.media.length + (recap.coverImage ? 1 : 0);

            return (
              <article
                key={recap.slug}
                className="border-b border-black/[0.12] first:border-t-0 lg:grid lg:min-h-[720px] lg:grid-cols-[0.38fr_0.62fr]"
              >
                <div className="flex flex-col px-4 py-12 sm:px-8 lg:px-10 lg:py-14 xl:px-14">
                  <div className="flex items-start justify-between gap-5">
                    <p className="text-[clamp(4.5rem,8vw,8rem)] font-light leading-[0.8] tracking-[-0.075em]">
                      {pad(index + 1)}
                    </p>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-[#0066cc]">
                      {recap.date.slice(0, 4)}
                    </p>
                  </div>

                  <div className="mt-10">
                    <h2 className="text-[36px] font-semibold leading-[0.98] tracking-[-0.04em] sm:text-[50px]">
                      {title}
                    </h2>
                    {secondaryTitle && secondaryTitle !== title ? (
                      <p className="mt-3 text-[20px] leading-7 text-[#44464b]">{secondaryTitle}</p>
                    ) : null}
                  </div>

                  <div className="mt-7 space-y-3 border-t border-black/[0.12] pt-6 text-[14px] leading-5 text-[#4e5055]">
                    <p className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{location}</span>
                    </p>
                    <p className="flex items-start gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{formatDate(recap.date, lang)}</span>
                    </p>
                    <p className="flex items-start gap-3">
                      <Images className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {photoCount} {t({ en: photoCount === 1 ? "photo" : "photos", zh: "张照片" })}
                      </span>
                    </p>
                  </div>

                  <p className="mt-7 line-clamp-5 text-[16px] leading-7 text-[#5d5f64]">{summary}</p>
                  {tags.length > 0 ? (
                    <p className="mt-7 text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-[#4a4c51]">
                      {tags.join("  ·  ")}
                    </p>
                  ) : null}

                  <Link
                    href={`/recaps/${recap.slug}`}
                    className="mt-9 inline-flex min-h-11 w-fit items-center gap-2 text-[16px] font-semibold text-[#0066cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0071e3] lg:mt-auto lg:pt-8"
                  >
                    {t({ en: "Open the full recap", zh: "打开完整回顾" })}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>

                <Link
                  href={`/recaps/${recap.slug}`}
                  className="group relative block min-h-[360px] overflow-hidden bg-[#111214] sm:min-h-[520px] lg:min-h-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
                  aria-label={t({ en: `Open ${title}`, zh: `打开${title}` })}
                >
                  <div className="absolute inset-5 overflow-hidden rounded-[8px] sm:inset-8 lg:inset-10 xl:inset-12">
                    <SafeRecapImage
                      src={recap.coverImage}
                      alt={summary || title}
                      fallbackSrc={IMAGE_FALLBACK}
                      fallbackAlt={t({ en: "SnowForce riders together on the mountain", zh: "SnowForce 雪友在山顶合影" })}
                      fallbackLabel={t({ en: "Community archive fallback", zh: "社群影像替代图" })}
                      unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })}
                      sizes="(min-width: 1024px) 58vw, 100vw"
                      priority={index === 0}
                      imageClassName="object-cover transition duration-500 group-hover:scale-[1.015]"
                    />
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}

      <footer className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 border-t border-black/[0.12] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[26px] font-semibold tracking-[-0.025em]">
            {t({ en: "Ready to make the next chapter?", zh: "准备好加入下一章了吗？" })}
          </p>
          <Link
            href="/events"
            className="inline-flex min-h-11 items-center gap-2 text-[16px] font-semibold text-[#0066cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0071e3]"
          >
            {t({ en: "See open events", zh: "查看正在报名" })}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </footer>
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

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
