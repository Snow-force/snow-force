"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useLanguage } from "@/lib/language";
import { requestWaiverCodeAction, verifyWaiverCodeAction, signEventWaiverAction } from "@/lib/registrations/v2/actions";

export function EmailedWaiverForm({ token, attendeeName, eventSlug, role, waiverText, status, ready, qrDataUrl, initiallyVerified = false, onRecorded, registrationId }: {
  token: string; attendeeName: string; eventSlug: string; role: "attendee" | "guardian"; waiverText: string; status: string; ready: boolean; qrDataUrl?: string;
  initiallyVerified?: boolean;
  onRecorded?: () => Promise<void>;
  registrationId?: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [verified, setVerified] = useState(initiallyVerified);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (["signed", "declined", "needs_review"].includes(status)) return <div className="card space-y-4">
    <h1 className="text-2xl font-semibold">{attendeeName} · {eventSlug}</h1>
    {registrationId && <p className="break-all text-xs">{t({ en: "Personal ticket", zh: "个人票据" })}: {registrationId}</p>}
    <p role="status">{t(status === "declined" ? { en: "Your decline is recorded. Contact the booker or staff about cancellation and refund terms.", zh: "已记录拒签。请联系代报名人或工作人员了解取消及退款条款。" }
      : status === "needs_review" ? { en: "Your signature is recorded. Staff must verify identity or guardian authority before this waiver can be used for check-in.", zh: "签名已记录。工作人员须核验身份或监护资格后，此免责才能用于签到。" }
      : { en: "Your personal waiver is signed. Payment and any required staff approval are checked separately.", zh: "个人免责已签署。付款及所需工作人员审批将分别核验。" })}</p>
    {ready && qrDataUrl ? <Image unoptimized width={240} height={240} src={qrDataUrl} alt={t({ en: "Your personal event ticket", zh: "你的个人活动票据" })} /> : <p>{t({ en: "The event ticket becomes available after all entry requirements are met.", zh: "满足所有入场条件后才会显示个人票据。" })}</p>}
  </div>;
  return <div className="card space-y-5">
    <h1 className="text-2xl font-semibold">{t(role === "guardian" ? { en: "Parent / legal guardian waiver", zh: "父母 / 法定监护人免责签署" } : { en: "Your personal event waiver", zh: "你的个人活动免责" })}</h1>
    <p>{attendeeName} · {eventSlug}</p>
    <p className="text-sm">{t({ en: "First verify the designated email. Codes and links are personal; do not share them. Each attendee needs their own signature.", zh: "请先验证指定邮箱。验证码及链接仅供本人使用，请勿转发；每位参加者须分别签署。" })}</p>
    {!verified ? <div className="space-y-3">
      <button type="button" disabled={pending} className="btn-secondary" onClick={() => startTransition(async () => {
        setError(""); try { const form = new FormData(); form.set("token", token); const r = await requestWaiverCodeAction(form); if (r.success) setMessage(t({ en: "Code queued for the designated signer’s email. Allow a moment for delivery.", zh: "验证码已为指定签署人排队发送，请稍候查看邮箱。" })); else setError(t({ en: "Could not queue a code. Wait a minute or contact staff.", zh: "暂时无法发送验证码，请稍后重试或联系工作人员。" })); } catch { setError(t({ en: "Please retry", zh: "请重试" })); }
      })}>{t({ en: "Email me a verification code", zh: "向签署邮箱发送验证码" })}</button>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); startTransition(async () => {
        setError(""); try { const form = new FormData(); form.set("token", token); form.set("code", code); const r = await verifyWaiverCodeAction(form); if (r.success) { setVerified(true); setMessage(""); } else setError(t({ en: "Invalid or expired code. Repeated attempts are limited.", zh: "验证码无效或过期；系统限制重复尝试次数。" })); } catch { setError(t({ en: "Please retry", zh: "请重试" })); }
      }); }}><label className="block text-sm">{t({ en: "Six-digit email code", zh: "六位邮箱验证码" })}<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="input-field mt-2" /></label><button disabled={pending} className="btn-primary">{t({ en: "Verify email", zh: "验证邮箱" })}</button></form>
    </div> : <form className="space-y-5" onSubmit={(e) => {
      e.preventDefault(); const data = new FormData(e.currentTarget); const submitter = (e.nativeEvent as SubmitEvent).submitter;
      data.set("decision", submitter instanceof HTMLButtonElement ? submitter.value : "accept");
      startTransition(async () => { setError(""); try { const r = await signEventWaiverAction(data); if (r.success) { if (onRecorded) await onRecorded(); else router.refresh(); } else setError(t({ en: "Signature could not be recorded. Check your legal name, designated role, consent and email verification; contact staff if another ticket exists.", zh: "无法记录签名，请核对法定全名、指定身份、同意选项及邮箱验证；如已有其他票据请联系工作人员。" })); } catch { setError(t({ en: "Please retry", zh: "请重试" })); } });
    }}>
      <input type="hidden" name="token" value={token} /><input type="hidden" name="signerRole" value={role} />
      <div tabIndex={0} aria-label={t({ en: "Event waiver", zh: "活动免责条款" })} className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border p-4 text-sm leading-6">{waiverText}</div>
      <label className="block text-sm">{t({ en: "Your full legal name / electronic signature", zh: "签署人法定全名 / 电子签名" })}<input name="typedName" maxLength={200} className="input-field mt-2" /></label>
      {role === "guardian" && <label className="flex items-start gap-3 text-sm"><input name="guardianAttested" type="checkbox" />{t({ en: "I am this child’s parent or legally appointed guardian and have authority to act for them. I sign using my own legal name and will provide verification to staff.", zh: "我是此孩子的父母或依法指定的监护人，有权代表此孩子。我以自己的法定姓名签署，并将配合工作人员核验资格。" })}</label>}
      <label className="flex items-start gap-3 text-sm"><input name="attested" type="checkbox" />{t({ en: "I have read and accept the above waiver and personally provide this signature. Marketing and photo consent are separate and are not granted here.", zh: "我已阅读并接受上述免责，并亲自提供签名。营销和肖像授权独立于此，不在本次签署中授予。" })}</label>
      <div className="flex flex-wrap gap-3"><button disabled={pending} value="accept" className="btn-primary">{t({ en: "Accept and sign", zh: "接受并签署" })}</button><button disabled={pending} value="decline" className="btn-secondary">{t({ en: "Decline waiver", zh: "拒绝签署" })}</button></div>
      <button type="button" disabled={pending} onClick={() => { setVerified(false); setCode(""); }} className="min-h-11 text-sm underline">{t({ en: "Verify email again", zh: "重新验证邮箱" })}</button>
    </form>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-sm"><a className="underline" href="mailto:hello@snow-force.com">hello@snow-force.com</a></p>
  </div>;
}
