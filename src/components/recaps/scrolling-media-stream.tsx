"use client";

import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { localizedText } from "@/lib/i18n/fallback";
import { useLanguage } from "@/lib/language";
import type { RecapMediaItem } from "@/lib/types";
import { SafeRecapImage } from "./safe-recap-image";

type ScrollingMediaStreamProps = {
  media: RecapMediaItem[];
};

const IMAGE_FALLBACK = "/team/group.jpg";
const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3] as const;
const ZOOM_INDEX_DEFAULT = 0;
const ROTATION_STEP_DEG = 90;

const LIGHTBOX_CONTROL =
  "flex items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition hover:border-white/40 hover:bg-black " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/[0.85] disabled:cursor-not-allowed disabled:opacity-35";

const GALLERY_CONTROL =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2997ff] focus-visible:ring-offset-4 focus-visible:ring-offset-[#111214]";

export function ScrollingMediaStream({ media }: ScrollingMediaStreamProps) {
  const { lang, t } = useLanguage();
  const orderedMedia = useMemo(() => [...media].sort((a, b) => a.order - b.order), [media]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [visibleCount, setVisibleCount] = useState(6);
  const [zoomIndex, setZoomIndex] = useState(ZOOM_INDEX_DEFAULT);
  const [rotation, setRotation] = useState(0);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const open = lightboxIndex >= 0;

  const captionOf = useCallback(
    (item: RecapMediaItem) =>
      localizedText({ en: item.caption?.en ?? "", zh: item.caption?.zh ?? "" }, lang),
    [lang],
  );

  const photoLabel = useCallback(
    (item: RecapMediaItem, index: number) =>
      captionOf(item) || t({ en: `Photo ${index + 1}`, zh: `第 ${index + 1} 张照片` }),
    [captionOf, t],
  );

  const openLightbox = useCallback((index: number, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setZoomIndex(ZOOM_INDEX_DEFAULT);
    setRotation(0);
    setLightboxIndex(index);
  }, []);

  const close = useCallback(() => {
    setLightboxIndex(-1);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }, []);

  const advanceSlide = useCallback(
    (delta: number) => {
      setZoomIndex(ZOOM_INDEX_DEFAULT);
      setRotation(0);
      setLightboxIndex((current) =>
        current < 0 ? current : (current + delta + orderedMedia.length) % orderedMedia.length,
      );
    },
    [orderedMedia.length],
  );

  const zoomIn = useCallback(() => setZoomIndex((index) => Math.min(index + 1, ZOOM_STEPS.length - 1)), []);
  const zoomOut = useCallback(() => setZoomIndex((index) => Math.max(index - 1, 0)), []);
  const resetZoomAndRotation = useCallback(() => {
    setZoomIndex(ZOOM_INDEX_DEFAULT);
    setRotation(0);
  }, []);
  const rotate = useCallback(() => setRotation((value) => (value + ROTATION_STEP_DEG) % 360), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          close();
          break;
        case "ArrowRight":
          event.preventDefault();
          advanceSlide(1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          advanceSlide(-1);
          break;
        case "+":
        case "=":
          event.preventDefault();
          zoomIn();
          break;
        case "-":
        case "_":
          event.preventDefault();
          zoomOut();
          break;
        case "0":
          event.preventDefault();
          resetZoomAndRotation();
          break;
        case "r":
        case "R":
          event.preventDefault();
          rotate();
          break;
        case "Tab": {
          const controls = Array.from(
            document.querySelectorAll<HTMLButtonElement>("[data-lightbox-control='true']:not(:disabled)"),
          );
          if (controls.length === 0) break;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, advanceSlide, zoomIn, zoomOut, resetZoomAndRotation, rotate]);

  if (orderedMedia.length === 0) return null;

  const zoom = ZOOM_STEPS[zoomIndex];
  const activeItem = open ? orderedMedia[lightboxIndex] : undefined;

  return (
    <>
      <ul className="grid gap-5 pt-8 sm:grid-cols-2 lg:grid-cols-3" aria-label={t({ en: "Event photos", zh: "活动照片" })}>
        {orderedMedia.slice(0, visibleCount).map((item, index) => {
          const label = photoLabel(item, index);
          return <li key={item.id}><button type="button" onClick={(event) => openLightbox(index, event.currentTarget)} className={`block w-full text-left ${GALLERY_CONTROL}`} aria-label={t({ en: `Open ${label}`, zh: `打开${label}` })}>
            <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-[#1d2025]"><SafeRecapImage src={item.url} alt={label} fallbackSrc={IMAGE_FALLBACK} fallbackLabel={t({ en: "Archive fallback", zh: "影像替代图" })} unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" /></span>
            <span className="mt-3 flex justify-between gap-3 text-xs leading-6 text-white/70"><span>{label}</span><span className="shrink-0 tabular-nums">{pad(index + 1)} / {pad(orderedMedia.length)}</span></span>
          </button></li>;
        })}
      </ul>
      {visibleCount < orderedMedia.length && <button type="button" onClick={() => setVisibleCount((count) => count + 6)} className={`mt-8 min-h-11 rounded border border-white/30 px-5 py-3 text-sm font-medium text-white ${GALLERY_CONTROL}`}>
        {t({ en: "Show more photos", zh: "查看更多照片" })} · {Math.min(visibleCount, orderedMedia.length)} / {orderedMedia.length}
      </button>}

      {activeItem ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/[0.94] px-3 py-16 sm:px-16"
          role="dialog"
          aria-modal="true"
          aria-label={t({ en: "Photo preview", zh: "照片预览" })}
          onClick={close}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label={t({ en: "Close", zh: "关闭" })}
            data-lightbox-control="true"
            className={`absolute right-4 top-4 h-11 w-11 ${LIGHTBOX_CONTROL}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              advanceSlide(-1);
            }}
            aria-label={t({ en: "Previous photo", zh: "上一张照片" })}
            data-lightbox-control="true"
            className={`absolute left-2 h-12 w-12 sm:left-5 ${LIGHTBOX_CONTROL}`}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>

          <figure
            className="flex h-[76vh] w-[calc(100vw-6rem)] max-w-[1320px] flex-col items-center justify-center sm:w-[calc(100vw-12rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="relative h-[calc(76vh-3.5rem)] w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "center center" }}
            >
              <SafeRecapImage
                key={activeItem.id}
                src={activeItem.url}
                alt={photoLabel(activeItem, lightboxIndex)}
                fallbackSrc={IMAGE_FALLBACK}
                fallbackAlt={t({ en: "SnowForce community photo", zh: "SnowForce 社群照片" })}
                fallbackLabel={t({ en: "Archive fallback", zh: "影像替代图" })}
                unavailableLabel={t({ en: "Photo unavailable", zh: "照片暂时无法显示" })}
                sizes="90vw"
                priority
                imageClassName="object-contain"
              />
            </div>
            <figcaption className="mt-3 max-w-3xl text-center text-[13px] leading-5 text-white/70">
              {photoLabel(activeItem, lightboxIndex)}
            </figcaption>
          </figure>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              advanceSlide(1);
            }}
            aria-label={t({ en: "Next photo", zh: "下一张照片" })}
            data-lightbox-control="true"
            className={`absolute right-2 h-12 w-12 sm:right-5 ${LIGHTBOX_CONTROL}`}
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>

          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black px-2 py-1.5"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoomIndex === 0}
              aria-label={t({ en: "Zoom out", zh: "缩小" })}
              data-lightbox-control="true"
              className={`h-9 w-9 ${LIGHTBOX_CONTROL}`}
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="w-12 text-center text-[11px] tabular-nums text-white/70" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label={t({ en: "Zoom in", zh: "放大" })}
              data-lightbox-control="true"
              className={`h-9 w-9 ${LIGHTBOX_CONTROL}`}
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetZoomAndRotation}
              aria-label={t({ en: "Reset zoom and rotation", zh: "重置缩放与旋转" })}
              data-lightbox-control="true"
              className={`h-9 w-9 ${LIGHTBOX_CONTROL}`}
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={rotate}
              aria-label={t({ en: "Rotate 90 degrees", zh: "旋转 90 度" })}
              data-lightbox-control="true"
              className={`h-9 w-9 ${LIGHTBOX_CONTROL}`}
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="pointer-events-none absolute bottom-5 right-4 text-[11px] tabular-nums text-white/50 sm:right-6" aria-live="polite">
            {lightboxIndex + 1} / {orderedMedia.length}
          </p>

          <p className="pointer-events-none absolute left-5 top-5 hidden text-[11px] text-white/40 sm:block">
            {t({
              en: "Arrow keys navigate · +/- zoom · R rotate · Esc close",
              zh: "方向键切换 · +/- 缩放 · R 旋转 · Esc 关闭",
            })}
          </p>
        </div>
      ) : null}
    </>
  );
}
function pad(value: number): string {
  return String(value).padStart(2, "0");
}
