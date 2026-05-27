"use client";

import { useLanguage } from "@/lib/language";

export type RecapStepId = "basic" | "content" | "media" | "publish";

type RecapEditorStepperProps = {
  activeStep: RecapStepId;
  onStepChange(step: RecapStepId): void;
  summaries: Record<RecapStepId, string>;
};

const steps: Array<{ id: RecapStepId; label: { zh: string; en: string } }> = [
  { id: "basic", label: { zh: "基础信息", en: "Basic" } },
  { id: "content", label: { zh: "回顾内容", en: "Content" } },
  { id: "media", label: { zh: "照片与媒体", en: "Media" } },
  { id: "publish", label: { zh: "SEO 与发布", en: "Publish" } },
];

export function RecapEditorStepper({ activeStep, onStepChange, summaries }: RecapEditorStepperProps) {
  const { lang } = useLanguage();

  return (
    <nav aria-label="Recap editor steps" className="space-y-2">
      {steps.map((step) => {
        const isActive = activeStep === step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepChange(step.id)}
            className={`w-full rounded border px-3 py-2 text-left transition ${
              isActive
                ? "border-blue-500 bg-blue-50 text-blue-950"
                : "border-gray-200 bg-white text-gray-800 hover:border-blue-200 hover:bg-blue-50/50"
            }`}
          >
            <span className="block text-sm font-semibold">{step.label[lang]}</span>
            {!isActive ? (
              <span className="mt-1 block break-words text-xs leading-5 text-gray-500">
                {summaries[step.id]}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
