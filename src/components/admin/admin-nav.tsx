"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/language";

type AdminLink = {
  href: string;
  label: { en: string; zh: string };
  exact?: boolean;
};

const adminLinks: AdminLink[] = [
  { href: "/admin", label: { en: "Dashboard", zh: "仪表盘" }, exact: true },
  { href: "/admin/events", label: { en: "Events", zh: "活动管理" } },
  { href: "/admin/events/promotion", label: { en: "Event promotion", zh: "活动推广" } },
  { href: "/admin/lodging", label: { en: "Lodging", zh: "住宿管理" } },
  { href: "/admin/registrations", label: { en: "Registrations", zh: "报名管理" } },
  { href: "/admin/reviews", label: { en: "Check-in & Reviews", zh: "签到与反馈" } },
  { href: "/admin/coupons", label: { en: "Coupons", zh: "优惠码" } },
  { href: "/admin/merchants", label: { en: "Merchants", zh: "商家摊位" } },
  { href: "/admin/recaps", label: { en: "Recaps", zh: "回顾管理" } },
  { href: "/admin/faq", label: { en: "FAQs", zh: "FAQ 管理" } },
];

const staffLink: AdminLink = { href: "/admin/staff", label: { en: "Staff", zh: "人员权限" } };

export function AdminNav({ canManageStaff }: { canManageStaff: boolean }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const links = canManageStaff ? [...adminLinks, staffLink] : adminLinks;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-2">
      {links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href) && !links.some(other => other.href !== link.href && other.href.startsWith(`${link.href}/`) && pathname.startsWith(other.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-snow-100 text-snow-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
          >
            {t(link.label)}
          </Link>
        );
      })}
    </nav>
  );
}

