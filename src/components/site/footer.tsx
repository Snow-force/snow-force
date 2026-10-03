"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { shopSupportEmail } from "@/lib/shop/contact";

export function Footer({ supportEmail = shopSupportEmail }: { supportEmail?: string }) {
  const { lang, t } = useLanguage();

  return (
    <footer className="bg-[#f5f5f7] text-[#333333]">
      <div className="mx-auto max-w-[980px] px-4 py-16 sm:px-6">
        <p className={`max-w-3xl text-[12px] leading-[1.45] tracking-[-0.12px] text-[#7a7a7a] ${lang === "zh" ? "break-keep" : ""}`}>
          {t({
            en: "SnowForce is a community snow sports platform for events, training, and mountain days. We are based mainly in the United States, with activities in other regions too.",
            zh: (
              <>
                SnowForce 是面向滑雪社群的活动、训练与雪山体验平台。<wbr />主要在美国开展活动，也会在其他地区组织聚会。
              </>
            ),
          })}
        </p>

        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn title="SnowForce">
            <FooterLink href="/events">{t({ en: "Events", zh: "当前活动" })}</FooterLink>
            <FooterLink href="/shop">{t({ en: "Gear Shop", zh: "装备商城" })}</FooterLink>
            <FooterLink href="/shop/policies">{t({ en: "Shop Shipping & Returns", zh: "商城配送与退换政策" })}</FooterLink>
            <FooterLink href="/recaps">{t({ en: "Recaps", zh: "往期回顾" })}</FooterLink>
            <FooterLink href="/faq">{t({ en: "FAQ", zh: "常见问题" })}</FooterLink>
            <FooterLink href="/refund-policy">{t({ en: "Refund Policy", zh: "退款政策" })}</FooterLink>
            <FooterLink href="/privacy-policy">{t({ en: "Privacy Notice", zh: "隐私守则" })}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t({ en: "Community", zh: "社群" })}>
            <FooterLink href="/about">{t({ en: "About Us", zh: "关于我们" })}</FooterLink>
            <FooterLink href="/member">{t({ en: "Member Area", zh: "会员中心" })}</FooterLink>
            <FooterLink href="/partner">{t({ en: "Partner With Us", zh: "合作咨询" })}</FooterLink>
            <FooterLink href="/merchant">{t({ en: "Merchant", zh: "商家入驻" })}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t({ en: "Contact", zh: "联系方式" })}>
            <li>snowforceclub@gmail.com</li>
            <li>{t({ en: "WeChat: SnowForceClub", zh: "微信：SnowForceClub" })}</li>
            <li>
              <span className="block font-medium text-[#333333]">{t({ en: "Shop customer service", zh: "商城客服" })}</span>
              <a href={`mailto:${supportEmail}`} className="inline-flex min-h-11 items-center break-all text-[#0066cc] underline underline-offset-4">{supportEmail}</a>
            </li>
          </FooterColumn>

          <FooterColumn title={t({ en: "Language", zh: "语言" })}>
            <li>中文</li>
            <li>English</li>
          </FooterColumn>
        </div>

        <div className="mt-10 border-t border-[#e0e0e0] pt-6 text-[12px] leading-none tracking-[-0.12px] text-[#7a7a7a]">
          &copy; {new Date().getFullYear()} SnowForce. {t({ en: "All rights reserved.", zh: "保留所有权利。" })}
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
