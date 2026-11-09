"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";
import { initialOpsGuideProgress, opsGuides, opsGuideStorageKey, parseOpsGuideProgress, type OpsGuideProgress } from "./admin-ops-guide-content";

const button = "rounded px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow-600";

export function AdminOpsGuide() {
  const { t } = useLanguage();
  const copy = adminCopy.opsGuide;
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<OpsGuideProgress>(initialOpsGuideProgress);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const guide = opsGuides.find((item) => item.id === progress.guideId) ?? opsGuides[0];
  const step = guide.steps[progress.stepIndex];
  const readCount = guide.steps.filter((item) => progress.completed.includes(item.id)).length;
  const finished = readCount === guide.steps.length;
  const canFinish = progress.stepIndex === guide.steps.length - 1 && readCount + (progress.completed.includes(step.id) ? 0 : 1) === guide.steps.length;
  const externalModule = step.href.startsWith("/");

  useEffect(() => {
    if (open) titleRef.current?.focus({ preventScroll: true });
  }, [open, progress.guideId, progress.stepIndex]);

  function toggleGuide() {
    if (!open && !storageUnavailable) {
      try {
        setProgress(parseOpsGuideProgress(sessionStorage.getItem(opsGuideStorageKey)));
      } catch {
        setStorageUnavailable(true);
      }
    }
    setOpen(!open);
  }

  function update(next: OpsGuideProgress) {
    setProgress(next);
    try {
      sessionStorage.setItem(opsGuideStorageKey, JSON.stringify(next));
    } catch {
      setStorageUnavailable(true);
    }
  }

  function advance() {
    const completed = [...new Set([...progress.completed, step.id])];
    const unreadIndex = guide.steps.findIndex((item) => !completed.includes(item.id));
    const nextIndex = progress.stepIndex < guide.steps.length - 1 ? progress.stepIndex + 1 : unreadIndex;
    update({ ...progress, completed, stepIndex: nextIndex < 0 ? progress.stepIndex : nextIndex });
  }

  return (
    <section aria-labelledby="ops-guide-title" className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <h3 id="ops-guide-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900"><BookOpen size={19} aria-hidden="true" />{t(copy.title)}</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">{t(copy.intro)}</p>
        </div>
        <button aria-expanded={open} aria-controls="ops-guide-content" onClick={toggleGuide} className={`${button} border border-snow-600 bg-snow-50 text-snow-700 hover:bg-snow-100`}>{t(open ? copy.close : copy.start)}</button>
      </div>

      {open && <div id="ops-guide-content" className="border-t border-gray-200">
        <div className="p-4 sm:p-5">
          <p id="ops-guide-choose" className="mb-3 text-sm font-medium text-gray-700">{t(copy.choose)}</p>
          <div role="group" aria-labelledby="ops-guide-choose" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {opsGuides.map((item) => <button key={item.id} aria-pressed={guide.id === item.id} onClick={() => update({ ...progress, guideId: item.id, stepIndex: 0 })}
              className={`${button} border text-left ${guide.id === item.id ? "border-snow-600 bg-snow-50 text-snow-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>{t(item.title)}</button>)}
          </div>
          <p className="mt-3 text-sm text-gray-600">{t(guide.description)}</p>
          <div className="mt-4 flex items-center gap-3">
            <div role="progressbar" aria-label={t(copy.progress)} aria-valuemin={0} aria-valuemax={guide.steps.length} aria-valuenow={readCount} className="h-1.5 flex-1 overflow-hidden rounded bg-gray-100">
              <div className="h-full bg-snow-600" style={{ width: `${readCount / guide.steps.length * 100}%` }} />
            </div>
            <span className="text-xs tabular-nums text-gray-600">{t(copy.progress)} {readCount}/{guide.steps.length}</span>
          </div>
        </div>

        <div className="grid border-t border-gray-200 md:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label={t(copy.steps)} className="border-b border-gray-200 p-3 md:border-b-0 md:border-r">
            <ol className="space-y-1">
              {guide.steps.map((item, index) => <li key={item.id}><button aria-current={progress.stepIndex === index ? "step" : undefined}
                onClick={() => update({ ...progress, stepIndex: index })} className={`${button} flex w-full items-start gap-2 text-left ${progress.stepIndex === index ? "bg-snow-50 text-snow-700" : "text-gray-600 hover:bg-gray-50"}`}>
                <span className="mt-0.5 shrink-0 text-xs tabular-nums">{index + 1}.</span><span className="flex-1">{t(item.title)}</span>
                {progress.completed.includes(item.id) && <span><Check size={15} aria-hidden="true" /><span className="sr-only">{t(copy.read)}</span></span>}
              </button></li>)}
            </ol>
          </nav>
          <div className="min-w-0 p-4 sm:p-5">
            <h4 ref={titleRef} tabIndex={-1} className="text-base font-semibold text-gray-900 focus:outline-none">{progress.stepIndex + 1}. {t(step.title)}</h4>
            <p className="mt-3 text-sm leading-7 text-gray-700">{t(step.instruction)}</p>
            <p className="mt-4 text-xs font-semibold text-gray-700">{t(copy.verify)}</p>
            <p className="mt-1 text-sm leading-7 text-gray-600">{t(step.check)}</p>
            <Link href={step.href} target={externalModule ? "_blank" : undefined} rel={externalModule ? "noopener noreferrer" : undefined}
              className={`${button} mt-4 inline-flex items-center gap-2 border border-gray-300 text-snow-700 hover:bg-gray-50`}>
              {t(step.action)}{externalModule ? <><ExternalLink size={14} aria-hidden="true" /><span className="sr-only">{t(copy.newTab)}</span></> : <ArrowRight size={14} aria-hidden="true" />}
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
              <button disabled={progress.stepIndex === 0} onClick={() => update({ ...progress, stepIndex: progress.stepIndex - 1 })} className={`${button} border border-gray-300 text-gray-600 disabled:cursor-not-allowed disabled:opacity-40`}>{t(copy.previous)}</button>
              <button onClick={advance} className={`${button} bg-snow-600 text-white hover:bg-snow-700`}>{t(canFinish ? copy.finish : copy.next)}</button>
              <button onClick={() => update({ ...progress, stepIndex: 0, completed: progress.completed.filter((id) => !guide.steps.some((item) => item.id === id)) })} className={`${button} text-gray-600 underline`}>{t(copy.restart)}</button>
            </div>
            <p role="status" className="mt-3 text-sm leading-6 text-snow-700">{finished ? t(copy.done) : ""}</p>
          </div>
        </div>
        <div className="border-t border-gray-100 px-4 py-3 text-xs leading-6 text-gray-500 sm:px-5">
          <p>{t(copy.note)}</p>
          {storageUnavailable && <p role="status" className="mt-1 text-amber-800">{t(copy.storageUnavailable)}</p>}
        </div>
      </div>}
    </section>
  );
}
