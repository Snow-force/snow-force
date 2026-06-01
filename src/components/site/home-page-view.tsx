"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { EventCard } from "@/components/events/event-card";
import { useLanguage, type Lang } from "@/lib/language";
import type { Bilingual, Event, EventRecap } from "@/lib/types";

type Translate = <T>(value: Bilingual<T>) => T;

type HomePageViewProps = {
  events: Event[];
  recaps: EventRecap[];
  eventLoadError?: boolean;
};

type OpenEventsSectionProps = {
  events: Event[];
  allEventCount: number;
  eventLoadError: boolean;
  lang: Lang;
  t: Translate;
};

type RecapTile = {
  key: string;
  src: string;
  title: string;
  meta: string;
};

export function HomePageView({ events, recaps, eventLoadError = false }: HomePageViewProps) {
  const { lang, t } = useLanguage();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const recentRecaps = recaps.slice(0, 4);
  const openEvents = events.filter((event) => event.registrationState === "open").slice(0, 4);

  return (
    <div className="bg-[#07090c] text-white">
      <HeroSection t={t} />
      <PhilosophySection t={t} />
      <ActivityModesSection t={t} />
      <CommunityExperienceSection t={t} />
      <PhotoWallSection recaps={recentRecaps} t={t} locale={locale} />
      <OpenEventsSection
        events={openEvents}
        allEventCount={events.length}
        eventLoadError={eventLoadError}
        lang={lang}
        t={t}
      />
    </div>
  );
}

function HeroSection({ t }: { t: Translate }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showPlayButton, setShowPlayButton] = useState(true);

  async function handlePlayClick() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();
      setShowPlayButton(false);
    } catch {
      setShowPlayButton(true);
    }
  }

  return (
    <section className="relative flex min-h-[calc(100svh-96px)] items-center justify-center overflow-hidden px-4 py-24 text-center sm:px-6">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/snowmountain.mp4"
        autoPlay
        muted
        loop
        playsInline
        onPlay={() => setShowPlayButton(false)}
        onPause={() => setShowPlayButton(true)}
        aria-label={t({ en: "SnowForce mountain video", zh: "SnowForce 雪山视频" })}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.46)_58%,rgba(7,9,12,0.96))]" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,rgba(7,9,12,0),#07090c)]" />

      <div className="relative z-10 mx-auto max-w-[980px]">
        <button
          type="button"
          aria-label={t({ en: "Play background video", zh: "播放背景视频" })}
          onClick={handlePlayClick}
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-95 ${
            showPlayButton ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <span aria-hidden="true" className="ml-1 block h-0 w-0 border-y-[8px] border-l-[12px] border-y-transparent border-l-current" />
        </button>

        <h1 className="mt-8 text-[50px] font-semibold leading-[0.98] text-white sm:text-[84px] lg:text-[112px]">
          {t({ en: "Ride the mountain together.", zh: "一起去雪山。" })}
        </h1>
        <p className="mx-auto mt-6 max-w-[19rem] break-words text-[17px] leading-[1.55] text-white/82 sm:max-w-2xl sm:text-[21px]">
          {t({
            en: "Meet riders through the community, join collective mountain activities, and make the next snow day easier to join.",
            zh: "在社群里找到同行的雪友，报名参加集体活动，把下一次上山变成一件容易发生的事。",
          })}
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="#open-events" className="btn-primary bg-white text-[#111827] hover:bg-white/90">
            {t({ en: "View open events", zh: "查看正在报名" })}
          </Link>
          <Link href="#how-we-ride" className="btn-secondary border-white/70 bg-transparent text-white hover:bg-white/10">
            {t({ en: "See how it works", zh: "看看怎么玩" })}
          </Link>
        </div>
      </div>
    </section>
  );
}

function PhilosophySection({ t }: { t: Translate }) {
  return (
    <section className="bg-[#07090c] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#7dd3fc]">
          {t({ en: "Why we exist", zh: "为什么存在" })}
        </p>
        <div>
          <h2 className="text-[38px] font-semibold leading-[1.08] text-white sm:text-[56px]">
            {t({ en: "Make joining a snow day feel simple.", zh: "让上山这件事，没那么难开始。" })}
          </h2>
          <p className="mt-6 max-w-3xl text-[18px] leading-[1.65] text-white/68">
            {t({
              en: "SnowForce organizes collective mountain activities so riders do not have to figure out every detail alone: who to ride with, which session fits, and how to join the group with confidence.",
              zh: "SnowForce 组织社区集体活动，让大家不用一个人解决所有不确定：跟谁一起滑、适合参加哪一场、怎么安心加入队伍。",
            })}
          </p>
        </div>
      </div>
    </section>
  );
}

function ActivityModesSection({ t }: { t: Translate }) {
  const modes = [
    {
      number: "01",
      title: t({ en: "Weekend mountain days", zh: "周末雪场日" }),
      body: t({
        en: "A clear, low-pressure way to join the community for a full day on snow.",
        zh: "适合新老雪友一起参加的雪场集体活动，把上山从想法变成日程。",
      }),
    },
    {
      number: "02",
      title: t({ en: "Progression sessions", zh: "进阶训练局" }),
      body: t({
        en: "Technique-focused activities for riders who want structure, feedback, and steady progress.",
        zh: "围绕技术提升组织活动，让想进阶的雪友有节奏、有反馈地练起来。",
      }),
    },
    {
      number: "03",
      title: t({ en: "Theme community rides", zh: "主题社群局" }),
      body: t({
        en: "Night sessions, park days, season meetups, and other rides built around a shared reason to gather.",
        zh: "夜滑、公园、开板、收官和主题活动，让大家因为同一个理由聚到雪上。",
      }),
    },
  ];

  return (
    <section id="how-we-ride" className="bg-[#0d1117] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-[1120px]">
        <div className="max-w-3xl">
          <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#7dd3fc]">
            {t({ en: "How we ride", zh: "我们怎么玩" })}
          </p>
          <h2 className="mt-4 text-[38px] font-semibold leading-[1.08] text-white sm:text-[56px]">
            {t({ en: "Different sessions, one community rhythm.", zh: "不同活动，同一个社群节奏。" })}
          </h2>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-[8px] bg-white/12 lg:grid-cols-3">
          {modes.map((mode) => (
            <article key={mode.number} className="bg-[#0d1117] p-6 sm:p-8">
              <span className="text-[14px] font-semibold leading-none text-[#7dd3fc]">{mode.number}</span>
              <h3 className="mt-12 text-[28px] font-semibold leading-[1.12] text-white">{mode.title}</h3>
              <p className="mt-4 text-[17px] leading-[1.6] text-white/64">{mode.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CommunityExperienceSection({ t }: { t: Translate }) {
  const features = [
    {
      title: t({ en: "WeChat coordination", zh: "微信群协调" }),
      body: t({
        en: "After registration, practical details and trip coordination happen in the community group.",
        zh: "报名后，活动细节和同行沟通主要在微信群里推进，不把还没有的功能包装成页面。",
      }),
    },
    {
      title: t({ en: "Group atmosphere", zh: "一起上山的氛围" }),
      body: t({
        en: "The point is not just a ticket. It is knowing there will be people to ride with when you arrive.",
        zh: "报名不只是拿到一个名额，而是知道到了雪场有人一起滑、一起集合、一起收尾。",
      }),
    },
    {
      title: t({ en: "Level-aware organization", zh: "按水平组织活动" }),
      body: t({
        en: "Activities describe who they fit and can split groups by ability when the format needs it.",
        zh: "活动会说明适合什么水平，必要时按能力分组，减少新手和进阶雪友的心理门槛。",
      }),
    },
  ];

  return (
    <section className="bg-[#f3f7fb] px-4 py-20 text-[#111827] sm:px-6 sm:py-28">
      <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#0066cc]">
            {t({ en: "Community experience", zh: "社区特色" })}
          </p>
          <h2 className="mt-4 text-[38px] font-semibold leading-[1.08] sm:text-[56px]">
            {t({ en: "The website handles signup. The community handles the ride.", zh: "网站负责报名，社群负责一起出发。" })}
          </h2>
        </div>

        <div className="space-y-4">
          {features.map((feature) => (
            <article key={feature.title} className="border-t border-[#cfd9e3] py-6 first:border-t-0 first:pt-0">
              <h3 className="text-[24px] font-semibold leading-[1.18]">{feature.title}</h3>
              <p className="mt-3 text-[17px] leading-[1.6] text-[#475569]">{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhotoWallSection({
  recaps,
  t,
  locale,
}: {
  recaps: EventRecap[];
  t: Translate;
  locale: string;
}) {
  const tiles = getRecapTiles(recaps, t, locale);

  return (
    <section className="bg-[#07090c] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#7dd3fc]">
              {t({ en: "Past activity wall", zh: "历史活动照片墙" })}
            </p>
            <h2 className="mt-4 text-[38px] font-semibold leading-[1.08] text-white sm:text-[56px]">
              {t({ en: "Proof that the mountain days happened.", zh: "那些已经发生过的雪山日。" })}
            </h2>
          </div>
          <Link href="/recaps" className="text-[17px] leading-[1.47] text-[#7dd3fc]">
            {t({ en: "All recaps", zh: "全部回顾" })}
          </Link>
        </div>

        <div className="mt-12 grid auto-rows-[220px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.length === 0 ? (
            <StatusTile>{t({ en: "No recap photos yet. Stay tuned.", zh: "暂时还没有活动照片，敬请期待。" })}</StatusTile>
          ) : (
            tiles.map((tile, index) => <PhotoTile key={tile.key} tile={tile} index={index} />)
          )}
        </div>
      </div>
    </section>
  );
}

function PhotoTile({ tile, index }: { tile: RecapTile; index: number }) {
  const isLarge = index === 0 || index === 5;

  return (
    <article
      className={`relative overflow-hidden rounded-[8px] bg-[#1f2937] bg-cover bg-center p-5 ${
        isLarge ? "sm:col-span-2 sm:row-span-2" : ""
      }`}
      style={
        tile.src
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.72)), url(${tile.src})`,
            }
          : undefined
      }
    >
      {!tile.src ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_22%,rgba(125,211,252,0.24),transparent_34%),linear-gradient(145deg,#1f2937,#0f172a)]" />
      ) : (
        <div className="absolute inset-0 bg-black/10" />
      )}
      <div className="relative z-10 flex h-full flex-col justify-end">
        <h3 className="line-clamp-2 text-[22px] font-semibold leading-[1.14] text-white">{tile.title}</h3>
        <p className="mt-2 text-[13px] leading-[1.35] text-white/70">{tile.meta}</p>
      </div>
    </article>
  );
}

function OpenEventsSection({ events, allEventCount, eventLoadError, lang, t }: OpenEventsSectionProps) {
  return (
    <section id="open-events" className="bg-[#f5f5f7] px-4 py-20 text-[#1d1d1f] sm:px-6 sm:py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#0066cc]">
              {t({ en: "Open registration", zh: "正在报名" })}
            </p>
            <h2 className="mt-4 text-[38px] font-semibold leading-[1.08] sm:text-[56px]">
              {t({ en: "Join the next community ride.", zh: "加入下一场集体活动。" })}
            </h2>
          </div>
          <Link href="/events" className="text-[17px] leading-[1.47] text-[#0066cc]">
            {t({ en: "All events", zh: "全部活动" })}
          </Link>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {eventLoadError ? (
            <StatusTile light>
              {t({
                en: "Event data is not ready yet. Check the Supabase event setup.",
                zh: "活动数据暂时没有加载成功，请稍后再试。",
              })}
            </StatusTile>
          ) : events.length === 0 ? (
            <StatusTile light>
              {allEventCount > 0
                ? t({
                    en: "No events are open for registration right now. You can still browse all events.",
                    zh: "目前没有正在报名的活动，可以先查看全部活动。",
                  })
                : t({ en: "No upcoming events right now. Check back soon.", zh: "暂时没有活动，敬请期待。" })}
            </StatusTile>
          ) : (
            events.map((event) => <EventCard key={event.slug} event={event} lang={lang} t={t} />)
          )}
        </div>
      </div>
    </section>
  );
}

function getRecapTiles(recaps: EventRecap[], t: Translate, locale: string): RecapTile[] {
  return recaps
    .flatMap((recap) => [
      {
        key: `${recap.slug}-cover`,
        src: recap.coverImage,
        title: t(recap.title),
        meta: t(recap.location),
      },
      ...recap.media.map((item, index) => ({
        key: `${recap.slug}-${index}`,
        src: item.url,
        title: t({ en: item.caption?.en ?? "", zh: item.caption?.zh ?? "" }),
        meta: new Date(recap.date).toLocaleDateString(locale),
      })),
    ])
    .slice(0, 8);
}

function StatusTile({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div
      className={`rounded-[8px] border p-6 text-center text-[17px] leading-[1.47] sm:col-span-2 ${
        light ? "border-[#e0e0e0] bg-white text-[#333333]" : "border-white/10 bg-white/10 text-white/70"
      }`}
    >
      {children}
    </div>
  );
}
