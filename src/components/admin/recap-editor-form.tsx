"use client";

import { useState } from "react";

import { localizedText } from "@/lib/i18n/fallback";
import { useLanguage } from "@/lib/language";
import { updateRecapAction } from "@/lib/recaps/actions";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";
import { RecapBasicStep } from "./recap-basic-step";
import { RecapContentStep } from "./recap-content-step";
import { RecapEditorStepper, type RecapStepId } from "./recap-editor-stepper";
import { RecapMediaManager } from "./recap-media-manager";
import { RecapPublishStep } from "./recap-publish-step";

type ActiveLang = "zh" | "en";

function recapPayload(recap: EventRecap) {
  return JSON.stringify(recap);
}

export function RecapEditorForm({ recap }: { recap: EventRecap }) {
  const [draftRecap, setDraftRecap] = useState(recap);
  const [activeLang, setActiveLang] = useState<ActiveLang>("zh");
  const [activeStep, setActiveStep] = useState<RecapStepId>("basic");
  const { lang, t } = useLanguage();
  const payload = recapPayload(draftRecap);
  const saveFormId = `recap-save-${recap.slug}`;

  const summaries: Record<RecapStepId, string> = {
    basic: `${draftRecap.date || "—"} · ${localizedText(draftRecap.location, "zh") || draftRecap.slug}`,
    content: localizedText(draftRecap.title, activeLang) || draftRecap.slug,
    media: `${draftRecap.media.length} ${lang === "zh" ? "张照片" : "photos"}`,
    publish: draftRecap.status,
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-gray-400">
          {t(adminCopy.recaps.recapEditor)}
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-gray-900">
          {localizedText(draftRecap.title, activeLang) || draftRecap.slug}
        </h2>
      </div>

      <form id={saveFormId} action={updateRecapAction}>
        <input type="hidden" name="slug" value={recap.slug} />
        <input type="hidden" name="recapPayload" value={payload} />
      </form>

      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <RecapEditorStepper activeStep={activeStep} onStepChange={setActiveStep} summaries={summaries} />
        </div>

        <div className="min-w-0">
          {activeStep === "basic" ? <RecapBasicStep recap={draftRecap} onChange={setDraftRecap} /> : null}
          {activeStep === "content" ? (
            <RecapContentStep
              recap={draftRecap}
              activeLang={activeLang}
              onLangChange={setActiveLang}
              onChange={setDraftRecap}
            />
          ) : null}
          {activeStep === "media" ? <RecapMediaManager recap={draftRecap} draftPayload={payload} /> : null}
          {activeStep === "publish" ? (
            <RecapPublishStep
              recap={draftRecap}
              activeLang={activeLang}
              onLangChange={setActiveLang}
              onChange={setDraftRecap}
            />
          ) : null}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <section className="card space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {t(adminCopy.recaps.preview)}
            </p>
            {draftRecap.coverImage ? (
              <div
                className="h-32 rounded-lg bg-cover bg-center"
                style={{ backgroundImage: `url(${draftRecap.coverImage})` }}
              />
            ) : null}
            <h3 className="font-semibold text-gray-900">
              {localizedText(draftRecap.title, activeLang) || draftRecap.slug}
            </h3>
            <p className="text-sm text-gray-500">{localizedText(draftRecap.summary, activeLang)}</p>
          </section>
          <button type="submit" form={saveFormId} className="btn-primary w-full px-5 py-2">
            {t(adminCopy.editor.save)}
          </button>
        </aside>
      </div>
    </div>
  );
}
