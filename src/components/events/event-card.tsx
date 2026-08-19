"use client";

import Image from "next/image";
import Link from "next/link";
import { getEventAvailabilitySnapshot } from "@/lib/events/availability";
import type { Lang } from "@/lib/language";
import type { Bilingual, Event } from "@/lib/types";

type EventCardProps = {
  event: Event;
  lang: Lang;
  t: <T>(value: Bilingual<T>) => T;
  featured?: boolean;
};

export function EventCard({ event, lang, t, featured = false }: EventCardProps) {
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const availability = getEventAvailabilitySnapshot(event);
  const effectiveRegistrationState = availability.open
    ? "open"
    : event.registrationState === "full" || (event.registrationState === "open" && availability.remaining === 0)
      ? "full"
      : "closed";
  const state = getRegistrationState(effectiveRegistrationState, t);
  const intro = event.detailModules.find((moduleItem) => moduleItem.type === "intro") ?? event.detailModules[0];
  const summary = intro ? localizedText(intro.content, lang) : "";
  const tags = event.detailModules
    .map((moduleItem) => localizedText(moduleItem.title, lang))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Link
      href={`/events/${event.slug}`}
      className={`group block overflow-hidden rounded-[18px] border bg-white text-left text-[#1d1d1f] transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] ${
        featured ? "border-white/15" : "border-[#e0e0e0]"
      }`}
    >
      <ActivityVisual title={t(event.title)} stateLabel={state.label} stateTone={state.tone} coverImage={event.coverImage} />

      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#e0e0e0] px-3 py-1 text-[12px] leading-none tracking-[-0.12px] text-[#333333]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="mt-5 text-[24px] font-semibold leading-[1.18] tracking-[-0.28px] group-hover:text-[#0066cc]">
              {t(event.title)}
            </h3>
            <p className="mt-2 line-clamp-2 text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">
              {summary}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] leading-none tracking-[-0.12px] ${state.className}`}>
            {state.label}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-3 gap-y-2 text-[14px] leading-[1.43] tracking-[-0.224px] text-[#7a7a7a]">
          <span>{localizedText(event.activityLocation, lang)}</span>
          <span>{event.eventDate ? new Date(`${event.eventDate}T00:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric" }) : ""}</span>
          <span>{event.meetTime}</span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-[12px] leading-none tracking-[-0.12px] text-[#7a7a7a]">
            <span>{t({ en: "Spots left", zh: "剩余名额" })}</span>
            <span>
              {availability.remaining === undefined ? t({ en: "Unlimited", zh: "不限名额" }) : `${availability.remaining}/${event.capacity}`}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f5f5f7]">
            <div
              className={`h-full rounded-full ${state.progressClassName}`}
              style={{ width: `${availability.percentFull}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function localizedText(value: Bilingual, lang: Lang) {
  return lang === "en" ? value.en || value.zh : value.zh || value.en;
}

function ActivityVisual({
  title,
  stateLabel,
  stateTone,
  coverImage,
}: {
  title: string;
  stateLabel: string;
  stateTone: "open" | "full" | "closed";
  coverImage: string;
}) {
  const accent = stateTone === "open" ? "bg-[#0066cc]" : stateTone === "full" ? "bg-amber-500" : "bg-[#7a7a7a]";

  return (
    <div className="relative h-44 overflow-hidden bg-[#eef5fb]">
      {coverImage ? (
        <>
          <Image
            src={coverImage}
            alt={title}
            fill
            sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1023px) 50vw, 544px"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(145deg,#f8fbff_0%,#d9ecfb_50%,#b9d8ef_100%)]" />
          <div className="absolute -left-10 top-20 h-40 w-[120%] -rotate-6 rounded-[50%] bg-white/90" />
          <div className="absolute -right-10 top-28 h-32 w-[90%] -rotate-6 rounded-[50%] bg-[#dfeaf2]" />
          <div className="absolute left-[12%] top-[24%] h-16 w-16 rotate-45 rounded-[18px] bg-[#1d1d1f]" />
          <div className="absolute left-[22%] top-[32%] h-12 w-12 rotate-45 rounded-[14px] bg-white" />
          <div className="absolute right-[13%] top-[24%] h-20 w-20 rotate-45 rounded-[20px] bg-white/85" />
        </>
      )}
      <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-[12px] font-semibold uppercase leading-none tracking-[0.12em] ${coverImage ? "text-white/75" : "text-[#0066cc]"}`}>
            SnowForce
          </p>
          <p className={`mt-2 line-clamp-1 text-[21px] font-semibold leading-none tracking-[0.231px] ${coverImage ? "text-white" : "text-[#1d1d1f]"}`}>
            {title}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] leading-none text-white ${accent}`}>
          {stateLabel}
        </span>
      </div>
    </div>
  );
}

function getRegistrationState(state: Event["registrationState"], t: <T>(value: Bilingual<T>) => T) {
  if (state === "open") {
    return {
      label: t({ en: "Open", zh: "报名中" }),
      tone: "open" as const,
      className: "bg-[#e0effe] text-[#0555a1]",
      progressClassName: "bg-[#0066cc]",
    };
  }

  if (state === "full") {
    return {
      label: t({ en: "Full", zh: "已满" }),
      tone: "full" as const,
      className: "bg-amber-50 text-amber-700",
      progressClassName: "bg-amber-500",
    };
  }

  return {
    label: t({ en: "Closed", zh: "已关闭" }),
    tone: "closed" as const,
    className: "bg-[#f5f5f7] text-[#333333]",
    progressClassName: "bg-[#7a7a7a]",
  };
}
