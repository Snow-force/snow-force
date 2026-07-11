"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language";

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
    <header className="sticky top-0 z-50">
      <nav className="h-16 border-b border-white/10 bg-black text-white">
        <div className="mx-auto flex h-full max-w-[980px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="select-none text-[24px] font-semibold leading-none text-white">
            SnowForce
          </Link>

          <div className="hidden h-full items-center gap-5 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[14px] font-normal leading-none tracking-[-0.224px] text-white/75 transition hover:text-white"
              >
                {t(item.label)}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLang("zh")}
                className={`rounded-full px-2.5 py-2 text-[14px] leading-none tracking-[-0.224px] transition active:scale-95 sm:px-3 ${
                  lang === "zh" ? "bg-white text-black" : "text-white/70 hover:text-white"
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLang("en")}
                className={`rounded-full px-2.5 py-2 text-[14px] leading-none tracking-[-0.224px] transition active:scale-95 sm:px-3 ${
                  lang === "en" ? "bg-white text-black" : "text-white/70 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>

            <Link
              href="/member"
              className="rounded-full bg-[#0066cc] px-4 py-2 text-[14px] font-normal leading-none tracking-[-0.224px] text-white transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] sm:px-5 sm:py-3"
            >
              {t({ en: "Member", zh: "会员" })}
            </Link>

            <button
              className="flex h-11 w-11 items-center justify-center text-white/80 transition hover:text-white lg:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              <svg className="h-[22px] w-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeWidth={2} d="M4 7h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="border-b border-black/10 bg-black lg:hidden">
          <div className="space-y-1 px-4 py-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-3 text-[17px] font-normal tracking-[-0.374px] text-white/80 hover:text-white"
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
