"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, MapPin } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { localizedList, localizedText } from "@/lib/i18n/fallback";
import { useLanguage, type Lang } from "@/lib/language";
import type { Bilingual, EventRecap } from "@/lib/types";
import { SafeRecapImage } from "./safe-recap-image";
import {
  buildRecapReelFrames,
  getReelHeightVh,
  getReelPosition,
  orderedRecapMedia,
  shouldUseDesktopReel,
} from "./mountain-memory-reel-utils";

type ReelStyle = CSSProperties & {
  "--memory-progress"?: string;
  "--memory-scale"?: number;
  "--memory-next-opacity"?: number;
};

const IMAGE_FALLBACK = "/team/group.jpg";

export function MountainMemoryReel({ recaps }: { recaps: EventRecap[] }) {
  const { lang, t } = useLanguage();
  const frames = useMemo(() => buildRecapReelFrames(recaps), [recaps]);
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage || typeof window.matchMedia !== "function") return;

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;

    const update = () => {
      animationFrame = 0;
      const useDesktop = shouldUseDesktopReel({
        isDesktop: desktopQuery.matches,
        reduceMotion: motionQuery.matches,
        frameCount: frames.length,
      });

      if (!useDesktop) {
        stage.style.setProperty("--memory-progress", "100%");
        stage.style.setProperty("--memory-scale", "1");
        stage.style.setProperty("--memory-next-opacity", "1");
        return;
      }

      const rect = section.getBoundingClientRect();
      const scrollable = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      const position = getReelPosition(progress, frames.length);

      stage.style.setProperty("--memory-progress", `${position.overallProgress * 100}%`);
      stage.style.setProperty("--memory-scale", String(1.035 - position.frameProgress * 0.035));
      stage.style.setProperty("--memory-next-opacity", String(0.35 + position.frameProgress * 0.65));

      if (position.index !== currentIndexRef.current) {
        currentIndexRef.current = position.index;
        setCurrentIndex(position.index);
      }
    };

    const requestUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    desktopQuery.addEventListener("change", requestUpdate);
    motionQuery.addEventListener("change", requestUpdate);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      desktopQuery.removeEventListener("change", requestUpdate);
      motionQuery.removeEventListener("change", requestUpdate);
    };
  }, [frames.length]);

  const scrollToFrame = useCallback(
    (targetIndex: number) => {
      const section = sectionRef.current;
      if (!section || frames.length <= 1) return;

      const index = Math.min(frames.length - 1, Math.max(0, targetIndex));
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const scrollable = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = (index + 0.04) / frames.length;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      window.scrollTo({
        top: sectionTop + scrollable * progress,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [frames.length],
  );

  if (frames.length === 0) {
    return <EmptyMemoryReel />;
  }

  const active = frames[Math.min(currentIndex, frames.length - 1)];
  const next = frames[currentIndex + 1];
  const activeTitle = localizedText(active.recap.title, lang);
  const secondaryTitle = localizedText(active.recap.title, otherLanguage(lang));
  const activeCaption = localizedPartial(active.caption, lang) || localizedText(active.recap.summary, lang);
  const secondaryCaption = localizedPartial(active.caption, otherLanguage(lang));
  const nextCaption = next
    ? localizedPartial(next.caption, lang) || localizedText(next.recap.summary, lang)
    : "";
  const reelHeight = getReelHeightVh(frames.length);
  const stageStyle: ReelStyle = {
    "--memory-progress": "0%",
    "--memory-scale": 1.035,
    "--memory-next-opacity": 0.35,
  };

  return (
    <section id="past-recaps" className="bg-[#07090c] text-white">
      <NaturalMemoryChapters recaps={recaps} />

      <section
        ref={sectionRef}
        className="memory-reel-desktop relative"
        style={{ height: `${reelHeight}vh` }}
        aria-label={t({ en: "Scroll-driven event recap reel", zh: "滚动式活动回顾" })}
      >
        <div
          ref={stageRef}
          className="memory-reel-stage sticky top-16 h-[calc(100svh-4rem)] min-h-[680px] overflow-hidden bg-[#07090c]"
          style={stageStyle}
        >
          <div key={`${active.id}-image`} className="memory-frame-enter absolute inset-0">
            <SafeRecapImage
              src={active.imageUrl}
              alt={activeCaption}
              fallbackSrc={IMAGE_FALLBACK}
              fallbackAlt={t({ en: "SnowForce riders together on the mountain", zh: "SnowForce 雪友在山顶合影" })}
              fallbackLabel={t({ en: "Community archive fallback", zh: "社群影像替代图" })}
              unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })}
              sizes="100vw"
              priority
              imageClassName="memory-reel-main-image object-cover"
            />
          </div>

          <div className="absolute inset-y-0 left-0 w-[43%] bg-black/[0.84]" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 h-20 bg-black/60" aria-hidden="true" />

          <div className="relative z-10 grid h-full grid-cols-[43%_57%]">
            <div className="memory-reel-copy flex min-w-0 flex-col px-10 pb-12 pt-24 xl:px-14">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70">
                {t({ en: "Mountain memory", zh: "山地记忆" })} {pad(active.recapIndex + 1)}
              </p>
              <p className="mt-3 text-[clamp(5.5rem,9vw,9.5rem)] font-light leading-[0.78] tracking-[-0.075em] text-white/[0.14]">
                {active.recap.date.slice(0, 4)}
              </p>

              <div className="mt-5">
                <h2 className="max-w-xl text-[clamp(2.3rem,4vw,4.6rem)] font-semibold leading-[0.94] tracking-[-0.045em]">
                  {activeTitle}
                </h2>
                {secondaryTitle && secondaryTitle !== activeTitle ? (
                  <p className="mt-3 max-w-xl text-[21px] leading-[1.25] text-white/80">{secondaryTitle}</p>
                ) : null}
              </div>

              <div className="mt-7 space-y-3 border-t border-white/20 pt-6 text-[14px] leading-5 text-white/70">
                <p className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{localizedText(active.recap.location, lang)}</span>
                </p>
                <p className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formatDate(active.recap.date, lang)}</span>
                </p>
              </div>

              <div className="mt-6 max-w-lg text-[16px] leading-7 text-white/80">
                <p>{activeCaption}</p>
                {secondaryCaption && secondaryCaption !== activeCaption ? (
                  <p className="mt-1 text-white/50">{secondaryCaption}</p>
                ) : null}
              </div>

              <p className="mt-5 line-clamp-2 text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-white/60">
                {localizedList(active.recap.tags, lang).join("  ·  ")}
              </p>

              <div className="mt-auto flex flex-wrap items-center gap-4 pt-7">
                <Link
                  href={`/recaps/${active.recap.slug}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-5 text-[15px] font-semibold text-white transition hover:bg-[#0071e3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  {t({ en: "View full recap", zh: "查看完整回顾" })}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => scrollToFrame(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    aria-label={t({ en: "Previous memory", zh: "上一段记忆" })}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 transition hover:border-white/70 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToFrame(currentIndex + 1)}
                    disabled={currentIndex === frames.length - 1}
                    aria-label={t({ en: "Next memory", zh: "下一段记忆" })}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 transition hover:border-white/70 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <div className="relative min-w-0">
              <div className="absolute right-8 top-24 text-right text-[12px] font-semibold uppercase tracking-[0.14em] text-white/80 xl:right-12">
                <p>{pad(active.photoIndex + 1)} / {pad(active.photoCount)}</p>
                <p className="mt-2 text-white/50">{pad(active.recapIndex + 1)} / {pad(active.recapCount)} {t({ en: "events", zh: "场活动" })}</p>
              </div>

              {next ? (
                <aside className="memory-reel-next absolute bottom-24 right-8 w-[min(25vw,320px)] xl:right-12">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                    {t({ en: "Next memory", zh: "下一段记忆" })}
                  </p>
                  <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-[8px] border border-white/[0.55] bg-[#17191d]">
                    <SafeRecapImage
                      src={next.imageUrl}
                      alt={nextCaption}
                      fallbackSrc={IMAGE_FALLBACK}
                      fallbackAlt={t({ en: "SnowForce riders together on the mountain", zh: "SnowForce 雪友在山顶合影" })}
                      fallbackLabel={t({ en: "Archive fallback", zh: "影像替代图" })}
                      unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })}
                      sizes="320px"
                    />
                  </div>
                  <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-white/75">{nextCaption}</p>
                </aside>
              ) : (
                <div className="absolute bottom-24 right-8 text-right xl:right-12">
                  <p className="text-[12px] uppercase tracking-[0.14em] text-white/60">
                    {t({ en: "End of the reel", zh: "回放结束" })}
                  </p>
                  <Link href="/recaps" className="mt-3 inline-flex items-center gap-2 text-[15px] font-semibold text-[#2997ff]">
                    {t({ en: "Browse all recaps", zh: "浏览全部回顾" })}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 bg-black/80 px-10 py-5 xl:px-14">
            <div className="flex items-center gap-5">
              <p className="w-16 text-[14px] font-semibold tabular-nums text-white">
                {pad(currentIndex + 1)} / {pad(frames.length)}
              </p>
              <div className="h-px flex-1 overflow-hidden bg-white/30" aria-hidden="true">
                <div className="h-full w-[var(--memory-progress)] bg-[#0066cc]" />
              </div>
              <Link href="/recaps" className="text-[13px] font-semibold text-[#2997ff]">
                {t({ en: "All recaps", zh: "全部回顾" })}
              </Link>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {t({
              en: `Event ${active.recapIndex + 1} of ${active.recapCount}, photo ${active.photoIndex + 1} of ${active.photoCount}: ${activeTitle}`,
              zh: `第 ${active.recapIndex + 1} 场，共 ${active.recapCount} 场；第 ${active.photoIndex + 1} 张，共 ${active.photoCount} 张：${activeTitle}`,
            })}
          </p>
        </div>
      </section>
    </section>
  );
}

function NaturalMemoryChapters({ recaps }: { recaps: EventRecap[] }) {
  const { lang, t } = useLanguage();

  return (
    <div className="memory-reel-natural">
      <header className="border-b border-white/[0.14] px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#2997ff]">
          {t({ en: "Past Event Recaps", zh: "往期活动回顾" })}
        </p>
        <h2 className="mt-5 text-[42px] font-semibold leading-[0.96] tracking-[-0.045em] sm:text-[58px]">
          {t({ en: "Mountain memories, one chapter at a time.", zh: "一章一章，滑回山地记忆。" })}
        </h2>
      </header>

      {recaps.map((recap, recapIndex) => {
        const media = orderedRecapMedia(recap);
        const title = localizedText(recap.title, lang);
        const secondaryTitle = localizedText(recap.title, otherLanguage(lang));
        const summary = localizedText(recap.summary, lang);
        const cover = recap.coverImage || media[0]?.url || "";

        return (
          <article key={recap.slug} className="border-b border-white/[0.14] pb-16">
            <div className="sticky top-16 z-10 border-b border-white/[0.14] bg-[#07090c] px-4 py-6 sm:px-6">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2997ff]">
                    {t({ en: "Mountain memory", zh: "山地记忆" })} {pad(recapIndex + 1)}
                  </p>
                  <h3 className="mt-3 text-[30px] font-semibold leading-[1] tracking-[-0.035em]">{title}</h3>
                  {secondaryTitle !== title ? <p className="mt-2 text-[16px] text-white/60">{secondaryTitle}</p> : null}
                </div>
                <span className="text-[13px] text-white/50">{recap.date.slice(0, 4)}</span>
              </div>
            </div>

            <div className="px-4 pt-5 sm:px-6">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[8px] bg-[#17191d] sm:aspect-[16/10]">
                <SafeRecapImage
                  src={cover}
                  alt={summary || title}
                  fallbackSrc={IMAGE_FALLBACK}
                  fallbackAlt={t({ en: "SnowForce riders together on the mountain", zh: "SnowForce 雪友在山顶合影" })}
                  fallbackLabel={t({ en: "Community archive fallback", zh: "社群影像替代图" })}
                  unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })}
                  sizes="100vw"
                  priority={recapIndex === 0}
                />
              </div>

              <div className="mt-6 grid gap-4 text-[14px] leading-6 text-white/70 sm:grid-cols-2">
                <div>
                  <p className="flex items-start gap-2"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{localizedText(recap.location, lang)}</p>
                  <p className="mt-2 flex items-start gap-2"><CalendarDays className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{formatDate(recap.date, lang)}</p>
                </div>
                <p>{summary}</p>
              </div>

              {media.length > 1 ? (
                <div className="recap-horizontal-strip -mr-4 mt-7 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 pr-4 sm:-mr-6 sm:pr-6" aria-label={t({ en: "Recap photo strip", zh: "活动照片浏览" })}>
                  {media.map((item, index) => {
                    const caption = localizedPartial(item.caption ?? {}, lang) || `${title} ${index + 1}`;
                    return (
                      <figure key={item.id} className="w-[76vw] max-w-[430px] shrink-0 snap-center">
                        <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] bg-[#17191d]">
                          <SafeRecapImage
                            src={item.url}
                            alt={caption}
                            fallbackSrc={IMAGE_FALLBACK}
                            fallbackAlt={t({ en: "SnowForce community photo", zh: "SnowForce 社群照片" })}
                            fallbackLabel={t({ en: "Archive fallback", zh: "影像替代图" })}
                            unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })}
                            sizes="76vw"
                          />
                        </div>
                        <figcaption className="mt-2 text-[12px] leading-5 text-white/60">{caption}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              ) : null}

              <Link
                href={`/recaps/${recap.slug}`}
                className="mt-7 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-[#2997ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                {t({ en: "View full recap", zh: "查看完整回顾" })}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        );
      })}

      <div className="px-4 py-8 sm:px-6">
        <Link href="/recaps" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-[#2997ff]">
          {t({ en: "Browse all recaps", zh: "浏览全部回顾" })}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function EmptyMemoryReel() {
  const { t } = useLanguage();

  return (
    <section id="past-recaps" className="bg-[#07090c] px-4 py-20 text-white sm:px-6 sm:py-28">
      <div className="mx-auto max-w-[1120px] border-y border-white/[0.16] py-12">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#2997ff]">
          {t({ en: "Past Event Recaps", zh: "往期活动回顾" })}
        </p>
        <h2 className="mt-5 text-[38px] font-semibold leading-tight sm:text-[52px]">
          {t({ en: "No published recap photos yet. Check back after the next ride.", zh: "暂时还没有已发布的活动照片，下一场活动后再回来看看。" })}
        </h2>
      </div>
    </section>
  );
}

function localizedPartial(value: Partial<Bilingual>, lang: Lang): string {
  return value[lang] ?? value[otherLanguage(lang)] ?? "";
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
