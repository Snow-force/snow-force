"use client";

import { useLanguage } from "@/lib/language";

export type StepId =
  | "basic"
  | "registration"
  | "merchants"
  | "questions"
  | "review"
  | "modules"
  | "preview";

type EventEditorStepperProps = {
  activeStep: StepId;
  onStepChange(step: StepId): void;
  summaries: Record<StepId, string>;
};

const steps: Array<{ id: StepId; label: { zh: string; en: string } }> = [
  { id: "basic", label: { zh: "基础信息", en: "Basic" } },
  { id: "registration", label: { zh: "报名设置", en: "Registration" } },
  { id: "merchants", label: { zh: "商家摊位", en: "Merchants" } },
  { id: "questions", label: { zh: "参与者问题", en: "Questions" } },
  { id: "review", label: { zh: "活动反馈", en: "Review" } },
  { id: "modules", label: { zh: "详情模块", en: "Details" } },
  { id: "preview", label: { zh: "预览发布", en: "Preview" } },
];

export function EventEditorStepper({ activeStep, onStepChange, summaries }: EventEditorStepperProps) {
  const { lang } = useLanguage();
  return (
    <nav aria-label="Event editor steps" className="space-y-2">
      {steps.map((step) => {
        const isActive = activeStep === step.id;
        const label = step.label[lang];
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
            <span className="block text-sm font-semibold">{label}</span>
            <span className={`mt-1 block break-words text-xs leading-5 ${isActive ? "text-blue-800" : "text-gray-500"}`}>
              {summaries[step.id]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
