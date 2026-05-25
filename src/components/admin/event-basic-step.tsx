"use client";

import type { Event, EventStatus, RegistrationState } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type EventBasicStepProps = {
  event: Event;
  activeLang: ActiveLang;
onChange(event: Event): void;
  isNew?: boolean;
};

function isEventStatus(value: string): value is EventStatus {
  return value === "draft" || value === "published" || value === "archived";
}

function isRegistrationState(value: string): value is RegistrationState {
  return value === "open" || value === "closed" || value === "full";
}

export function EventBasicStep({ event, activeLang, onChange, isNew = true }: EventBasicStepProps) {
  const { t } = useLanguage();

  function updateEventValue<Key extends keyof Event>(key: Key, value: Event[Key]) {
    onChange({ ...event, [key]: value });
  }

  function updateBilingualValue(key: "title" | "meetLocation" | "activityLocation", value: string) {
    onChange({
      ...event,
      [key]: {
        ...event[key],
        [activeLang]: value,
      },
    });
  }

  return (
    <section className="card space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.basicInfo)}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.slug)}
          <input
            value={event.slug}
            onChange={(changeEvent) => updateEventValue("slug", changeEvent.currentTarget.value)}
            readOnly={!isNew}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 read-only:bg-gray-50"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.title)}
          <input
            value={event.title[activeLang]}
            onChange={(changeEvent) => updateBilingualValue("title", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.eventStart)}
          <input
            type="date"
            value={event.eventDate}
            onChange={(changeEvent) => updateEventValue("eventDate", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.schedule)}
          <input
            value={event.meetTime}
            onChange={(changeEvent) => updateEventValue("meetTime", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.meetLocation)}
          <input
            value={event.meetLocation[activeLang]}
            onChange={(changeEvent) => updateBilingualValue("meetLocation", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.activityLocation)}
          <input
            value={event.activityLocation[activeLang]}
            onChange={(changeEvent) => updateBilingualValue("activityLocation", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.mapUrl)}
          <input
            value={event.locationUrl}
            onChange={(changeEvent) => updateEventValue("locationUrl", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.coverImage)}
          <input
            value={event.coverImage}
            onChange={(changeEvent) => updateEventValue("coverImage", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.status)}
          <select
            value={event.status}
            onChange={(changeEvent) => {
              const nextStatus = changeEvent.currentTarget.value;
              if (isEventStatus(nextStatus)) updateEventValue("status", nextStatus);
            }}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          >
            <option value="draft">{t(adminCopy.events.statuses.draft)}</option>
            <option value="published">{t(adminCopy.events.statuses.published)}</option>
            <option value="archived">{t(adminCopy.events.statuses.archived)}</option>
          </select>
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.state)}
          <select
            value={event.registrationState}
            onChange={(changeEvent) => {
              const nextState = changeEvent.currentTarget.value;
              if (isRegistrationState(nextState)) updateEventValue("registrationState", nextState);
            }}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          >
            <option value="closed">{t(adminCopy.editor.closed)}</option>
            <option value="open">{t(adminCopy.editor.open)}</option>
            <option value="full">{t(adminCopy.editor.full)}</option>
          </select>
        </label>
      </div>
    </section>
  );
}
