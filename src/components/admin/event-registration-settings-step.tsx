"use client";

import type { Event } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type EventRegistrationSettingsStepProps = {
  event: Event;
  activeLang: ActiveLang;
  onChange(event: Event): void;
};

function localDateTime(value: string) {
  return value ? value.slice(0, 16) : "";
}

export function EventRegistrationSettingsStep({ event, activeLang, onChange }: EventRegistrationSettingsStepProps) {
  const { t } = useLanguage();

  function updateEventValue<Key extends keyof Event>(key: Key, value: Event[Key]) {
    onChange({ ...event, [key]: value });
  }

  function updatePaymentInstructions(value: string) {
    onChange({
      ...event,
      paymentInstructions: {
        ...event.paymentInstructions,
        [activeLang]: value,
      },
    });
  }

  return (
    <section className="card space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.registrationSettings)}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.capacity)}
          <input
            type="number"
            min={0}
            value={event.capacity}
            onChange={(changeEvent) => updateEventValue("capacity", Number(changeEvent.currentTarget.value))}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.registrationClose)}
          <input
            type="datetime-local"
            value={localDateTime(event.registrationCloseAt)}
            onChange={(changeEvent) => updateEventValue("registrationCloseAt", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={event.requiresApproval}
            onChange={(changeEvent) => updateEventValue("requiresApproval", changeEvent.currentTarget.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Requires approval
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={event.allowWaitlist}
            onChange={(changeEvent) => updateEventValue("allowWaitlist", changeEvent.currentTarget.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Allow waitlist
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={event.allowCancellation}
            onChange={(changeEvent) => updateEventValue("allowCancellation", changeEvent.currentTarget.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Allow cancellation
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.feeInfo)}
          <input
            value={event.feeAmount}
            onChange={(changeEvent) => updateEventValue("feeAmount", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          Payment instructions
          <textarea
            value={event.paymentInstructions[activeLang]}
            onChange={(changeEvent) => updatePaymentInstructions(changeEvent.currentTarget.value)}
            rows={3}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
      </div>
    </section>
  );
}
