"use client";

export type StepId = "basic" | "registration" | "questions" | "modules" | "preview";

type EventEditorStepperProps = {
  activeStep: StepId;
  onStepChange(step: StepId): void;
  summaries: Record<StepId, string>;
};

const steps: Array<{ id: StepId; label: string }> = [
  { id: "basic", label: "Basic" },
  { id: "registration", label: "Registration" },
  { id: "questions", label: "Questions" },
  { id: "modules", label: "Details" },
  { id: "preview", label: "Preview" },
];

export function EventEditorStepper({ activeStep, onStepChange, summaries }: EventEditorStepperProps) {
  return (
    <nav aria-label="Event editor steps" className="space-y-2">
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
            <span className="block text-sm font-semibold">{step.label}</span>
            {!isActive ? <span className="mt-1 block text-xs leading-5 text-gray-500">{summaries[step.id]}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
