"use client";

import { useLanguage } from "@/lib/language";

export default function AboutPage() {
  const { t } = useLanguage();

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="section-title">
          {t({ en: "About SnowForce", zh: "关于 SnowForce" })}
        </h1>

        <div className="mt-8 space-y-8 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">
              {t({ en: "Who We Are", zh: "我们是谁" })}
            </h2>
            <p className="mt-3">
              {t({
                en: "SnowForce is a community-driven snow sports platform in China. We organize events, training sessions, and social gatherings for riders of all levels — from first-timers to seasoned experts. Our mission is to make snow sports more accessible, social, and fun for everyone.",
                zh: "SnowForce 是中国社群驱动的滑雪运动平台。我们为各个水平的滑手组织活动、培训和社交聚会 —— 从新手到老炮。我们的使命是让滑雪运动对每个人来说都更容易参与、更有社交乐趣、更好玩。",
              })}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">
              {t({ en: "What We Do", zh: "我们做什么" })}
            </h2>
            <ul className="mt-3 space-y-3">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-snow-100 p-1 text-snow-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                </span>
                <span>
                  <strong className="text-gray-900">{t({ en: "Events & Gatherings", zh: "活动与聚会" })}</strong>
                  <br />
                  {t({
                    en: "Season kickoffs, night sessions, park days, and social après — we bring riders together on and off the mountain.",
                    zh: "雪季开板、夜滑专场、公园日和雪后派对 —— 我们在山上山下把滑手聚在一起。",
                  })}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-snow-100 p-1 text-snow-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                </span>
                <span>
                  <strong className="text-gray-900">{t({ en: "Skill Development", zh: "技术提升" })}</strong>
                  <br />
                  {t({
                    en: "Technique workshops, park progression camps, and coached sessions to help you level up your riding.",
                    zh: "技术工作坊、公园进阶训练营和教练带队训练，帮助你的滑行更上一层楼。",
                  })}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-snow-100 p-1 text-snow-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                </span>
                <span>
                  <strong className="text-gray-900">{t({ en: "Community Building", zh: "社群建设" })}</strong>
                  <br />
                  {t({
                    en: "We connect riders, share knowledge, and build a welcoming community around the sport we love.",
                    zh: "我们连接滑手、分享知识，围绕我们热爱的运动建设一个友好的社群。",
                  })}
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">
              {t({ en: "Contact Us", zh: "联系我们" })}
            </h2>
            <div className="mt-3 space-y-2 text-sm">
<p>Email: snowforceclub@gmail.com</p>
        <p>{t({ en: "WeChat: SnowForceClub", zh: "微信：SnowForceClub" })}</p>
              <p>{t({ en: "Follow us on social media for event updates and community news.", zh: "关注我们的社交媒体获取活动更新和社群动态。" })}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
