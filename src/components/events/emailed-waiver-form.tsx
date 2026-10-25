"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useLanguage } from "@/lib/language";
import { requestWaiverCodeAction, verifyWaiverCodeAction, signEventWaiverAction } from "@/lib/registrations/v2/actions";
import { WaiverAgeFields } from "./waiver-age-fields";

export function EmailedWaiverForm({ token, attendeeName, eventSlug, role, waiverText, status, ready, qrDataUrl, initiallyVerified = false, onRecorded, registrationId, canSign = true, needsAccompaniment = false, eventTitle, eventDate, eventLocation, declarationMode = role === "unconfirmed", adultWaiverText, guardianWaiverText }: {
  token: string; attendeeName: string; eventSlug: string; role: "attendee" | "guardian" | "unconfirmed"; waiverText: string; status: string; ready: boolean; qrDataUrl?: string;
  declarationMode?: boolean; adultWaiverText?: string; guardianWaiverText?: string;
  initiallyVerified?: boolean;
  canSign?: boolean; needsAccompaniment?: boolean;
  eventTitle?: { en: string; zh: string }; eventDate?: string; eventLocation?: { en: string; zh: string };
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
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const effectiveRole = declarationMode ? adultConfirmed ? "attendee" : "guardian" : role;
  const displayedWaiver = declarationMode ? adultConfirmed ? adultWaiverText ?? "" : guardianWaiverText ?? "" : waiverText;
  const recordedTerms = useRef<HTMLDetailsElement>(null);
  function record(data: FormData) { startTransition(async () => { setError(""); try { const r = await signEventWaiverAction(data); if (r.success) { if (onRecorded) await onRecorded(); else router.refresh(); } else setError(t({ en: "Signature could not be recorded. Check your legal name, designated role, consent and email verification; contact staff if another ticket exists.", zh: "无法记录签名，请核对法定全名、指定身份、同意选项及邮箱验证；如已有其他票据请联系工作人员。" })); } catch { setError(t({ en: "Please retry", zh: "请重试" })); } }); }
  if (["signed", "declined", "needs_review"].includes(status)) return <div className="card space-y-4">
    <h1 className="text-2xl font-semibold">{attendeeName} · {eventTitle ? t(eventTitle) : eventSlug}</h1>
    <p>{eventDate} · {eventLocation ? t(eventLocation) : ""}</p>
    {registrationId && <p className="break-all text-xs">{t({ en: "Personal ticket", zh: "个人票据" })}: {registrationId}</p>}
    {needsAccompaniment && <p>{t({ en: "A parent or legal guardian must accompany this child throughout. Staff must verify their presence before the ticket is available. If they leave, the child must stop participating.", zh: "此孩子须由父母或法定监护人全程陪同；工作人员核验到场后才能使用票据。如陪同人离开，孩子须停止参加。" })}</p>}
    <p role="status">{t(status === "declined" ? { en: "Your decline is recorded. Contact the booker or staff about cancellation and refund terms.", zh: "已记录拒签。请联系代报名人或工作人员了解取消及退款条款。" }
      : status === "needs_review" ? { en: "Your signature is recorded. Staff must verify identity or guardian authority before this waiver can be used for check-in.", zh: "签名已记录。工作人员须核验身份或监护资格后，此免责才能用于签到。" }
      : { en: "Your personal waiver is signed. Payment and any required staff approval are checked separately.", zh: "个人免责已签署。付款及所需工作人员审批将分别核验。" })}</p>
    {ready && qrDataUrl ? <Image unoptimized width={240} height={240} src={qrDataUrl} alt={t({ en: "Your personal event ticket", zh: "你的个人活动票据" })} /> : <p>{t({ en: "The event ticket becomes available after all entry requirements are met.", zh: "满足所有入场条件后才会显示个人票据。" })}</p>}
    <details ref={recordedTerms}><summary>{t({ en: "View your waiver terms", zh: "查看本次免责条款" })}</summary><div className="whitespace-pre-wrap text-sm leading-6">{waiverText}</div></details>
    <button className="btn-secondary" type="button" onClick={() => { if (recordedTerms.current) recordedTerms.current.open = true; window.print(); }}>{t({ en: "Print or save this record", zh: "打印或保存本记录" })}</button>
  </div>;
  if (!canSign) return <div className="card"><p role="status">{t({ en: "You will be an adult on the event date. Your adult waiver can only be signed on or after your 18th birthday. Contact staff if you need help.", zh: "你在活动当天将成年。成人免责须等到年满 18 岁后亲自签署；如需协助请联系工作人员。" })}</p></div>;
  return <div className="card space-y-5">
    <h1 className="text-2xl font-semibold">{t(declarationMode ? { en: "Confirm age and sign your waiver", zh: "确认年龄并签署免责" } : role === "guardian" ? { en: "Parent / legal guardian waiver", zh: "父母 / 法定监护人免责签署" } : { en: "Your personal event waiver", zh: "你的个人活动免责" })}</h1>
    <p>{attendeeName} · <a className="underline" target="_blank" rel="noreferrer" href={`/events/${eventSlug}`}>{eventTitle ? t(eventTitle) : eventSlug}</a></p>
    <p>{eventDate} · {eventLocation ? t(eventLocation) : ""}</p>
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
      record(data);
    }}>
      <input type="hidden" name="token" value={token} /><input type="hidden" name="signerRole" value={effectiveRole} />
      <fieldset disabled={pending} className="space-y-5">
      {declarationMode && <WaiverAgeFields adultConfirmed={adultConfirmed} onAdultChange={setAdultConfirmed} />}
      <fieldset key={effectiveRole} className="space-y-5">
      <div tabIndex={0} aria-label={t({ en: "Event waiver", zh: "活动免责条款" })} className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border p-4 text-sm leading-6 print:max-h-none print:overflow-visible">{displayedWaiver}</div>
      <button type="button" className="btn-secondary" onClick={() => window.print()}>{t({ en: "Print or save these terms", zh: "打印或保存本条款" })}</button>
      <label className="block text-sm">{t({ en: "Your full legal name / electronic signature", zh: "签署人法定全名 / 电子签名" })}<input name="typedName" maxLength={200} className="input-field mt-2" /></label>
      {effectiveRole === "guardian" && <label className="flex items-start gap-3 text-sm"><input name="guardianAttested" type="checkbox" />{t({ en: "I am this child’s parent or legally appointed guardian and have authority to act for them. I sign using my own legal name and will provide verification to staff.", zh: "我是此孩子的父母或依法指定的监护人，有权代表此孩子。我以自己的法定姓名签署，并将配合工作人员核验资格。" })}</label>}
      <label className="flex items-start gap-3 text-sm"><input name="attested" type="checkbox" />{t({ en: "I have read and accept the above waiver and personally provide this signature. Marketing and photo consent are separate and are not granted here.", zh: "我已阅读并接受上述免责，并亲自提供签名。营销和肖像授权独立于此，不在本次签署中授予。" })}</label>
      </fieldset>
      </fieldset>
      <div className="flex flex-wrap gap-3"><button disabled={pending || !displayedWaiver} value="accept" className="btn-primary">{t({ en: "Accept and sign", zh: "接受并签署" })}</button><button type="button" disabled={pending} onClick={(e) => { const form = e.currentTarget.form; if (!form) return; const data = new FormData(form); data.set("decision", "decline"); record(data); }} className="btn-secondary">{t({ en: "Decline waiver", zh: "拒绝签署" })}</button></div>
      <button type="button" disabled={pending} onClick={() => { setVerified(false); setCode(""); }} className="min-h-11 text-sm underline">{t({ en: "Verify email again", zh: "重新验证邮箱" })}</button>
    </form>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-sm"><a className="underline" href="mailto:hello@snow-force.com">hello@snow-force.com</a></p>
  </div>;
}
