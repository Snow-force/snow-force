"use client";

import { useLanguage } from "@/lib/language";

export default function RefundPolicyPage() {
  const { lang, t } = useLanguage();

  return (
    <main className={`bg-white py-16 sm:py-20 ${lang === "zh" ? "break-keep" : ""}`}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <header className="text-center">
          <h1 className="section-title">{t({ en: "Refund Policy", zh: "退款政策" })}</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#7a7a7a]">
            {t({
              en: "Unless an event page states otherwise, the following policy applies to confirmed SnowForce registrations.",
              zh: (
                <>
                  除活动页面另有说明外，<wbr />本政策适用于<wbr />
                  <span className="whitespace-nowrap">已确认的 SnowForce 活动报名</span>。
                </>
              ),
            })}
          </p>
        </header>

        <section className="mt-10 border-t border-[#e0e0e0] pt-8">
          <h2 className="text-xl font-semibold text-[#1d1d1f]">
            {t({ en: "Event changes and cancellations", zh: "活动变更与取消" })}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-7 text-[#333333]">
            <p>
              {t({
                en: "In rare circumstances, SnowForce reserves the right to modify, postpone, or cancel an event due to weather, transportation, venue conditions, public safety, force majeure, or other reasons beyond SnowForce's control.",
                zh: (
                  <>
                    在极少数特殊情况下，<wbr />
                    <span className="whitespace-nowrap">SnowForce 可因</span>天气、交通、场地、公共安全、不可抗力，
                    <wbr />或其他无法控制的原因，<wbr />更改、推迟或取消活动。
                  </>
                ),
              })}
            </p>
            <p>
              {t({
                en: "SnowForce also reserves the right to cancel an event when the minimum group size is not met.",
                zh: (
                  <>
                    若因成团人数不足等原因无法成行，<wbr />
                    <span className="whitespace-nowrap">SnowForce 保留取消活动的权利。</span>
                  </>
                ),
              })}
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-[#1d1d1f]">
            {t({ en: "Cancellation fees", zh: "取消费用" })}
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-[#7a7a7a]">
            {t({
              en: "Cancellation fees are calculated according to the time remaining before the event begins.",
              zh: "取消费用按距离活动开始的时间计算。",
            })}
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#e0e0e0]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#f5f5f7] text-[#333333]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                    {t({ en: "Cancellation timing", zh: "取消时间" })}
                  </th>
                  <th scope="col" className="w-28 px-4 py-3 font-semibold sm:px-5">
                    {t({ en: "Fee", zh: "费用" })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0e0] text-[#333333]">
                <tr>
                  <td className="px-4 py-4 sm:px-5">
                    {t({ en: "14–8 days before the event", zh: "活动开始前 14–8 日" })}
                  </td>
                  <td className="px-4 py-4 font-semibold sm:px-5">50%</td>
                </tr>
                <tr>
                  <td className="px-4 py-4 sm:px-5">
                    {t({ en: "Within 7 days or on the event day", zh: "活动开始前 7 日内或活动当天" })}
                  </td>
                  <td className="px-4 py-4 font-semibold sm:px-5">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
