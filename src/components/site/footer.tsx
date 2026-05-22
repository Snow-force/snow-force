"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">SnowForce</h3>
            <p className="mt-2 text-sm text-gray-500">
              {t({
                en: "Community-driven snow sports in China. Events, training, and good times on the mountain.",
                zh: "中国社群驱动的滑雪运动平台。活动、训练和山上的美好时光。",
              })}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t({ en: "Explore", zh: "探索" })}
            </h3>
            <ul className="mt-2 space-y-2">
              <li><Link href="/events" className="text-sm text-gray-500 hover:text-gray-700">{t({ en: "Events", zh: "当前活动" })}</Link></li>
              <li><Link href="/recaps" className="text-sm text-gray-500 hover:text-gray-700">{t({ en: "Recaps", zh: "往期回顾" })}</Link></li>
              <li><Link href="/faq" className="text-sm text-gray-500 hover:text-gray-700">{t({ en: "FAQ", zh: "常见问题" })}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t({ en: "Connect", zh: "联系" })}
            </h3>
            <ul className="mt-2 space-y-2">
              <li><Link href="/about" className="text-sm text-gray-500 hover:text-gray-700">{t({ en: "About Us", zh: "关于我们" })}</Link></li>
              <li><Link href="/partner" className="text-sm text-gray-500 hover:text-gray-700">{t({ en: "Partner With Us", zh: "合作咨询" })}</Link></li>
              <li><Link href="/member" className="text-sm text-gray-500 hover:text-gray-700">{t({ en: "Member Area", zh: "会员中心" })}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t({ en: "Contact", zh: "联系方式" })}
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-gray-500">
              <li>hello@snowforce.example.com</li>
              <li>{t({ en: "WeChat: SnowForce_Official", zh: "微信：SnowForce_Official" })}</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-200 pt-8 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} SnowForce. {t({ en: "All rights reserved.", zh: "保留所有权利。" })}
        </div>
      </div>
    </footer>
  );
}
