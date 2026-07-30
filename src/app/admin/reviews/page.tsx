import Link from "next/link";

import { getAdminEventHistory } from "@/lib/events/repository";

export default async function AdminReviewsPage() {
  const events = await getAdminEventHistory();

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
          On-site operations
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-950">Check-in & reviews</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          Open Check-in when guests arrive. After the event, open Review without archiving the
          event; Review automatically closes Check-in and uses the event&apos;s saved review setup.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {events.length ? (
          <ul className="divide-y divide-gray-100">
            {events.map((event) => (
              <li key={event.slug}>
                <Link
                  href={`/admin/reviews/${event.slug}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50"
                >
                  <div>
                    <h2 className="font-semibold text-gray-900">{event.title.en || event.slug}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {event.eventDate || "Date not set"} · {event.activityLocation.en || "Location not set"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="rounded bg-gray-100 px-2 py-1 text-gray-600">{event.status}</span>
                    <span className="font-medium text-blue-700">Manage →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No events found.</p>
        )}
      </div>
    </div>
  );
}
