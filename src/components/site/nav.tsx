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
      <nav className="select-none h-16 border-b border-white/10 bg-black text-white">
        <div className="mx-auto flex h-full max-w-[980px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-[24px] font-semibold leading-none text-white">
            <img src="/logo.jpg" alt="SnowForce" className="h-9 w-9 rounded-[10px] object-cover" />
            <span>SnowForce</span>
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
            <div className="hidden items-center gap-1 sm:flex">
              <button
                onClick={() => setLang("zh")}
                className={`rounded-full px-3 py-2 text-[14px] leading-none tracking-[-0.224px] transition active:scale-95 ${
                  lang === "zh" ? "bg-white text-black" : "text-white/70 hover:text-white"
                }`}
              >
                CN
              </button>
              <button
                onClick={() => setLang("en")}
                className={`rounded-full px-3 py-2 text-[14px] leading-none tracking-[-0.224px] transition active:scale-95 ${
                  lang === "en" ? "bg-white text-black" : "text-white/70 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>

            <Link
              href="/merchant"
              className="hidden rounded-full border border-white/25 px-5 py-2.5 text-[14px] font-normal leading-none tracking-[-0.224px] text-white/80 transition hover:border-white/50 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:inline-flex"
            >
              {t({ en: "Merchant", zh: "商家" })}
            </Link>
            <Link
              href="/member"
              className="hidden rounded-full bg-[#0066cc] px-5 py-2.5 text-[14px] font-normal leading-none tracking-[-0.224px] text-white transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] sm:inline-flex"
            >
              {t({ en: "Member", zh: "会员" })}
            </Link>

            <button
              className="flex h-11 w-11 shrink-0 items-center justify-center text-white/80 transition hover:text-white lg:hidden"
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

            <Link
              href="/merchant"
              className="block rounded-lg border border-white/20 px-3 py-3 text-[17px] font-medium tracking-[-0.374px] text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => setMenuOpen(false)}
            >
              {t({ en: "Merchant", zh: "商家" })}
            </Link>

            <Link
              href="/member"
              className="block rounded-lg bg-[#0066cc] px-3 py-3 text-[17px] font-medium tracking-[-0.374px] text-white"
              onClick={() => setMenuOpen(false)}
            >
              {t({ en: "Member", zh: "会员" })}
            </Link>

            <div className="flex items-center gap-2 px-3 pt-2">
              <span className="text-[13px] text-white/50">
                {t({ en: "Language", zh: "语言" })}:
              </span>
              <button
                onClick={() => setLang("zh")}
                className={`rounded-full px-3 py-1.5 text-[14px] leading-none transition active:scale-95 ${
                  lang === "zh" ? "bg-white text-black" : "border border-white/20 text-white/70 hover:text-white"
                }`}
              >
                CN
              </button>
              <button
                onClick={() => setLang("en")}
                className={`rounded-full px-3 py-1.5 text-[14px] leading-none transition active:scale-95 ${
                  lang === "en" ? "bg-white text-black" : "border border-white/20 text-white/70 hover:text-white"
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
