"use client";

import Link from "next/link";

import {
  publishEventAction,
  setRegistrationStateAction,
  unpublishEventAction,
} from "@/lib/events/actions";
import { useLanguage } from "@/lib/language";
import type { Event } from "@/lib/types";
import { adminCopy } from "./admin-copy";

export function AdminEventsUnavailable() {
  const { t } = useLanguage();

  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {t(adminCopy.events.unavailable)}
    </div>
  );
}

export function AdminEventsView({ events }: { events: Event[] }) {
  const { lang, t } = useLanguage();

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">{t(adminCopy.events.title)}</h2>
        <Link href="/admin/events/new" className="btn-primary px-3 py-2 text-sm">
          {t(adminCopy.events.new)}
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-400">
              <th className="py-3 pr-4">{t(adminCopy.events.event)}</th>
              <th className="px-4 py-3">{t(adminCopy.events.date)}</th>
              <th className="px-4 py-3">{t(adminCopy.events.capacity)}</th>
              <th className="px-4 py-3">{t(adminCopy.events.status)}</th>
              <th className="px-4 py-3">{t(adminCopy.events.registration)}</th>
              <th className="py-3 pl-4">{t(adminCopy.events.actions)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((event) => (
              <tr key={event.slug} className="hover:bg-gray-50">
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-900">{event.title[lang] || event.title.en || event.slug}</p>
                  <p className="text-xs text-gray-400">{event.slug}</p>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {event.eventStartAt ? new Date(event.eventStartAt).toLocaleDateString() : t(adminCopy.events.draftDate)}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {event.registrationCount}/{event.capacity}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    event.status === "published"
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {t(adminCopy.events.statuses[event.status])}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    event.registrationState === "open"
                      ? "bg-green-50 text-green-700"
                      : event.registrationState === "full"
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-red-50 text-red-700"
                  }`}>
                    {t(adminCopy.events.statuses[event.registrationState])}
                  </span>
                </td>
                <td className="py-3 pl-4">
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`/admin/events/${event.slug}/edit`}
                      className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      {t(adminCopy.events.edit)}
                    </Link>
                    <form action={event.status === "published" ? unpublishEventAction : publishEventAction}>
                      <input type="hidden" name="slug" value={event.slug} />
                      <button className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">
                        {event.status === "published" ? t(adminCopy.events.unpublish) : t(adminCopy.events.publish)}
                      </button>
                    </form>
                    <form action={setRegistrationStateAction}>
                      <input type="hidden" name="slug" value={event.slug} />
                      <input
                        type="hidden"
                        name="registrationState"
                        value={event.registrationState === "open" ? "closed" : "open"}
                      />
                      <button className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">
                        {event.registrationState === "open"
                          ? t(adminCopy.events.closeRegistration)
                          : t(adminCopy.events.openRegistration)}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-8">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.events.bilingualCheck)}</h3>
        <p className="mt-1 text-sm text-gray-500">{t(adminCopy.events.bilingualCheckHelp)}</p>
        <div className="mt-4 divide-y divide-gray-100">
          {events.filter((event) => event.status === "published").map((event) => {
            const missing: string[] = [];
            if (!event.title.en || !event.title.zh) missing.push("title");
            if (!event.description.en || !event.description.zh) missing.push("description");

            return (
              <div key={event.slug} className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm">{event.title[lang] || event.title.en || event.slug}</span>
                {missing.length > 0 ? (
                  <span className="text-xs text-red-600">
                    {t(adminCopy.events.missing)}: {missing.join(", ")}
                  </span>
                ) : (
                  <span className="text-xs text-green-600">{t(adminCopy.events.complete)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
