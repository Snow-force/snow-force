"use client";

import type { Event } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type EventPreviewPanelProps = {
  event: Event;
  activeLang: ActiveLang;
};

export function EventPreviewPanel({ event, activeLang }: EventPreviewPanelProps) {
  const { t } = useLanguage();
  const capacity = event.capacity === 0 ? t(adminCopy.editor.unlimitedCapacity) : `${event.registrationCount}/${event.capacity}`;

  return (
    <aside className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.previewAndPublish)}</h3>
        <span className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">{event.status}</span>
      </div>
      <div className="mx-auto max-w-[260px] rounded-[28px] border border-gray-200 bg-gray-950 p-2 shadow-sm">
        <div className="rounded-[22px] bg-white p-4 text-gray-900">
          {event.coverImage ? (
            <div
              aria-hidden="true"
              className="mb-3 aspect-[4/3] rounded bg-gray-100 bg-cover bg-center"
              style={{ backgroundImage: `url(${event.coverImage})` }}
            />
          ) : null}
          <p className="text-xs uppercase text-blue-700">{event.registrationState}</p>
          <h4 className="mt-1 text-lg font-semibold leading-6">{event.title[activeLang] || "Untitled event"}</h4>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Date/time</dt>
              <dd className="font-medium text-gray-900">{[event.eventDate, event.meetTime].filter(Boolean).join(" / ") || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Location</dt>
              <dd className="font-medium text-gray-900">{event.activityLocation[activeLang] || event.meetLocation[activeLang] || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Capacity</dt>
              <dd className="font-medium text-gray-900">{capacity}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase text-gray-500">Modules</p>
            {event.detailModules.length ? (
              event.detailModules.map((moduleItem) => (
                <div key={moduleItem.id} className="rounded border border-gray-100 px-2 py-1 text-sm text-gray-700">
                  {moduleItem.title[activeLang] || moduleItem.type}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">No modules yet.</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
