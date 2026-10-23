"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useLanguage } from "@/lib/language";
import { respondGuestInvitationAction } from "@/lib/registrations/guest-actions";

export function GuestInvitationForm({ token, attendeeName, eventSlug, waiverText, registrationId, confirmationStatus = "issued", attendanceStatus = "unmarked", approvalStatus = "not_required", qrDataUrl }: {
  token: string; attendeeName: string; eventSlug: string; waiverText: string | null; registrationId?: string;
  confirmationStatus?: "issued" | "accepted" | "declined"; attendanceStatus?: string; qrDataUrl?: string;
  approvalStatus?: "not_required" | "pending" | "approved" | "rejected";
}) {
  const { t } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [bookerBlocked, setBookerBlocked] = useState(false);
  const [result, setResult] = useState<"accepted" | "declined" | "error" | null>(confirmationStatus === "issued" ? null : confirmationStatus);
  if (result === "accepted" || result === "declined") return <div className="card space-y-4"><h1 className="text-2xl font-semibold">{attendeeName} · {eventSlug}</h1><p role="status">{t(result === "accepted"
    ? { en: "Your personal acceptance has been recorded. Staff will check your name and ticket at the event.", zh: "已记录你的个人确认，活动现场工作人员将核验姓名和票据。" }
    : { en: "Your decline has been recorded. Contact the booker about cancellation and the event’s refund terms.", zh: "已记录你的拒绝，请联系代报名人按活动条款办理取消或退款。" })}</p>
    <p className="break-all text-sm">{t({ en: "Ticket", zh: "票据" })}: {registrationId} · {attendanceStatus}</p>
    {approvalStatus === "pending" && <p role="status">{t({ en: "Awaiting staff approval. Your signature is recorded, but attendance is not yet approved.", zh: "等待工作人员审批。签名已记录，但尚未获准参加。" })}</p>}
    {result === "accepted" && !["pending","rejected"].includes(approvalStatus) && qrDataUrl && <Image unoptimized src={qrDataUrl} width={240} height={240} alt={t({ en: "Your personal event ticket", zh: "你的个人活动票据" })} />}
  </div>;
  return <form className="card space-y-5" onSubmit={(e) => {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const decision = submitter instanceof HTMLButtonElement ? submitter.value : "accept";
    data.set("decision", decision);
    startTransition(async () => { try { const response = await respondGuestInvitationAction(data);
      setBookerBlocked("reason" in response && response.reason === "booker_cannot_sign");
      setResult(response.success ? decision === "accept" ? "accepted" : "declined" : "error");
    } catch { setResult("error"); } });
  }}>
    <input type="hidden" name="token" value={token} />
    <h1 className="text-2xl font-semibold">{t({ en: "Your event invitation", zh: "你的活动邀请" })}</h1>
    <p className="text-sm">{attendeeName} · {eventSlug}</p>
    <p className="text-sm leading-6 text-gray-600">{t({ en: "Complete this yourself as the attending adult, or as the attending minor’s legal guardian. A booker cannot sign for an adult friend. Show this ticket and your identity to staff at check-in.", zh: "请由参加活动的成年人本人，或未成年人的法定监护人完成。代报名人不能替成年朋友签署。现场请向工作人员出示此票据及身份证明。" })}</p>
    {waiverText && <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border p-4 text-sm leading-6" tabIndex={0} aria-label={t({ en: "Event waiver", zh: "活动免责条款" })}>{waiverText}</div>}
    <label className="block text-sm">{t({ en: "I am signing as", zh: "签署身份" })}<select name="signerRole" className="input-field mt-2">
      <option value="attendee">{t({ en: "The adult attendee", zh: "成年参加者本人" })}</option>
      <option value="guardian">{t({ en: "The minor attendee’s legal guardian", zh: "未成年参加者的法定监护人" })}</option>
    </select></label>
    <label className="block text-sm">{t({ en: "Your full legal name / electronic signature", zh: "签署人法定全名 / 电子签名" })}<input name="typedName" maxLength={200} className="input-field mt-2" /></label>
    <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name="attested" className="mt-1" />{t({ en: "I am the attendee or their legal guardian, have read and accept the event terms and waiver above, and personally provide this signature. No marketing or photo permission is included.", zh: "我是参加者本人或其法定监护人，已阅读并接受上述活动条款和免责，亲自提供此签名。本次确认不包含营销或肖像授权。" })}</label>
    {result === "error" && <p role="alert" className="text-sm text-red-700">{t(bookerBlocked
      ? { en: "The booker cannot sign for an adult friend. Forward this link so your friend can sign personally in their own browser or signed out of the booker’s account.", zh: "代报名会员不能替成年朋友签署。请将链接转发给朋友，由朋友在自己的浏览器或退出代报名账号后亲自签署。" }
      : { en: "Check your signature and consent. This invitation may have expired, been replaced, or already been used.", zh: "请检查签名和同意选项。邀请也可能已过期、被替换或已使用。" })}</p>}
    <div className="flex flex-wrap gap-3"><button disabled={pending} value="accept" className="btn-primary">{t({ en: "Accept and sign", zh: "接受并签署" })}</button><button disabled={pending} value="decline" className="btn-secondary">{t({ en: "Decline invitation", zh: "拒绝邀请" })}</button></div>
  </form>;
}
