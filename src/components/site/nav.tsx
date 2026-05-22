"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage, type Lang } from "@/lib/language";

const navItems = [
  { href: "/events", label: { en: "Events", zh: "当前活动" } },
  { href: "/recaps", label: { en: "Recaps", zh: "往期回顾" } },
  { href: "/faq", label: { en: "FAQ", zh: "常见问题" } },
  { href: "/about", label: { en: "About", zh: "关于我们" } },
  { href: "/partner", label: { en: "Partner", zh: "合作咨询" } },
];

export function Nav() {
  const { lang, setLang, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-snow-700">
            SnowForce
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
            >
              {t(item.label)}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
            <button
              onClick={() => setLang("zh")}
              className={`rounded px-2 py-1 transition ${
                lang === "zh" ? "bg-snow-600 text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              中
            </button>
            <button
              onClick={() => setLang("en")}
              className={`rounded px-2 py-1 transition ${
                lang === "en" ? "bg-snow-600 text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              EN
            </button>
          </div>

          <Link href="/member" className="btn-primary text-xs py-1.5 px-3">
            {t({ en: "Member", zh: "会员" })}
          </Link>

          <button
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="border-t border-gray-100 bg-white md:hidden">
          <div className="space-y-1 px-4 py-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                onClick={() => setMenuOpen(false)}
              >
                {t(item.label)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
