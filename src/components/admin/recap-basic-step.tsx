"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type RecapBasicStepProps = {
  recap: EventRecap;
  onChange(recap: EventRecap): void;
};

export function RecapBasicStep({ recap, onChange }: RecapBasicStepProps) {
  const { t } = useLanguage();

  return (
    <section className="card space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.basic)}</h3>
      {recap.eventSlug ? (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          <span className="font-medium">{t(adminCopy.recapEditor.sourceEvent)}</span>{" "}
          <span className="font-mono text-indigo-700">{recap.eventSlug}</span>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.slug)}
          <input
            value={recap.slug}
            readOnly
            className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.recapEditor.date)}
          <input
            type="date"
            value={recap.date}
            onChange={(event) => onChange({ ...recap, date: event.currentTarget.value })}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600 md:col-span-2">
          {t(adminCopy.editor.coverImage)}
          <input
            value={recap.coverImage}
            onChange={(event) => onChange({ ...recap, coverImage: event.currentTarget.value })}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
      </div>
    </section>
  );
}
