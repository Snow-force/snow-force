"use client";

import { useLanguage } from "@/lib/language";
import { getFAQs } from "@/lib/faqs/repository";

export default function FAQPage() {
  const { t } = useLanguage();
  const faqs = getFAQs();

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="section-title text-center">
          {t({ en: "Frequently Asked Questions", zh: "常见问题" })}
        </h1>
        <p className="mt-2 text-center text-gray-500">
          {t({
            en: "Everything you need to know about SnowForce events and community.",
            zh: "关于 SnowForce 活动和社群，你想知道的一切。",
          })}
        </p>

        {/* Categories */}
        <div className="mt-8 space-y-8">
          {Array.from(new Set(faqs.map((f) => t(f.category)))).map((category) => (
            <div key={category}>
              <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
                {category}
              </h2>
              <div className="mt-3 divide-y divide-gray-100">
                {faqs
                  .filter((f) => t(f.category) === category)
                  .map((faq) => (
                    <details key={faq.id} className="group py-4">
                      <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-gray-900">
                        {t(faq.question)}
                        <span className="ml-2 shrink-0 text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <p className="mt-3 text-sm text-gray-500 leading-relaxed">{t(faq.answer)}</p>
                    </details>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* New Rider Guide */}
        <div className="mt-12 rounded-xl bg-snow-50 p-6">
          <h2 className="text-lg font-semibold text-snow-800">
            {t({ en: "New to SnowForce?", zh: "SnowForce 新手指南" })}
          </h2>
          <p className="mt-2 text-sm text-snow-700">
            {t({
              en: "Welcome! Here's how to get started: Browse our events page, find one that matches your level, and register. You don't need an account — just show up and ride. If you want faster registration next time, create a free member profile.",
              zh: "欢迎！开始很简单：浏览活动页面，找到适合你水平的活动，报名即可。不需要账号 — 来就行了。如果你想下次报名更快捷，可以创建一个免费会员档案。",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
