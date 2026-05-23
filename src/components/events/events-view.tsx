"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { EventCard } from "@/components/events/event-card";
import type { Event } from "@/lib/types";

export function EventsView({
  events,
  loadError = false,
}: {
  events: Event[];
  loadError?: boolean;
}) {
  const { lang, t } = useLanguage();
  return (
    <div className="bg-white px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[980px]">
        <div className="max-w-2xl">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.28px] text-[#1d1d1f] sm:text-[48px]">
            {t({ en: "Current Events", zh: "当前活动" })}
          </h1>
          <p className="mt-3 text-[21px] font-normal leading-[1.3] tracking-[0.231px] text-[#333333]">
            {t({
              en: "Discover and register for upcoming SnowForce events.",
              zh: "发现并报名即将举办的 SnowForce 活动。",
            })}
          </p>
        </div>

        {loadError ? (
          <EmptyPanel>
            {t({
              en: "Event data is not ready yet. Check the Supabase event setup.",
              zh: "活动数据尚未就绪，请检查 Supabase 活动配置。",
            })}
          </EmptyPanel>
        ) : events.length === 0 ? (
          <EmptyPanel>
            <span>{t({ en: "No upcoming events right now. Check back soon.", zh: "暂无活动，敬请期待。" })}</span>
            <Link
              href="/recaps"
              className="mt-4 inline-block text-[17px] leading-[1.47] tracking-[-0.374px] text-[#0066cc]"
            >
              {t({ en: "Browse past recaps", zh: "浏览往期回顾" })}
            </Link>
          </EmptyPanel>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <EventCard key={event.slug} event={event} lang={lang} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-20 rounded-[18px] border border-[#e0e0e0] bg-[#f5f5f7] px-6 py-10 text-center text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">
      {children}
    </div>
  );
}
