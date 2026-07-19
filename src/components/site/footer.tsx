"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-[#f5f5f7] text-[#333333]">
      <div className="mx-auto max-w-[980px] px-4 py-16 sm:px-6">
        <p className="max-w-3xl text-[12px] leading-[1.45] tracking-[-0.12px] text-[#7a7a7a]">
          {t({
            en: "SnowForce is a community snow sports platform for events, training, and mountain days. We are based mainly in the United States, with activities in other regions too.",
            zh: "SnowForce 是面向滑雪社群的活动、训练与雪山体验平台。我们主要在美国开展活动，也会在其他地区组织聚会。",
          })}
        </p>

        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn title="SnowForce">
            <FooterLink href="/events">{t({ en: "Events", zh: "当前活动" })}</FooterLink>
            <FooterLink href="/recaps">{t({ en: "Recaps", zh: "往期回顾" })}</FooterLink>
            <FooterLink href="/faq">{t({ en: "FAQ", zh: "常见问题" })}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t({ en: "Community", zh: "社群" })}>
            <FooterLink href="/about">{t({ en: "About Us", zh: "关于我们" })}</FooterLink>
            <FooterLink href="/member">{t({ en: "Member Area", zh: "会员中心" })}</FooterLink>
            <FooterLink href="/partner">{t({ en: "Partner With Us", zh: "合作咨询" })}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t({ en: "Contact", zh: "联系方式" })}>
<li>snowforceclub@gmail.com</li>
          <li>{t({ en: "WeChat: SnowForceClub", zh: "微信：SnowForceClub" })}</li>
          </FooterColumn>

          <FooterColumn title={t({ en: "Language", zh: "语言" })}>
            <li>中文</li>
            <li>English</li>
          </FooterColumn>
        </div>

        <div className="mt-10 border-t border-[#e0e0e0] pt-6 text-[12px] tracking-[-0.12px] text-[#7a7a7a]">
          <p className="leading-none">
            &copy; {new Date().getFullYear()} SnowForce. {t({ en: "All rights reserved.", zh: "保留所有权利。" })}
          </p>
          <p className="mt-4 max-w-3xl leading-[1.45]">
            {t({
              en: "Refund and itinerary change statement: In rare circumstances, SnowForce reserves the right to modify, postpone, or cancel an event due to weather, transportation, venue conditions, public safety, force majeure, or other reasons beyond SnowForce's control. SnowForce also reserves the right to cancel an event if the minimum group size is not met. Unless otherwise stated on the event page, cancellations after registration confirmation are subject to fees based on timing: 50% for cancellations 14-8 days before the event, and 100% for cancellations within 7 days of the event or on the event day.",
              zh: "退款及行程变更声明：在极少数特殊情况下，因天气、交通、场地、公共安全、不可抗力或其他 SnowForce 无法控制的原因，SnowForce 保留更改、推迟或取消活动的权利。若因成团人数不足等原因无法成行，SnowForce 亦保留取消活动的权利。除活动页面另有说明外，报名确认后如需取消，将按活动开始前时间计算相关费用；活动开始前 14-8 日取消收取 50% 费用，活动开始前 7 日内或活动当天取消收取 100% 费用。",
            })}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold leading-[1.29] tracking-[-0.224px] text-[#333333]">
        {title}
      </h3>
      <ul className="mt-2 space-y-2 text-[12px] leading-[1.45] tracking-[-0.12px] text-[#7a7a7a]">
        {children}
      </ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="transition hover:text-[#0066cc]">
        {children}
      </Link>
    </li>
  );
}
