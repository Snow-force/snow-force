"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { isEventOpen } from "@/lib/events/availability";
import { RegistrationForm } from "@/components/events/registration-form";
import type { Event } from "@/lib/types";

export function EventDetailView({
  event,
  loadError = false,
}: {
  event: Event | undefined;
  loadError?: boolean;
}) {
  const { lang, t } = useLanguage();
  const locale = lang === "zh" ? "zh-CN" : "en-US";

  if (loadError) {
    return (
      <StatusPage
        title={t({ en: "Event Data Unavailable", zh: "活动数据不可用" })}
        body={t({
          en: "Check the Supabase event setup before viewing activity details.",
          zh: "查看活动详情前，请检查 Supabase 活动配置。",
        })}
      />
    );
  }

  if (!event) {
    return (
      <StatusPage
        title={t({ en: "Event Not Found", zh: "活动未找到" })}
        body={t({
          en: "The event you're looking for doesn't exist or has been removed.",
          zh: "你查找的活动不存在或已被移除。",
        })}
      >
        <Link href="/events" className="mt-5 inline-flex text-[17px] leading-[1.47] tracking-[-0.374px] text-[#0066cc]">
          {t({ en: "Back to Events", zh: "返回活动列表" })}
        </Link>
      </StatusPage>
    );
  }

  const open = isEventOpen(event);
  const eventDate = new Date(event.eventStartAt);
  const eventEndDate = new Date(event.eventEndAt);
  const capacityPercent = Math.min((event.registrationCount / event.capacity) * 100, 100);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-white text-[#1d1d1f]">
      <section className="bg-[#1d1d1f] px-4 py-10 text-white sm:px-6 sm:py-14">
        <div className="mx-auto max-w-[1100px]">
          <nav className="mb-8 text-[14px] leading-none tracking-[-0.224px] text-white/55">
            <Link href="/events" className="hover:text-white">
              {t({ en: "Events", zh: "活动" })}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-white/80">{t(event.title)}</span>
          </nav>

          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] leading-none tracking-[-0.12px] ${
                    open ? "bg-[#e0effe] text-[#0555a1]" : "bg-white/12 text-white"
                  }`}
                >
                  {open ? t({ en: "Registration Open", zh: "报名开放中" }) : t({ en: "Registration Closed", zh: "报名已关闭" })}
                </span>
                {(t(event.tags) as string[]).map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-[12px] leading-none tracking-[-0.12px] text-white/80">
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="mt-5 max-w-3xl text-[40px] font-semibold leading-[1.08] tracking-[-0.28px] sm:text-[56px]">
                {t(event.title)}
              </h1>
              <p className="mt-4 max-w-2xl text-[21px] leading-[1.3] tracking-[0.231px] text-[#cccccc]">
                {t(event.subtitle)}
              </p>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white p-5 text-[#1d1d1f]">
              <p className="text-[12px] font-semibold uppercase leading-none tracking-[0.12em] text-[#0066cc]">
                {t({ en: "Ride snapshot", zh: "活动概览" })}
              </p>
              <div className="mt-4 space-y-4">
                <SnapshotRow label={t({ en: "When", zh: "时间" })} value={dateFormatter.format(eventDate)} />
                <SnapshotRow label={t({ en: "Where", zh: "地点" })} value={t(event.location)} />
                <SnapshotRow label={t({ en: "Level", zh: "水平" })} value={t(event.audienceLevel)} />
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] leading-none tracking-[-0.12px] text-[#7a7a7a]">
                  <span>{t({ en: "Capacity", zh: "名额" })}</span>
                  <span>
                    {event.registrationCount}/{event.capacity}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f5f5f7]">
                  <div className="h-full rounded-full bg-[#0066cc]" style={{ width: `${capacityPercent}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-16">
        <div className="mx-auto grid max-w-[1100px] gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoCard label={t({ en: "Date & Time", zh: "时间" })}>
                <p>{dateFormatter.format(eventDate)}</p>
                <p className="mt-1 text-[#7a7a7a]">
                  {eventDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} -{" "}
                  {eventEndDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                </p>
              </InfoCard>
              <InfoCard label={t({ en: "Location", zh: "地点" })}>
                <p>{t(event.location)}</p>
                <a href={event.locationUrl} target="_blank" rel="noopener" className="mt-1 inline-flex text-[#0066cc]">
                  {t({ en: "View on map", zh: "查看地图" })}
                </a>
              </InfoCard>
              <InfoCard label={t({ en: "Audience Level", zh: "适合人群" })}>
                <p>{t(event.audienceLevel)}</p>
              </InfoCard>
              <InfoCard label={t({ en: "Fee Information", zh: "费用说明" })}>
                <p>{t(event.feeInfo)}</p>
              </InfoCard>
            </div>

            <ContentSection title={t({ en: "About This Event", zh: "活动介绍" })}>
              <div className="whitespace-pre-line">{t(event.description)}</div>
            </ContentSection>

            <ContentSection title={t({ en: "Highlights", zh: "活动亮点" })}>
              <ul className="space-y-3">
                {(t(event.highlights) as string[]).map((highlight) => (
                  <li key={highlight} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0066cc]" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </ContentSection>

            <ContentSection title={t({ en: "Schedule", zh: "活动流程" })}>
              <pre className="whitespace-pre-line rounded-[18px] bg-[#f5f5f7] p-5 font-sans text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">
                {t(event.schedule)}
              </pre>
            </ContentSection>

            <ContentSection title={t({ en: "Important Notices", zh: "注意事项" })}>
              <ul className="space-y-3">
                {(t(event.notices) as string[]).map((notice) => (
                  <li key={notice} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span>{notice}</span>
                  </li>
                ))}
              </ul>
            </ContentSection>
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-28 space-y-6">
              {open ? (
                <RegistrationForm event={event} />
              ) : (
                <div className="card bg-[#f5f5f7] text-center">
                  <p className="text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">
                    {t({ en: "Registration is currently closed for this event.", zh: "此活动当前不接受报名。" })}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function StatusPage({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-20 text-center sm:px-6">
      <h1 className="text-[34px] font-semibold leading-[1.2] tracking-[-0.374px] text-[#1d1d1f]">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-[17px] leading-[1.47] tracking-[-0.374px] text-[#7a7a7a]">{body}</p>
      {children}
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase leading-none tracking-[0.12em] text-[#7a7a7a]">{label}</p>
      <p className="mt-1 text-[17px] font-semibold leading-[1.24] tracking-[-0.374px] text-[#1d1d1f]">{value}</p>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="text-[12px] font-semibold uppercase leading-none tracking-[0.12em] text-[#7a7a7a]">{label}</p>
      <div className="mt-2 text-[17px] font-semibold leading-[1.35] tracking-[-0.374px] text-[#1d1d1f]">{children}</div>
    </div>
  );
}

function ContentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[24px] font-semibold leading-[1.18] tracking-[-0.28px] text-[#1d1d1f]">{title}</h2>
      <div className="mt-4 text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">{children}</div>
    </section>
  );
}
