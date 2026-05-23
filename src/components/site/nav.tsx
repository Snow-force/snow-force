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
      <nav className="h-11 bg-black text-white">
        <div className="mx-auto flex h-full max-w-[980px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-[14px] font-normal tracking-[-0.224px] text-white/95">
            SnowForce
          </Link>

          <div className="hidden h-full items-center gap-5 md:flex">
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

          <button
            className="flex h-11 w-11 items-center justify-center text-white/80 transition hover:text-white md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeWidth={2} d="M4 7h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      <div className="border-b border-black/10 bg-[#f5f5f7]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[52px] max-w-[980px] items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="text-[21px] font-semibold leading-none tracking-[0.231px] text-[#1d1d1f]"
          >
            SnowForce
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <button
                onClick={() => setLang("zh")}
                className={`rounded-full px-3 py-2 text-[14px] leading-none tracking-[-0.224px] transition active:scale-95 ${
                  lang === "zh" ? "bg-[#1d1d1f] text-white" : "text-[#333333] hover:text-[#0066cc]"
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLang("en")}
                className={`rounded-full px-3 py-2 text-[14px] leading-none tracking-[-0.224px] transition active:scale-95 ${
                  lang === "en" ? "bg-[#1d1d1f] text-white" : "text-[#333333] hover:text-[#0066cc]"
                }`}
              >
                EN
              </button>
            </div>

            <Link
              href="/member"
              className="rounded-full bg-[#0066cc] px-4 py-2 text-[14px] font-normal leading-none tracking-[-0.224px] text-white transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
            >
              {t({ en: "Member", zh: "会员" })}
            </Link>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="border-b border-black/10 bg-black md:hidden">
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
            <div className="flex gap-2 px-3 pt-2">
              <button
                onClick={() => setLang("zh")}
                className={`rounded-full px-3 py-2 text-[14px] leading-none ${
                  lang === "zh" ? "bg-white text-black" : "bg-white/10 text-white/80"
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLang("en")}
                className={`rounded-full px-3 py-2 text-[14px] leading-none ${
                  lang === "en" ? "bg-white text-black" : "bg-white/10 text-white/80"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
