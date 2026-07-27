"use client";

import { useCallback, useEffect, useState } from "react";

import { localizedText } from "@/lib/i18n/fallback";
import { useLanguage } from "@/lib/language";
import type { RecapMediaItem } from "@/lib/types";

type ScrollingMediaStreamProps = {
  media: RecapMediaItem[];
};

const AUTOPLAY_INTERVAL_MS = 3000;
const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3] as const;
const ZOOM_INDEX_DEFAULT = 0;
const ROTATION_STEP_DEG = 90;

const LIGHTBOX_CONTROL =
  "flex items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80";

const GALLERY_CONTROL =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-snow-500";

export function ScrollingMediaStream({ media }: ScrollingMediaStreamProps) {
  const { lang, t } = useLanguage();
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);
  const [zoomIndex, setZoomIndex] = useState<number>(ZOOM_INDEX_DEFAULT);
  const [rotation, setRotation] = useState<number>(0);
  const [autoplay, setAutoplay] = useState<boolean>(false);
  const open = lightboxIndex >= 0;

  const openLightbox = useCallback((index: number) => {
    setZoomIndex(ZOOM_INDEX_DEFAULT);
    setRotation(0);
    setAutoplay(false);
    setLightboxIndex(index);
  }, []);

  const close = useCallback(() => {
    setLightboxIndex(-1);
    setAutoplay(false);
  }, []);

  const advanceSlide = useCallback(
    (delta: number) => {
      setZoomIndex(ZOOM_INDEX_DEFAULT);
      setRotation(0);
      setLightboxIndex((current) =>
        current < 0 ? current : (current + delta + media.length) % media.length,
      );
    },
    [media.length],
  );

  const zoomIn = useCallback(() => setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1)), []);
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(i - 1, 0)), []);
  const resetZoomAndRotation = useCallback(() => {
    setZoomIndex(ZOOM_INDEX_DEFAULT);
    setRotation(0);
  }, []);
  const rotate = useCallback(() => setRotation((r) => (r + ROTATION_STEP_DEG) % 360), []);
  const toggleAutoplay = useCallback(() => setAutoplay((a) => !a), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case "Escape":
          close();
          break;
        case "ArrowRight":
          advanceSlide(1);
          break;
        case "ArrowLeft":
          advanceSlide(-1);
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
        case "_":
          zoomOut();
          break;
        case "0":
          resetZoomAndRotation();
          break;
        case "r":
        case "R":
          rotate();
          break;
        case "p":
        case "P":
          toggleAutoplay();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close, advanceSlide, zoomIn, zoomOut, resetZoomAndRotation, rotate, toggleAutoplay]);

  useEffect(() => {
    if (!open || !autoplay) return;
    const id = window.setInterval(() => advanceSlide(1), AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [open, autoplay, advanceSlide]);

  if (media.length === 0) return null;

  const zoom = ZOOM_STEPS[zoomIndex];
  const captionOf = (item: RecapMediaItem) =>
    localizedText({ en: item.caption?.en ?? "", zh: item.caption?.zh ?? "" }, lang);

  return (
    <>
      <div className="sm:hidden -mx-4 px-4">
        <div
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 scroll-smooth"
          role="list"
          aria-label={t({ en: "Photo carousel", zh: "照片轮播" })}
        >
          {media.map((item, index) => {
            const caption = captionOf(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openLightbox(index)}
                className={`relative h-64 w-72 shrink-0 snap-center overflow-hidden rounded-xl bg-gray-100 transition hover:opacity-95 ${GALLERY_CONTROL}`}
                role="listitem"
                aria-label={caption || t({ en: `Photo ${index + 1}`, zh: `第 ${index + 1} 张照片` })}
              >
                <img
                  src={item.url}
                  alt={caption || ""}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden gap-3 sm:columns-2 md:columns-3 xl:columns-4 sm:block">
        {media.map((item, index) => {
          const caption = captionOf(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openLightbox(index)}
              className={`mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl bg-gray-100 transition hover:opacity-95 ${GALLERY_CONTROL}`}
              aria-label={caption || t({ en: `Photo ${index + 1}`, zh: `第 ${index + 1} 张照片` })}
            >
              <img
                src={item.url}
                alt={caption || ""}
                loading="lazy"
                decoding="async"
                className="w-full object-cover"
              />
              {caption ? (
                <span className="block px-3 py-2 text-left text-xs text-gray-600">{caption}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label={t({ en: "Photo preview", zh: "照片预览" })}
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label={t({ en: "Close", zh: "关闭" })}
            className={`absolute right-4 top-4 h-10 w-10 text-lg ${LIGHTBOX_CONTROL}`}
          >
            ✕
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              advanceSlide(-1);
            }}
            aria-label={t({ en: "Previous", zh: "上一张" })}
            className={`absolute left-3 h-12 w-12 text-2xl sm:left-6 ${LIGHTBOX_CONTROL}`}
          >
            ‹
          </button>

          <figure
            className="flex max-h-[78vh] max-w-[90vw] flex-col items-center px-12 sm:px-16"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              key={media[lightboxIndex].id}
              src={media[lightboxIndex].url}
              alt={captionOf(media[lightboxIndex]) || ""}
              className="max-h-[70vh] max-w-full rounded-lg object-contain transition-transform duration-300 ease-out"
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "center center" }}
            />
            {media[lightboxIndex].caption?.en || media[lightboxIndex].caption?.zh ? (
              <figcaption className="mt-3 max-w-full text-center text-sm text-white/80">
                {captionOf(media[lightboxIndex])}
              </figcaption>
            ) : null}
          </figure>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              advanceSlide(1);
            }}
            aria-label={t({ en: "Next", zh: "下一张" })}
            className={`absolute right-3 h-12 w-12 text-2xl sm:right-6 ${LIGHTBOX_CONTROL}`}
          >
            ›
          </button>

          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/50 px-2 py-1.5 backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoomIndex === 0}
              aria-label={t({ en: "Zoom out", zh: "缩小" })}
              className={`h-9 w-9 text-lg ${LIGHTBOX_CONTROL} disabled:opacity-40 disabled:hover:bg-white/10`}
            >
              −
            </button>
            <span className="w-12 text-center text-xs tabular-nums text-white/80" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label={t({ en: "Zoom in", zh: "放大" })}
              className={`h-9 w-9 text-lg ${LIGHTBOX_CONTROL} disabled:opacity-40 disabled:hover:bg-white/10`}
            >
              +
            </button>
            <button
              type="button"
              onClick={resetZoomAndRotation}
              aria-label={t({ en: "Reset zoom and rotation", zh: "重置缩放与旋转" })}
              className={`h-9 px-2 text-xs ${LIGHTBOX_CONTROL}`}
            >
              1:1
            </button>
            <button
              type="button"
              onClick={rotate}
              aria-label={t({ en: "Rotate 90°", zh: "旋转 90°" })}
              className={`h-9 w-9 text-base ${LIGHTBOX_CONTROL}`}
            >
              ↺
            </button>
            <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
            <button
              type="button"
              onClick={toggleAutoplay}
              aria-pressed={autoplay}
              aria-label={autoplay ? t({ en: "Pause slideshow", zh: "暂停幻灯片" }) : t({ en: "Play slideshow", zh: "播放幻灯片" })}
              className={`h-9 w-9 text-base ${LIGHTBOX_CONTROL}`}
            >
              {autoplay ? "⏸" : "▶"}
            </button>
          </div>

          <div className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-black/40 px-2.5 py-1 text-xs tabular-nums text-white/70">
            {lightboxIndex + 1} / {media.length}
          </div>

          <div className="pointer-events-none absolute left-4 top-4 hidden max-w-[60vw] truncate text-xs text-white/50 sm:block">
            {t({
              en: "← → navigate · +/- zoom · r rotate · p play · esc close",
              zh: "← → 切换 · +/- 缩放 · r 旋转 · p 播放 · esc 关闭",
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}