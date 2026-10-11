"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { claimNewcomerAction } from "@/lib/shop/newcomer-actions";
import { newcomerSavings, type NewcomerResult } from "@/lib/shop/newcomer-contract";

export function NewcomerBenefit({ verified, standalone = false }: { verified: boolean; standalone?: boolean }) {
  const { lang, t } = useLanguage();
  const [result, setResult] = useState<NewcomerResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!verified) return;
    let current = true;
    void claimNewcomerAction().then(value => { if (current) setResult(value); }).catch(() => { if (current) setResult({ status: "unavailable" }); });
    return () => { current = false; };
  }, [verified, retry]);
  if (!standalone && ["disabled", "ineligible", "signed-out"].includes(result?.status ?? "")) return null;
  if (!verified) return <p className="rounded-[18px] border border-[#dbe1d7] bg-white p-5 text-sm">{t({ en: "Verify your email to receive your personal newcomer shop code, when eligible.", zh: "验证邮箱后，符合条件的新会员即可领取个人商城新人折扣码。" })} <Link href="/member/account-settings" className="text-[#0066cc] underline">{t({ en: "Account settings", zh: "查看账号设置" })}</Link></p>;
  if (!result) return standalone ? <p role="status">{t({ en: "Loading your welcome offer…", zh: "正在加载你的新人优惠…" })}</p> : null;
  return <section aria-label={t({ en: "Newcomer shop discount", zh: "商城新人折扣" })} className="rounded-[18px] border border-[#dbe1d7] bg-white p-5 sm:p-6">
    <h2 className="text-lg font-semibold">{t({ en: "Your welcome gear discount", zh: "你的商城新人优惠" })}</h2>
    {result.status === "ready" ? <>
      <p className="mt-3 font-semibold text-[#0066cc]">{newcomerSavings(result.policy, lang)}</p>
      {result.emailStatus && <p role="status" className="mt-2 text-sm text-[#666]">{t(result.emailStatus === "accepted" ? { en: "Your welcome email with this code has been submitted for delivery to your registered email address. Check your spam folder too.", zh: "包含此折扣码的欢迎邮件已提交发送至注册邮箱，也请查看垃圾邮件文件夹。" } : result.emailStatus === "pending" ? { en: "Your welcome email with this code is being prepared for your registered email address.", zh: "包含此折扣码的欢迎邮件正在准备发送至注册邮箱。" } : { en: "Welcome email delivery is currently unavailable. You can copy your code here.", zh: "欢迎邮件目前暂时无法发送，你仍可在此复制折扣码。" })}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3"><code className="break-all rounded-lg bg-[#f5f5f7] p-3 text-sm">{result.code}</code><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(result.code); setCopied(true); } catch { setCopied(false); } }} className="min-h-11 text-sm text-[#0066cc] underline">{t(copied ? { en: "Copied", zh: "已复制" } : { en: "Copy code", zh: "复制折扣码" })}</button></div>
      <p className="mt-3 text-xs leading-6 text-[#666]">{t({ en: "One use per person, account and verified email. No minimum spend. Regular-price items only; cannot be combined with other promotions. Expires", zh: "每人、每个账户及已验证邮箱仅限一次。无最低消费，仅限原价商品，不与其他优惠叠加。有效期至" })} {new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.endsAt))}.{result.policy.minimum > 0 && t({ en: ` Minimum merchandise spend: $${result.policy.minimum}.`, zh: ` 商品最低消费：$${result.policy.minimum}。` })} {t({ en: "Enter this code in your cart. Final savings are confirmed at checkout.", zh: "在购物车输入此码，最终优惠以结账核验为准。" })}</p>
      <Link href="/shop" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#0066cc]">{t({ en: "Shop with my code", zh: "前往商城使用" })}</Link>
    </> : <p role="status" className="mt-3 text-sm text-[#666]">{t(result.status === "used" ? { en: "Your welcome code has been used.", zh: "你的新人折扣码已使用。" } : result.status === "expired" ? { en: "Your welcome code has expired.", zh: "你的新人折扣码已失效。" } : result.status === "disabled" ? { en: "Welcome offers are not currently active.", zh: "新人优惠目前尚未开放。" } : result.status === "ineligible" ? { en: "This account does not qualify for the current welcome offer.", zh: "此账户不符合当前新人优惠的领取条件。" } : result.status === "signed-out" ? { en: "Sign in with a verified account to view your welcome code.", zh: "请登录已验证邮箱的账户查看新人折扣码。" } : { en: "Your welcome offer is temporarily unavailable.", zh: "新人优惠暂时无法加载。" })}{result.status === "unavailable" && <button onClick={() => setRetry(value => value + 1)} className="ml-3 min-h-11 text-[#0066cc] underline">{t({ en: "Try again", zh: "重试" })}</button>}</p>}
    {standalone && <Link href="/member" className="mt-3 inline-flex min-h-11 items-center text-sm text-[#0066cc] underline">{t({ en: "Back to my account", zh: "返回会员中心" })}</Link>}
  </section>;
}
