"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GalleryHorizontalEnd, Home, Image as ImageIcon, UserRound } from "lucide-react";

import { useLanguage } from "@/lib/language";

const previewItems = [
  {
    href: "/design-preview/member",
    label: { en: "Member center", zh: "会员中心" },
    icon: UserRound,
  },
  {
    href: "/design-preview/home",
    label: { en: "Home reel", zh: "首页回放" },
    icon: Home,
  },
  {
    href: "/design-preview/recaps",
    label: { en: "Recap index", zh: "回顾列表" },
    icon: GalleryHorizontalEnd,
  },
  {
    href: "/design-preview/recap-detail",
    label: { en: "Recap detail", zh: "回顾详情" },
    icon: ImageIcon,
  },
] as const;

export function DesignPreviewSwitcher() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[calc(100vw-1.5rem)] rounded-[10px] border border-white/20 bg-[#07090c] p-2 text-white shadow-2xl shadow-black/30 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-fit">
      <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
        {t({ en: "Local design preview", zh: "本地设计预览" })}
      </p>
      <nav className="grid grid-cols-4 gap-1 sm:flex" aria-label={t({ en: "Design preview views", zh: "设计预览页面" })}>
        {previewItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-[7px] px-2 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:shrink-0 sm:gap-2 sm:px-3 sm:text-[13px] ${
                active ? "bg-[#0066cc] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
