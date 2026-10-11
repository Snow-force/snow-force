"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { newcomerSavings, type NewcomerPolicy } from "@/lib/shop/newcomer-contract";

export function NewcomerWelcome({ policy }: { policy: NewcomerPolicy }) {
  const { lang, t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, [open]);
  return <>
    <div className="flex flex-wrap items-center justify-center gap-3 bg-[#f0f7ff] px-5 py-3 text-sm text-[#1d1d1f]">
      <p>{t({ en: "Your welcome gear discount", zh: "你的商城新人优惠" })} · {newcomerSavings(policy, lang)}</p>
      <button onClick={() => setOpen(true)} className="min-h-10 font-semibold text-[#0066cc] underline">{t({ en: "Get my code", zh: "领取专属折扣码" })}</button>
    </div>
    <dialog ref={dialog} aria-labelledby="newcomer-title" aria-describedby="newcomer-description" onCancel={() => setOpen(false)} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-[18px] bg-white p-7 text-[#1d1d1f] shadow-xl backdrop:bg-black/60 sm:p-10">
      <button autoFocus type="button" onClick={() => setOpen(false)} aria-label={t({ en: "Close welcome offer", zh: "关闭新人优惠弹窗" })} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full hover:bg-[#f5f5f7]"><X size={20} /></button>
      <p className="pt-3 text-xs font-semibold tracking-widest text-[#7a7a7a]">SNOWFORCE / WELCOME</p>
      <h2 id="newcomer-title" className="mt-5 text-3xl font-semibold">{t({ en: "Your first gear perk.", zh: "欢迎加入，装备优惠送给你。" })}</h2>
      <p className="my-6 text-4xl font-semibold text-[#0066cc]">{newcomerSavings(policy, lang)}</p>
      <p id="newcomer-description" className="text-sm leading-6 text-[#666]">{t({ en: "Create your SnowForce account and verify your email. Your personal shop code will arrive with your welcome email at your registered address. One use per person, account and verified email.", zh: "注册 SnowForce 账户并验证邮箱，你的个人商城折扣码将随欢迎信发送到注册邮箱。每人、每个账户及已验证邮箱仅限使用一次。" })}</p>
      <p className="mt-3 text-xs leading-6 text-[#666]">{t({ en: `Valid for ${policy.days} days after issue. No minimum spend. Regular-price USD merchandise only. Cannot be combined with other promotions; shipping and tax are excluded.`, zh: `领取后 ${policy.days} 天内有效，无最低消费，仅限美元计价原价商品，不与其他优惠叠加，不含运费和税费。` })}{policy.minimum > 0 && t({ en: ` Minimum merchandise spend: $${policy.minimum}.`, zh: ` 商品最低消费：$${policy.minimum}。` })}</p>
      <Link href="/member?mode=register&next=%2Fmember%2Fwelcome" className="btn-primary mt-7 w-full">{t({ en: "Register & get my code", zh: "注册并领取折扣码" })}</Link>
      <Link href="/member?next=%2Fmember%2Fwelcome" className="mt-3 flex min-h-11 items-center justify-center text-sm text-[#0066cc]">{t({ en: "Already have an account? Sign in", zh: "已有账户？登录查看" })}</Link>
    </dialog>
  </>;
}
