"use client";

import Link from "next/link";
import { useState } from "react";
import { acceptMemberConsent, cancelMemberConsent } from "@/lib/members/actions";
import {
  CURRENT_EVENT_MEDIA_POLICY_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
} from "@/lib/members/member-consent-policy";
import { useLanguage } from "@/lib/language";

export function MemberConsentStep({ error, next }: { error?: string; next: string }) {
  const { t } = useLanguage();
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  return (
    <main className="min-h-[calc(100svh-64px)] bg-[#eef2f6] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <div className="mx-auto grid w-full max-w-[1120px] gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(520px,1.18fr)] lg:items-start lg:gap-14">
        <section className="pt-2 lg:sticky lg:top-24 lg:pt-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#005bea]">SnowForce membership</p>
          <h1 className="mt-4 max-w-[520px] text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] text-[#13171d] sm:text-[46px] lg:text-[54px]">
            {t({ en: "One last step before your next mountain day.", zh: "开始下一次雪山行程前，还差最后一步。" })}
          </h1>
          <p className="mt-5 max-w-[500px] text-[16px] leading-7 text-[#5d6674] sm:text-[17px] sm:leading-8">
            {t({
              en: "Your identity is verified. Review the current privacy terms to activate your SnowForce member profile.",
              zh: "你的身份已经验证。请确认当前隐私守则，以启用 SnowForce 正式会员资料。",
            })}
          </p>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-[#dce2e9] bg-white shadow-[0_24px_70px_rgba(22,34,51,0.10)] sm:rounded-[34px]">
          <header className="border-b border-[#e6e9ed] px-6 py-6 sm:px-9 sm:py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#667085]">
              {t({ en: "Required privacy consent", zh: "必要隐私授权" })}
            </p>
            <h2 className="mt-2 text-[27px] font-semibold tracking-[-0.025em] text-[#17191c] sm:text-[34px]">
              {t({ en: "Privacy Notice", zh: "隐私守则" })}
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-[#667085] sm:text-[15px]">
              {t({
                en: `Current version: ${CURRENT_PRIVACY_POLICY_VERSION}`,
                zh: `当前版本：${CURRENT_PRIVACY_POLICY_VERSION}`,
              })}
            </p>
          </header>

          <div className="space-y-5 px-6 py-6 sm:px-9 sm:py-8">
            {error ? (
              <div role="alert" className="rounded-[16px] border border-[#f2c8c8] bg-[#fff4f4] px-4 py-3 text-[14px] leading-6 text-[#9b2525]">
                {t({
                  en: error === "required" ? "Accept the Privacy Notice to continue." : "We could not save your choice. Please try again.",
                  zh: error === "required" ? "请同意《隐私守则》后继续。" : "暂时无法保存你的选择，请重试。",
                })}
              </div>
            ) : null}

            <div className="rounded-[20px] border border-[#e2e6eb] bg-[#f7f8fa] p-5 text-[14px] leading-7 text-[#4d5664] sm:p-6 sm:text-[15px]">
              <p>{t({ en: "The required policy covers account operation, event registration, payments, safety communications, security, and your privacy rights.", zh: "必要隐私守则涵盖账号运营、活动报名、付款、安全通知、服务安全以及你的隐私权利。" })}</p>
              <Link href="/privacy-policy" target="_blank" className="mt-3 inline-flex font-semibold text-[#005bea] underline underline-offset-4">
                {t({ en: "Read the complete Privacy Notice", zh: "阅读完整《隐私守则》" })}
              </Link>
            </div>

            <form action={acceptMemberConsent} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <label className="flex items-start gap-3 rounded-[18px] border border-[#d9dee5] px-4 py-4 text-[14px] leading-6 text-[#2f3743] sm:text-[15px]">
                <input
                  name="privacyPolicyAccepted"
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                  required
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#abb4c0] text-[#005bea]"
                />
                <span>
                  <span className="block font-semibold">{t({ en: "I have read and agree to the Privacy Notice.", zh: "我已阅读并同意《隐私守则》。" })}</span>
                  <span className="mt-1 block text-[13px] text-[#737d8b]">{t({ en: "Required to activate and use a SnowForce membership.", zh: "这是启用和使用 SnowForce 会员身份的必要授权。" })}</span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-[18px] border border-[#d9dee5] px-4 py-4 text-[14px] leading-6 text-[#2f3743] sm:text-[15px]">
                <input name="eventMediaSocialConsent" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#abb4c0] text-[#005bea]" />
                <span>
                  <span className="block font-semibold">{t({ en: "Event photo and video permission", zh: "活动照片和视频授权" })}</span>
                  <span className="mt-1 block text-[13px] text-[#737d8b]">
                    {t({
                      en: `Optional. Allow SnowForce to use event photos and videos on social media. Version ${CURRENT_EVENT_MEDIA_POLICY_VERSION}.`,
                      zh: `可选。允许 SnowForce 将活动照片和视频用于社交媒体。版本 ${CURRENT_EVENT_MEDIA_POLICY_VERSION}。`,
                    })}
                  </span>
                </span>
              </label>

              <button disabled={!privacyAccepted} className="auth-primary-button min-h-[52px] disabled:cursor-not-allowed disabled:bg-[#d8dde5] disabled:text-[#8b94a3]">
                {t({ en: "Agree and continue", zh: "同意并继续" })}
              </button>
            </form>

            <form action={cancelMemberConsent}>
              <button className="min-h-11 w-full rounded-full border border-[#d9dee5] px-5 text-[14px] font-semibold text-[#596273] transition hover:bg-[#f5f6f8]">
                {t({ en: "Cancel and sign out", zh: "取消并退出登录" })}
              </button>
            </form>
            <p className="text-center text-[12px] leading-5 text-[#8a93a1]">
              {t({ en: "Canceling does not create a new member profile.", zh: "取消后不会创建新的正式会员资料。" })}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
