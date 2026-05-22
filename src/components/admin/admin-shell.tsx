"use client";

import Link from "next/link";

import { logoutAdmin } from "@/lib/auth/admin";
import { useLanguage } from "@/lib/language";
import { AdminNav } from "./admin-nav";
import { adminCopy } from "./admin-copy";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t(adminCopy.shell.title)}</h1>
            <Link href="/" className="text-sm text-snow-600 hover:text-snow-700">
              {t(adminCopy.shell.viewSite)}
            </Link>
          </div>
          <form action={logoutAdmin}>
            <button className="text-sm text-gray-400 hover:text-gray-600">{t(adminCopy.shell.signOut)}</button>
          </form>
        </div>
        <AdminNav />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
