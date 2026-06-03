"use client";

import Link from "next/link";

import { logoutAdmin } from "@/lib/auth/admin";
import type { StaffAccount } from "@/lib/auth/staff-repository";
import { useLanguage } from "@/lib/language";
import { AdminNav } from "./admin-nav";
import { adminCopy } from "./admin-copy";

export function AdminShell({ children, staff }: { children: React.ReactNode; staff: StaffAccount }) {
  const { t } = useLanguage();

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t(adminCopy.shell.title)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Link href="/" className="text-snow-600 hover:text-snow-700">
                {t(adminCopy.shell.viewSite)}
              </Link>
              <span className="text-gray-400">{staff.email}</span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-500">
                {staff.role}
              </span>
            </div>
          </div>
          <form action={logoutAdmin}>
            <button className="text-sm text-gray-400 hover:text-gray-600">{t(adminCopy.shell.signOut)}</button>
          </form>
        </div>
        <AdminNav canManageStaff={staff.role === "admin"} />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
