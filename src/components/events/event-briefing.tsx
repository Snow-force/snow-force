"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardList,
  MapPin,
  Mountain,
  Wallet,
} from "lucide-react";
import { useLanguage } from "@/lib/language";
import { briefingSectionEvent, type BriefingSection } from "@/lib/events/trip-concierge";
import type { Bilingual, Event, EventDetailModule } from "@/lib/types";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0071e3]";

/** Published organizer content, arranged around the rider's next decision. */
export function EventBriefing({
  event,
  formattedDate,
  open,
}: {
  event: Event;
  formattedDate: string;
  open: boolean;
}) {
  const { lang, t } = useLanguage();
  const [section, setSection] = useState("plan");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // The trip desk asks the briefing to open the section that backs its answer.
    const onRequest = (request: globalThis.Event) => {
      const target = (request as CustomEvent<BriefingSection>).detail;
      if (!["plan", "prepare", "costs"].includes(target)) return;
      setSection(target);
      const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      heading.current?.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      heading.current?.focus({ preventScroll: true });
    };
    window.addEventListener(briefingSectionEvent, onRequest);
    return () => window.removeEventListener(briefingSectionEvent, onRequest);
  }, []);
  const text = (value: Bilingual) =>
    value[lang] || value[lang === "en" ? "zh" : "en"];
  const list = (value: Bilingual<string[]>) =>
    value[lang].length ? value[lang] : value[lang === "en" ? "zh" : "en"];
  const modules = (types: string[]) =>
    event.detailModules.filter((row) => types.includes(row.type));
  const notes = modules(["notes"]);
  const noteKeys = notes.flatMap((row) =>
    row.displayMode === "list"
      ? list(row.items).map((_, index) => `${row.id}:${index}`)
      : [],
  );
  const count = noteKeys.filter((key) => reviewed.includes(key)).length;
  const pending = t({ en: "To be announced", zh: "待公布" });
  const renderModule = (row: EventDetailModule, checklist = false) => (
    <section key={row.id} className="mt-6">
      <h3 className="text-[21px] font-semibold leading-snug">
        {text(row.title)}
      </h3>
      {row.displayMode === "list" ? (
        <ul className="mt-3 space-y-3">
          {list(row.items).map((item, index) => {
            const key = `${row.id}:${index}`;
            return (
              <li key={key} className="flex gap-3 leading-relaxed">
                {checklist ? (
                  <label
                    className={`flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-[12px] border p-3 ${reviewed.includes(key) ? "border-[#0066cc] bg-[#f0f7ff]" : "border-[#e0e0e0]"}`}
                  >
                    <input
                      type="checkbox"
                      checked={reviewed.includes(key)}
                      onChange={() =>
                        setReviewed((current) =>
                          current.includes(key)
                            ? current.filter((value) => value !== key)
                            : [...current, key],
                        )
                      }
                      className="mt-1 h-5 w-5 shrink-0 accent-[#0066cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
                    />
                    <span>{item}</span>
                  </label>
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#555555]"
                    />
                    <span>{item}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 whitespace-pre-line leading-relaxed text-[#333333]">
          {text(row.content)}
        </p>
      )}
    </section>
  );

  return (
    <section
      aria-labelledby="mountain-briefing-title"
      className="overflow-hidden rounded-[18px] border border-[#e0e0e0]"
    >
      <header className="bg-[#252527] p-6 text-white sm:p-8">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#cccccc]">
          <Mountain size={18} aria-hidden="true" /> SnowForce /{" "}
          {t({ en: "Basecamp", zh: "出发营地" })}
        </p>
        <h2
          ref={heading}
          id="mountain-briefing-title"
          tabIndex={-1}
          className="scroll-mt-28 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2997ff] mt-4 text-[28px] font-semibold leading-tight sm:text-[34px]"
        >
          {t({ en: "Your mountain briefing.", zh: "上山之前，心中有数。" })}
        </h2>
        <p className="mt-3 text-[17px] leading-relaxed text-[#cccccc]">
          {t({
            en: "Know the plan. Check the details. Then join the crew.",
            zh: "看懂行程，确认细节，再和雪友一起出发。",
          })}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/20 pt-5 text-[14px]">
          <span>{formattedDate}</span>
          <span>{text(event.activityLocation) || pending}</span>
        </div>
      </header>
      <div className="bg-white p-5 sm:p-8">
        <div
          role="group"
          aria-label={t({ en: "Briefing sections", zh: "出发须知分类" })}
          className="grid grid-cols-3 gap-1 rounded-[14px] bg-[#f5f5f7] p-1"
        >
          {[
            {
              id: "plan",
              label: { en: "The plan", zh: "行程安排" },
              Icon: MapPin,
            },
            {
              id: "prepare",
              label: { en: "Get ready", zh: "出发准备" },
              Icon: ClipboardList,
            },
            {
              id: "costs",
              label: { en: "Costs & terms", zh: "费用与规则" },
              Icon: Wallet,
            },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={section === id}
              aria-controls={`briefing-${id}`}
              onClick={() => setSection(id)}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-2 text-[12px] font-semibold sm:flex-row sm:gap-2 sm:text-[14px] ${focus} ${section === id ? "bg-[#0066cc] text-white" : "text-[#555555] hover:bg-[#e0e0e0]"}`}
            >
              <Icon size={16} aria-hidden="true" />
              {t(label)}
            </button>
          ))}
        </div>

        <div id="briefing-plan" hidden={section !== "plan"}>
          <ol className="mt-6 space-y-5">
            {[
              {
                number: "01",
                label: { en: "Meet the crew", zh: "与雪友集合" },
                value: event.meetTime || pending,
                detail: text(event.meetLocation) || pending,
              },
              {
                number: "02",
                label: { en: "The mountain / venue", zh: "雪场 / 场地" },
                value: text(event.activityLocation) || pending,
                detail: "",
              },
            ].map((step) => (
              <li key={step.number} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="pt-1 text-[14px] font-semibold text-[#7a7a7a]"
                >
                  {step.number}
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#555555]">
                    {t(step.label)}
                  </p>
                  <p className="mt-1 break-words text-[21px] font-semibold">
                    {step.value}
                  </p>
                  {step.detail && (
                    <p className="mt-1 text-[17px] text-[#555555]">
                      {step.detail}
                    </p>
                  )}
                  {step.number === "02" &&
                    /^https?:\/\//i.test(event.locationUrl) && (
                      <a
                        href={event.locationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`mt-2 inline-flex min-h-11 items-center gap-2 text-[14px] text-[#0066cc] ${focus}`}
                      >
                        {t({ en: "View on map", zh: "查看地图" })}
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    )}
                </div>
              </li>
            ))}
          </ol>
          {modules(["overview", "highlights", "itinerary"]).map((row) => renderModule(row))}
        </div>

        <div id="briefing-prepare" hidden={section !== "prepare"}>
          <h3 className="mt-6 text-[21px] font-semibold">
            {t({
              en: "A little prep. A better ride.",
              zh: "准备充分，滑得尽兴。",
            })}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#555555]">
            {t({
              en: "Review the organizer’s notes below. Your checks last for this page visit and do not complete registration.",
              zh: "逐项确认主办方须知。勾选仅在本次页面访问中保留，不代表已完成报名。",
            })}
          </p>
          {noteKeys.length > 0 && (
            <div className="mt-5">
              <p
                role="status"
                className="flex items-center gap-2 text-[14px] font-semibold text-[#0555a1]"
              >
                {count === noteKeys.length && (
                  <Check size={16} aria-hidden="true" />
                )}
                {t({
                  en: `${count} of ${noteKeys.length} notes reviewed`,
                  zh: `已确认 ${count} / ${noteKeys.length} 项须知`,
                })}
              </p>
              <progress
                aria-label={t({ en: "Notes reviewed", zh: "须知确认进度" })}
                value={count}
                max={noteKeys.length}
                className="mt-2 h-2 w-full appearance-none overflow-hidden rounded-full bg-[#e0e0e0] [&::-webkit-progress-bar]:bg-[#e0e0e0] [&::-webkit-progress-value]:bg-[#0066cc] [&::-moz-progress-bar]:bg-[#0066cc]"
              />
            </div>
          )}
          {notes.length ? (
            notes.map((row) => renderModule(row, true))
          ) : (
            <p className="mt-6 leading-relaxed text-[#555555]">
              {t({
                en: "The organizer hasn’t published preparation notes yet. Check the full event details and confirm any questions before joining.",
                zh: "主办方暂未发布准备须知。报名前请查看活动详情，并确认你的疑问。",
              })}
            </p>
          )}
        </div>

        <div id="briefing-costs" hidden={section !== "costs"}>
          <p className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-[#555555]">
            {t({ en: "Listed activity fee", zh: "活动标价" })}
          </p>
          <p className="mt-2 break-words text-[28px] font-semibold">
            {event.feeAmount || pending}
          </p>
          <p className="mt-3 whitespace-pre-line text-[17px] leading-relaxed text-[#333333]">
            {text(event.paymentInstructions) ||
              t({
                en: "Payment details have not been published. Confirm what is included with the organizer before joining.",
                zh: "付款详情暂未公布。报名前请向主办方确认费用包含项目。",
              })}
          </p>
          {modules(["fees", "refund"]).map((row) => renderModule(row))}
          {!modules(["refund"]).length && (
            <p className="mt-5 text-[14px] leading-relaxed text-[#555555]">
              {t({
                en: "Cancellation and refund terms have not been published here. Confirm them with the organizer before paying.",
                zh: "此处暂未公布取消和退款规则，请在付款前向主办方确认。",
              })}
            </p>
          )}
        </div>
        <footer className="mt-7 border-t border-[#e0e0e0] pt-5">
          <a
            href="#event-registration"
            className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-5 py-3 text-[14px] font-semibold text-white ${focus}`}
          >
            {t(
              open
                ? { en: "Ready? Join this ride", zh: "准备好了？报名出发" }
                : { en: "View registration status", zh: "查看报名状态" },
            )}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <p className="mt-3 text-[12px] leading-relaxed text-[#555555]">
            {t({
              en: "This briefing is a planning aid. Your place is confirmed through registration.",
              zh: "出发须知仅用于行程准备，名额以报名确认为准。",
            })}
          </p>
        </footer>
      </div>
    </section>
  );
}
