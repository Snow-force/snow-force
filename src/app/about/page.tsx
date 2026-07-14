"use client";

import { useLanguage } from "@/lib/language";

export default function AboutPage() {
  const { t } = useLanguage();

  const teamMembers = [
    {
      name: "Charles",
      role: { en: "Founder & CEO", zh: "创始人 & CEO" },
      years: { en: "Snow Years: 5", zh: "雪龄：5年" },
      desc: {
        en: "Founder of SnowForce. Passionate about skiing and exploration, with a talent for resource integration and team building. Dedicated to building a professional, warm, and welcoming ski community.",
        zh: "SnowForce 创始人。热爱滑雪与探索，擅长资源整合与团队建设。致力于打造一个专业、温暖、有归属感的滑雪社区。",
      },
      tags: { en: ["Strategy", "Team Management", "Resource Integration"], zh: ["战略规划", "团队管理", "资源整合"] },
      image: "/team/charles.png",
    },
    {
      name: "Sunny",
      role: { en: "VP", zh: "副总裁" },
      years: { en: "Snow Years: 10", zh: "雪龄：10年" },
      desc: {
        en: "Has skied at resorts around the world. Brings rich operations management experience and strategic thinking, leading the team to push boundaries and build a professional, warm, and welcoming ski community.",
        zh: "足迹遍布全球雪场。拥有丰富的运营管理经验与战略思维，带领团队不断突破边界，打造专业、温暖、有归属感的滑雪社区。",
      },
      tags: { en: ["Strategy", "Team Management", "Resource Integration"], zh: ["战略规划", "团队管理", "资源整合"] },
      image: "/team/sunny.png",
    },
    {
      name: "William",
      role: { en: "Marketing Manager", zh: "市场经理" },
      years: { en: "Snow Years: 3", zh: "雪龄：3年" },
      desc: {
        en: "Connecting passion with creativity, delivering value through content. Specializes in brand promotion and content planning, helping more people experience the joy of skiing and bringing SnowForce's story to a wider audience.",
        zh: "用创意连接热爱，用内容传递价值。擅长品牌推广与内容策划，致力于让更多人感受到滑雪魅力，让 SnowForce 的故事被更多人看见。",
      },
      tags: { en: ["Brand Promotion", "Content Planning", "Community Operations"], zh: ["品牌推广", "内容策划", "社群运营"] },
      image: "/team/william.png",
    },
    {
      name: "Harry",
      role: { en: "CTO", zh: "首席技术官" },
      years: { en: "Snow Years: 5", zh: "雪龄：5年" },
      desc: {
        en: "Serving passion through technology, connecting every rider through innovation. Leads overall technical R&D for the website, mini-program, and app, focusing on digital product design, system architecture, and platform building.",
        zh: "让技术服务热爱，让创新连接每一位雪友。负责官网、小程序及 App 的整体技术研发，专注数字化产品设计、系统架构与平台建设。",
      },
      tags: { en: ["Web Development", "App Development", "Tech Innovation"], zh: ["网站开发", "App 开发", "技术创新"] },
      image: "/team/harry.png",
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-snow-600 font-semibold tracking-[0.16em] uppercase text-sm">
              {t({ en: "Our Team", zh: "团队介绍" })}
            </p>
            <h1 className="mt-4 text-5xl sm:text-6xl font-bold tracking-tight text-gray-900">
              {t({ en: "Born in the Snow. Driven by the Force.", zh: "生于雪，成于力。" })}
            </h1>
            <p className="mt-6 text-lg text-gray-500 max-w-prose">
              {t({
                en: "Skiing is more than a sport — it is an exploration of a way of life. We believe the mountains teach us not just technique, but courage, focus, and team spirit.",
                zh: "滑雪不只是一种运动，更是一种生活方式的探索。我们相信，雪山教会我们的，不仅是技术，更是勇气、专注与团队精神。",
              })}
            </p>
          </div>
          <div className="rounded-3xl overflow-hidden shadow-xl aspect-[4/5] sm:aspect-[5/6] bg-gray-900">
            <img
              src="/team/group.jpg"
              alt={t({ en: "SnowForce Team", zh: "SnowForce 团队" })}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900">
            {t({
              en: "A ski community with warmth, professionalism, and a sense of belonging.",
              zh: "一个有温度、有专业度、有归属感的滑雪社区。",
            })}
          </h2>
          <p className="mt-6 text-lg text-gray-500">
            {t({
              en: "SnowForce was born from a love of skiing and the desire to share the freedom of the snow with more people. Every departure becomes a journey of self-discovery and self-transcendence.",
              zh: "SnowForce 的诞生，源于对滑雪的热爱，以及希望与更多人分享雪上的自由。让每一次出发，都成为探索自我、突破自我的旅程。",
            })}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <span className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-snow-700">
              {t({ en: "Warmth", zh: "有温度" })}
            </span>
            <span className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-snow-700">
              {t({ en: "Professionalism", zh: "有专业度" })}
            </span>
            <span className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-snow-700">
              {t({ en: "Belonging", zh: "有归属感" })}
            </span>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 text-center">
          {t({ en: "Core Team", zh: "核心团队" })}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
          {teamMembers.map((m) => (
            <div key={m.name} className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="aspect-[4/5] bg-gray-900 overflow-hidden">
                <img src={m.image} alt={m.name} className="h-full w-full object-cover" />
              </div>
              <div className="p-6 sm:p-8">
                <p className="text-snow-600 font-semibold text-sm tracking-wide">
                  {t(m.role)}
                </p>
                <h3 className="mt-2 text-2xl font-bold text-gray-900">
                  {m.name}
                </h3>
                <span className="mt-4 inline-block rounded-full bg-snow-100 px-3 py-1 text-sm font-semibold text-snow-700">
                  {t(m.years)}
                </span>
                <p className="mt-4 text-gray-600 leading-relaxed">
                  {t(m.desc)}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {t(m.tags).map((tag: string) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Principles + Vision Banner */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 text-center">
            {t({ en: "Founding Principles", zh: "创始理念" })}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-7">
              <h3 className="text-xl font-semibold text-gray-900">{t({ en: "Passion-Driven", zh: "热爱驱动" })}</h3>
              <p className="mt-3 text-gray-600 leading-relaxed">{t({ en: "Start from a love of skiing and create value through passion.", zh: "从热爱滑雪出发，用热情创造价值。" })}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-7">
              <h3 className="text-xl font-semibold text-gray-900">{t({ en: "Community First", zh: "社群为先" })}</h3>
              <p className="mt-3 text-gray-600 leading-relaxed">{t({ en: "Build a ski community culture with a real sense of belonging.", zh: "打造有归属感的滑雪社区文化。" })}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-7">
              <h3 className="text-xl font-semibold text-gray-900">{t({ en: "Safety & Professionalism", zh: "安全专业" })}</h3>
              <p className="mt-3 text-gray-600 leading-relaxed">{t({ en: "Safety first, professionalism as the foundation — every trip is one you can trust.", zh: "安全第一，专业为基，每一次出发都值得信赖。" })}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-7">
              <h3 className="text-xl font-semibold text-gray-900">{t({ en: "Growth Together", zh: "成长共赢" })}</h3>
              <p className="mt-3 text-gray-600 leading-relaxed">{t({ en: "Grow together, explore together, create more possibilities together.", zh: "一起成长，一起探索，共创更多可能。" })}</p>
            </div>
          </div>
          <div className="mt-8 rounded-3xl bg-gray-900 text-white p-10 sm:p-14 text-center">
            <h3 className="text-2xl sm:text-3xl font-semibold">{t({ en: "Brand Vision", zh: "品牌愿景" })}</h3>
            <p className="mt-3 text-lg text-gray-300">{t({ en: "To make SnowForce the spiritual home of every skier.", zh: "让 SnowForce 成为每一位滑雪爱好者的精神家园。" })}</p>
          </div>
        </div>
      </section>
    </>
  );
}
