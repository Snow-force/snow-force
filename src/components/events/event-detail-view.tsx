"use client";

import { PublicImage as Image } from "@/components/media/public-image";
import Link from "next/link";
import { useLanguage, type Lang } from "@/lib/language";
import { getEventAvailabilitySnapshot } from "@/lib/events/availability";
import { EventBriefing } from "./event-briefing";
import { RegistrationForm } from "@/components/events/registration-form";
import { GroupRegistrationForm } from "./group-registration-form";
import { EventShareBar } from "./event-share-bar";
import { MerchantBoothCta } from "./merchant-booth-cta";
import type { Bilingual, Event, MemberProfile } from "@/lib/types";

function localizedText(value: Bilingual, lang: Lang) {
  return lang === "en" ? value.en || value.zh : value.zh || value.en;
}

function localizedList(value: Bilingual<string[]>, lang: Lang) {
  return lang === "en" ? (value.en.length ? value.en : value.zh) : (value.zh.length ? value.zh : value.en);
}

export function EventDetailView({
  event,
  loadError = false,
  memberProfile = null,
  emailConfirmed = false,
  groupRegistrationEnabled = false,
}: {
  event: Event | undefined;
  loadError?: boolean;
  memberProfile?: MemberProfile | null;
  emailConfirmed?: boolean;
  groupRegistrationEnabled?: boolean;
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

  const availability = getEventAvailabilitySnapshot(event);
  const open = availability.open;
  const eventDate = event.eventDate ? new Date(`${event.eventDate}T00:00:00`) : undefined;
  const eventTitle = localizedText(event.title, lang);
  const activityLocation = localizedText(event.activityLocation, lang);
  const introModule = event.detailModules.find((moduleRow) => moduleRow.type === "intro");
  const heroSummary = introModule ? localizedText(introModule.content, lang) : "";
  const detailModules = event.detailModules.filter((moduleRow) => !["intro", "itinerary", "notes", "fees", "refund"].includes(moduleRow.type));
  const remaining = availability.remaining;

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedDate = eventDate ? dateFormatter.format(eventDate) : t({ en: "TBD", zh: "待定" });

  return (
    <div className="bg-white text-[#1d1d1f]">
      <section className="bg-[#1d1d1f] px-4 py-10 text-white sm:px-6 sm:py-14">
        <div className="mx-auto max-w-[1100px]">
          <nav className="mb-8 text-[14px] leading-none tracking-[-0.224px] text-white/55">
            <Link href="/events" className="hover:text-white">
              {t({ en: "Events", zh: "活动" })}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-white/80">{eventTitle}</span>
          </nav>

          {event.coverImage ? (
            <div className="relative mb-8 aspect-[16/7] overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl shadow-black/25">
              <Image
                src={event.coverImage}
                alt={eventTitle}
                fill
                priority
                sizes="(max-width: 1100px) calc(100vw - 2rem), 1100px"
                className="object-cover"
              />
            </div>
          ) : null}

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
                {event.feeAmount ? (
                  <span className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-[12px] leading-none tracking-[-0.12px] text-white/80">
                    {event.feeAmount}
                  </span>
                ) : null}
                {memberProfile ? (
                  memberProfile.savedEventSlugs.includes(event.slug) ? (
                    <span className="inline-flex items-center rounded-full border border-[#005bea] bg-[#005bea] px-3 py-1 text-[12px] font-semibold leading-none text-white">
                      {t({ en: "Saved", zh: "已收藏" })}
                    </span>
                  ) : null
                ) : null}
                <EventShareBar slug={event.slug} title={eventTitle} />
              </div>
              <h1 className="mt-5 max-w-3xl text-[40px] font-semibold leading-[1.08] tracking-[-0.28px] sm:text-[56px]">
                {eventTitle}
              </h1>
              {heroSummary ? (
                <p className="mt-4 max-w-2xl text-[21px] leading-[1.3] tracking-[0.231px] text-[#cccccc]">
                  {heroSummary}
                </p>
              ) : null}
              <a href="#mountain-briefing-title" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#0066cc] px-5 text-[14px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2997ff]">
                {t({ en: "Open your mountain briefing ↓", zh: "查看出发须知 ↓" })}
              </a>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white p-5 text-[#1d1d1f]">
              <p className="text-[12px] font-semibold uppercase leading-none tracking-[0.12em] text-[#0066cc]">
                {t({ en: "Ride snapshot", zh: "活动概览" })}
              </p>
              <div className="mt-4 space-y-4">
                <SnapshotRow label={t({ en: "When", zh: "时间" })} value={formattedDate} />
                <SnapshotRow label={t({ en: "Meet Time", zh: "集合时间" })} value={event.meetTime || t({ en: "TBD", zh: "待定" })} />
                <SnapshotRow label={t({ en: "Where", zh: "地点" })} value={activityLocation} />
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] leading-none tracking-[-0.12px] text-[#7a7a7a]">
                  <span>{t({ en: "Spots left", zh: "剩余名额" })}</span>
                  <span>
                    {remaining === undefined ? t({ en: "Unlimited", zh: "不限名额" }) : `${remaining}/${event.capacity}`}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f5f5f7]">
                  <div className="h-full rounded-full bg-[#0066cc]" style={{ width: `${availability.percentFull}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-16">
        <div className="mx-auto grid max-w-[1100px] gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <EventBriefing key={event.slug} event={event} formattedDate={formattedDate} open={open} />

            {detailModules.map((moduleRow) => (
              <ContentSection key={moduleRow.id} title={localizedText(moduleRow.title, lang)}>
                {moduleRow.displayMode === "list" ? (
                  <ul className="space-y-3">
                    {localizedList(moduleRow.items, lang).map((item) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0066cc]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="whitespace-pre-line">{localizedText(moduleRow.content, lang)}</div>
                )}
              </ContentSection>
            ))}
          </div>

          <aside id="event-registration" tabIndex={-1} aria-label={t({ en: "Event registration", zh: "活动报名" })} className="scroll-mt-28 lg:col-span-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0071e3]">
            <div className="sticky top-28 space-y-6">
              {open ? (
                groupRegistrationEnabled && memberProfile && emailConfirmed
                  ? <GroupRegistrationForm event={event} profile={memberProfile} />
                  : <RegistrationForm event={event} memberProfile={memberProfile} emailConfirmed={emailConfirmed} />
              ) : (
                <div className="card bg-[#f5f5f7] text-center">
                  <p className="text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">
                    {t({ en: "Registration is currently closed for this event.", zh: "此活动当前不接受报名。" })}
                  </p>
                </div>
              )}
              <MerchantBoothCta event={event} />
              <div className="border-t border-gray-200 pt-4 mt-6">
                <EventShareBar slug={event.slug} title={eventTitle} tone="light" />
              </div>
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

function ContentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[24px] font-semibold leading-[1.18] tracking-[-0.28px] text-[#1d1d1f]">{title}</h2>
      <div className="mt-4 text-[17px] leading-[1.47] tracking-[-0.374px] text-[#333333]">{children}</div>
    </section>
  );
}
