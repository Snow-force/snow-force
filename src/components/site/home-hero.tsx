"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Pause, Play } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { mountainVideoPosition } from "@/lib/home/video-framing";

export function HomeHero() {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  function updateFraming() {
    const video = videoRef.current;
    if (!video) return;
    // Native media events, not scroll or a second animation clock. No React
    // render, network call or image analysis is needed to follow this footage.
    video.style.setProperty("--sf-mobile-video-position", mountainVideoPosition(video.currentTime, video.clientWidth, video.clientHeight));
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Visibility only pauses playback; returning or scrolling never downloads/starts it.
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => !entry.isIntersecting)) video.pause();
    }, { threshold: 0 });
    observer?.observe(video);
    const onVisibility = () => { if (document.hidden) video.pause(); };
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => { if (reducedMotion?.matches) video.pause(); };
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion?.addEventListener("change", onMotionChange);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion?.removeEventListener("change", onMotionChange);
      video.pause();
    };
  }, []);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) { video.pause(); return; }
    setFailed(false);
    if (!video.getAttribute("src")) video.src = "/videos/snowmountain.mp4";
    video.muted = true;
    try { await video.play(); } catch { setIsPlaying(false); setFailed(true); }
  }

  return <section className="sf-hero" aria-labelledby="home-title" data-playing={isPlaying}>
    <video ref={videoRef} className="sf-hero-video" poster="/videos/snowmountain-poster.jpg" muted loop playsInline preload="none"
      onTimeUpdate={updateFraming} onSeeked={updateFraming} onLoadedMetadata={updateFraming}
      onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onError={() => { setIsPlaying(false); setFailed(true); }}
      aria-label={t({ en: "SnowForce mountain video", zh: "SnowForce 雪山视频" })} />
    <div className="sf-hero-shade" aria-hidden="true" />
    <div className="sf-hero-copy sf-home-width">
      <p className="sf-eyebrow text-white/75">SNOWFORCE / MOUNTAIN COLLECTIVE</p>
      <h1 id="home-title">{t({ en: "See you up there.", zh: "山上见。" })}</h1>
      <p className="sf-hero-description">{t({ en: "Find your people. Share the ride. Make the next mountain day happen together.", zh: "在这里遇见同好，参与活动。让下一次雪日，更容易一起出发。" })}</p>
      <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
        <Link prefetch={false} href="#next-departures" className="sf-action">{t({ en: "View open events", zh: "查看正在报名" })}<ArrowUpRight size={19} aria-hidden="true" /></Link>
        <Link prefetch={false} href="#how-we-ride" className="sf-hero-secondary">{t({ en: "See how it works", zh: "看看怎么玩" })}</Link>
      </div>
    </div>
    <div className="sf-hero-wordmark sf-home-width" aria-hidden="true"><span>SNOW</span><span>FORCE</span></div>
    <div className="sf-hero-bottom sf-home-width">
      <a href="#next-departures" className="sf-scroll-link"><ArrowDown size={16} aria-hidden="true" /><span>{t({ en: "THE NEXT CHAPTER", zh: "向下，开启下一程" })}</span></a>
      <div className="flex max-w-[65%] items-center justify-end gap-3">
        {failed && <p role="status" className="max-w-64 text-right text-xs leading-5 text-white">{t({ en: "Video unavailable. You can still explore the trips below.", zh: "视频暂不可用，你仍可浏览下方活动。" })}</p>}
        <button type="button" onClick={togglePlayback} aria-pressed={isPlaying} aria-label={isPlaying ? t({ en: "Pause mountain video", zh: "暂停雪山视频" }) : t({ en: "Play mountain video", zh: "播放雪山视频" })} className="sf-video-control">
          {isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  </section>;
}
