"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, MapPin, MessageCircle, Mountain, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { getEventAvailabilitySnapshot } from "@/lib/events/availability";
import {
  answerConciergeQuestion,
  answerConciergeTopic,
  conciergeChipLabel,
  conciergeGreeting,
  requestBriefingSection,
  type ConciergeAnswer,
  type ConciergeTopic,
  type BriefingSection,
} from "@/lib/events/trip-concierge";
import type { Event } from "@/lib/types";

type Turn =
  | { id: number; from: "rider"; text: string }
  | { id: number; from: "desk"; answer: ConciergeAnswer };

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]";

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/**
 * A pre-registration conversation for one trip. Riders ask the questions they
 * would otherwise post in the WeChat group; every answer is built from the
 * organizer's published fields and points back to where it is on the page.
 */
export function TripConcierge({ event }: { event: Event }) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const nextId = useRef(1);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreFocus = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const destination = useRef<BriefingSection | "registration" | null>(null);
  const titleId = useId();
  const inputId = useId();
  const registrationOpen = getEventAvailabilitySnapshot(event).open;

  // Re-greet in the rider's current language whenever the conversation is empty.
  const conversation: Turn[] = turns.length ? turns : [{ id: 0, from: "desk", answer: conciergeGreeting(event, lang) }];
  const lastDesk = [...conversation].reverse().find((turn): turn is Extract<Turn, { from: "desk" }> => turn.from === "desk");
  const asked = new Set(conversation.flatMap((turn) => (turn.from === "desk" && turn.answer.topic !== "unknown" ? [turn.answer.topic] : [])));
  const suggestions = (lastDesk?.answer.followUps ?? []).filter((topic) => !asked.has(topic));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsMobile(!media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!open) {
      const target = destination.current;
      destination.current = null;
      if (target === "registration") {
        const registration = document.getElementById("event-registration");
        registration?.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        (registration ?? launcher.current)?.focus({ preventScroll: true });
      } else if (target) requestBriefingSection(target);
      else if (restoreFocus.current) launcher.current?.focus();
      restoreFocus.current = false;
      return;
    }
    input.current?.focus();
    const previousOverflow = document.body.style.overflow;
    const background = isMobile ? Array.from(document.body.children).filter((node) => node !== panel.current).map((node) => ({ node, inert: node.hasAttribute("inert") })) : [];
    if (isMobile) {
      document.body.style.overflow = "hidden";
      background.forEach(({ node }) => node.setAttribute("inert", ""));
    }
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape" && !keyEvent.defaultPrevented && (isMobile || panel.current?.contains(document.activeElement))) { keyEvent.preventDefault(); close(); }
      if (keyEvent.key !== "Tab" || !isMobile || !panel.current) return;
      const controls = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((node) => !node.closest("[hidden]"));
      const first = controls[0], last = controls.at(-1);
      if (keyEvent.shiftKey && document.activeElement === first) { keyEvent.preventDefault(); last?.focus(); }
      else if (!keyEvent.shiftKey && document.activeElement === last) { keyEvent.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (isMobile) document.body.style.overflow = previousOverflow;
      background.forEach(({ node, inert }) => { if (!inert) node.removeAttribute("inert"); });
    };
  }, [open, isMobile]);

  useEffect(() => {
    const node = thread.current;
    if (node && typeof node.scrollTo === "function") {
      node.scrollTo({ top: node.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [turns, thinking, open]);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  function close() {
    restoreFocus.current = true;
    setOpen(false);
  }

  function respond(riderText: string, answer: ConciergeAnswer) {
    const riderTurn: Turn = { id: nextId.current++, from: "rider", text: riderText };
    const deskTurn: Turn = { id: nextId.current++, from: "desk", answer };
    const greeting: Turn[] = turns.length ? [] : [{ id: 0, from: "desk", answer: conciergeGreeting(event, lang) }];
    if (pending.current) clearTimeout(pending.current);
    if (prefersReducedMotion()) {
      setTurns((current) => [...(current.length ? current : greeting), riderTurn, deskTurn]);
      return;
    }
    setTurns((current) => [...(current.length ? current : greeting), riderTurn]);
    setThinking(true);
    pending.current = setTimeout(() => {
      setThinking(false);
      setTurns((current) => [...current, deskTurn]);
    }, 420);
  }

  function askTopic(topic: ConciergeTopic) {
    respond(conciergeChipLabel(topic, lang), answerConciergeTopic(event, topic, lang));
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    const question = draft.trim();
    if (!question || thinking) return;
    setDraft("");
    respond(question, answerConciergeQuestion(event, question, lang));
  }

  function goToSource(answer: ConciergeAnswer) {
    if (!answer.source) return;
    if (answer.source.section === "registration") {
      goToRegistration();
      return;
    }
    if (isMobile) {
      destination.current = answer.source.section;
      setOpen(false);
    } else requestBriefingSection(answer.source.section);
  }

  function goToRegistration() {
    destination.current = "registration";
    setOpen(false);
  }

  return (
    <>
      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls={`${titleId}-panel`}
        onClick={() => setOpen(true)}
        className={`fixed bottom-4 right-4 z-40 inline-flex min-h-12 max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full bg-[#1d1d1f] py-2 pl-2 pr-5 text-left text-white shadow-[0_8px_30px_rgba(0,0,0,0.28)] transition active:scale-95 motion-reduce:transition-none sm:bottom-6 sm:right-6 ${open ? "hidden" : ""} ${focusRing}`}
      >
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0066cc]">
          <MessageCircle size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold leading-tight">
            {t({ en: "Questions before you join?", zh: "报名前有疑问？" })}
          </span>
          <span className="block truncate text-[12px] leading-tight text-white/70">
            {t({ en: "Ask the trip desk", zh: "问问行程助手" })}
          </span>
        </span>
      </button>

      {open && createPortal(
        <section
          ref={panel}
          id={`${titleId}-panel`}
          role="dialog"
          aria-modal={isMobile}
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex flex-col bg-[#f5f5f7] text-[#1d1d1f] lg:inset-auto lg:bottom-6 lg:right-6 lg:h-[min(680px,calc(100svh-8rem))] lg:w-[400px] lg:overflow-hidden lg:rounded-[18px] lg:border lg:border-[#e0e0e0] lg:shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
        >
          <header className="flex items-start gap-3 bg-[#252527] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
            <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0066cc]">
              <Mountain size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[17px] font-semibold leading-tight">
                {t({ en: "SnowForce trip desk", zh: "SnowForce 行程助手" })}
              </h2>
              <p className="mt-1 truncate text-[12px] text-white/70">
                {t({ en: "Answers from this trip's published details", zh: "答案均来自本活动公开信息" })}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t({ en: "Close trip desk", zh: "关闭行程助手" })}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white ${focusRing}`}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          <div
            ref={thread}
            role="log"
            aria-live="polite"
            aria-label={t({ en: "Conversation", zh: "对话" })}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 [overflow-wrap:anywhere]"
          >
            {conversation.map((turn) =>
              turn.from === "rider" ? (
                <p key={turn.id} className="ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-[6px] bg-[#0066cc] px-4 py-2.5 text-[15px] leading-snug text-white">
                  <span className="sr-only">{t({ en: "You: ", zh: "你：" })}</span>
                  {turn.text}
                </p>
              ) : (
                <DeskMessage key={turn.id} answer={turn.answer} onSource={goToSource} />
              ),
            )}
            {thinking && (
              <p className="flex w-fit items-center gap-1 rounded-[18px] rounded-bl-[6px] border border-[#e0e0e0] bg-white px-4 py-3" aria-label={t({ en: "Trip desk is typing", zh: "行程助手正在输入" })}>
                {[0, 1, 2].map((dot) => (
                  <span key={dot} aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7a7a7a]" style={{ animationDelay: `${dot * 150}ms` }} />
                ))}
              </p>
            )}
          </div>

          <div className="border-t border-[#e0e0e0] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {suggestions.length > 0 && (
              <div role="group" aria-label={t({ en: "Suggested questions", zh: "推荐问题" })} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
                {suggestions.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    disabled={thinking}
                    onClick={() => askTopic(topic)}
                    className={`shrink-0 rounded-full border border-[#d2d2d7] bg-white px-3.5 py-2 text-[14px] text-[#0555a1] hover:border-[#0066cc] hover:bg-[#f0f7ff] disabled:opacity-50 ${focusRing}`}
                  >
                    {conciergeChipLabel(topic, lang)}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="flex items-center gap-2">
              <label htmlFor={inputId} className="sr-only">
                {t({ en: "Ask about this trip", zh: "询问这场活动" })}
              </label>
              <input
                ref={input}
                id={inputId}
                value={draft}
                onChange={(changeEvent) => setDraft(changeEvent.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder={t({ en: "Ask about cost, gear, meet time…", zh: "问问费用、装备、集合时间…" })}
                className={`min-h-11 min-w-0 flex-1 rounded-full border border-[#d2d2d7] bg-[#f5f5f7] px-4 text-[16px] ${focusRing}`}
              />
              <button
                type="submit"
                disabled={!draft.trim() || thinking}
                aria-label={t({ en: "Send question", zh: "发送问题" })}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc] text-white disabled:bg-[#d2d2d7] ${focusRing}`}
              >
                <ArrowUp size={20} aria-hidden="true" />
              </button>
            </form>
            {registrationOpen && (
              <button
                type="button"
                onClick={goToRegistration}
                className={`mt-3 w-full rounded-full border border-[#0066cc] px-5 py-2.5 text-[15px] font-semibold text-[#0066cc] hover:bg-[#f0f7ff] ${focusRing}`}
              >
                {t({ en: "I'm ready — take me to registration", zh: "准备好了，去报名" })}
              </button>
            )}
          </div>
        </section>, document.body
      )}
    </>
  );
}

function DeskMessage({ answer, onSource }: { answer: ConciergeAnswer; onSource: (answer: ConciergeAnswer) => void }) {
  const { t } = useLanguage();
  return (
    <div className="max-w-[92%] space-y-2">
      {answer.lines.map((line, index) => (
        <p key={index} className="w-fit whitespace-pre-line rounded-[18px] rounded-bl-[6px] border border-[#e0e0e0] bg-white px-4 py-2.5 text-[15px] leading-snug">
          {line}
        </p>
      ))}
      {answer.facts.length > 0 && (
        <ul className="divide-y divide-[#e0e0e0] overflow-hidden rounded-[14px] border border-[#e0e0e0] bg-white text-[14px] leading-snug">
          {answer.facts.map((fact, index) => (
            <li key={index} className="px-4 py-2.5">
              {fact}
            </li>
          ))}
        </ul>
      )}
      {answer.footnote && (
        <p className="w-fit rounded-[18px] rounded-bl-[6px] border border-[#e0e0e0] bg-white px-4 py-2.5 text-[15px] leading-snug">
          {answer.footnote}
        </p>
      )}
      {(answer.source || answer.mapUrl || answer.email) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1 text-[13px]">
          {answer.source && (
            <button type="button" onClick={() => onSource(answer)} className={`min-h-8 text-[#0066cc] underline-offset-2 hover:underline ${focusRing}`}>
              {answer.source.section === "registration"
                ? t({ en: "Go to registration", zh: "前往报名" })
                : t({ en: `Check it in: ${answer.source.label}`, zh: `在页面中查看：${answer.source.label}` })}
            </button>
          )}
          {answer.mapUrl && (
            <a href={answer.mapUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-8 items-center gap-1 text-[#0066cc] underline-offset-2 hover:underline ${focusRing}`}>
              <MapPin size={14} aria-hidden="true" />
              {t({ en: "Open map", zh: "打开地图" })}
            </a>
          )}
          {answer.email && (
            <a href={`mailto:${answer.email}`} className={`min-h-8 text-[#0066cc] underline-offset-2 hover:underline ${focusRing}`}>
              {answer.email}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
