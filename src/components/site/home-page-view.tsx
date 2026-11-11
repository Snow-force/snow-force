"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { RecapHighlights } from "@/components/recaps/recap-highlights";
import { HomeShopSection } from "./home-shop-section";
import { NextDeparture } from "./next-departure";
import type { StoreProduct } from "@/lib/shop/storefront";
import { useLanguage } from "@/lib/language";
import type { Bilingual, Event, EventRecap } from "@/lib/types";

type Translate = <T>(value: Bilingual<T>) => T;
type HomePageViewProps = { events: Event[]; recaps: EventRecap[]; eventLoadError?: boolean; shopProducts?: StoreProduct[] };

export function HomePageView({ events, recaps, eventLoadError = false, shopProducts = [] }: HomePageViewProps) {
  const { t } = useLanguage();
  return <div className="bg-[#07090c] text-white">
    <HeroSection t={t} />
    <NextDeparture events={events} loadError={eventLoadError} />
    <section id="how-we-ride" className="bg-white px-4 py-16 text-gray-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight">{t({ en: "Your next mountain day, in three steps.", zh: "三步，开启下一次雪山之旅。" })}</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            { title: { en: "Find your ride", zh: "选一场适合的活动" }, body: { en: "Choose a date and a session that fits your level.", zh: "按日期和水平选择活动，先看是否适合自己。" } },
            { title: { en: "Know the plan", zh: "看清安排与费用" }, body: { en: "Check the meeting point, included costs, equipment and cancellation terms.", zh: "核对集合地点、费用包含项、装备要求和取消规则。" } },
            { title: { en: "Join with confidence", zh: "报名，等待确认" }, body: { en: "Register, complete any payment or waiver steps, and check your trip details in your account.", zh: "完成报名及所需付款、豁免确认，在账号中查看行程详情。" } },
          ].map((item, index) => <li key={index} className="border-t border-gray-200 pt-5"><span className="text-sm font-semibold text-snow-700">0{index + 1}</span><h3 className="mt-3 text-lg font-semibold">{t(item.title)}</h3><p className="mt-2 text-sm leading-7 text-gray-600">{t(item.body)}</p></li>)}
        </ol>
      </div>
    </section>
    <RecapHighlights recaps={recaps} />
    {shopProducts.length > 0 && <HomeShopSection products={shopProducts} />}
  </div>;
}

function HeroSection({ t }: { t: Translate }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  async function handlePlaybackClick() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!video.paused) {
      video.pause();
      return;
    }

    if (!video.getAttribute("src")) video.src = "/videos/snowmountain.mp4";
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();
    } catch {
      setIsPlaying(false);
    }
  }

  return (
    <section className="relative flex min-h-[calc(100svh-96px)] items-center justify-center overflow-hidden px-4 py-24 text-center sm:px-6">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        poster="/team/group.jpg"
        muted
        loop
        playsInline
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        aria-label={t({ en: "SnowForce mountain video", zh: "SnowForce 雪山视频" })}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.46)_58%,rgba(7,9,12,0.96))]" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,rgba(7,9,12,0),#07090c)]" />

      <div className="relative z-10 mx-auto w-full min-w-0 max-w-[980px]">
        <button
          type="button"
          aria-label={isPlaying ? t({ en: "Pause mountain video", zh: "暂停雪山视频" }) : t({ en: "Play mountain video", zh: "播放雪山视频" })}
          aria-pressed={isPlaying}
          onClick={handlePlaybackClick}
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-black/[0.45] text-white transition hover:bg-black/[0.65] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-95"
        >
          {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />}
        </button>

        <h1 className="mt-8 text-[50px] font-semibold leading-[0.98] text-white sm:text-[84px] lg:text-[112px]">
          {t({ en: "Ride the mountain together.", zh: "一起去雪山" })}
        </h1>
        <p className="mx-auto mt-6 max-w-[19rem] break-words text-[17px] leading-[1.55] text-white/80 sm:max-w-2xl sm:text-[21px]">
          {t({
            en: "Meet riders through the community, join collective mountain activities, and make the next snow day easier to join.",
            zh: "在社群里找到同行的雪友，报名参加集体活动，把下一次上山变成一件容易发生的事。",
          })}
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="#next-departures" className="btn-primary bg-white text-[#111827] hover:bg-white/90">
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
