"use client";

import Link from "next/link";

import { useLanguage } from "@/lib/language";
import type { Registration } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type Stat = {
  key: keyof typeof adminCopy.dashboard;
  value: number;
  href: string;
};

export function AdminDashboardView({
  stats,
  registrations,
}: {
  stats: Stat[];
  registrations: Registration[];
}) {
  const { t } = useLanguage();

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.key} href={stat.href} className="card text-center transition hover:shadow-md">
            <div className="text-3xl font-bold text-snow-600">{stat.value}</div>
            <div className="mt-1 text-sm text-gray-500">{t(adminCopy.dashboard[stat.key])}</div>
          </Link>
        ))}
      </div>
      <section className="card mt-8">
        <h2 className="text-lg font-semibold text-gray-900">{t(adminCopy.dashboard.recentRegistrations)}</h2>
        <div className="mt-4 divide-y divide-gray-100">
          {registrations.slice(-5).reverse().map((registration) => (
            <div key={registration.id} className="flex items-center justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{registration.contactName}</p>
                <p className="truncate text-xs text-gray-400">
                  {registration.contactEmail} - {registration.eventSlug}
                </p>
              </div>
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                {registration.status}
              </span>
            </div>
          ))}
          {registrations.length === 0 ? (
            <p className="py-4 text-sm text-gray-400">{t(adminCopy.dashboard.noRegistrations)}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
