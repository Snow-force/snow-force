"use client";

import { useRef, useState, useTransition } from "react";
import { useLanguage } from "@/lib/language";
import type { Event, MemberProfile } from "@/lib/types";
import type { ParticipantInput } from "@/lib/registrations/v2/participants";
import { signerRoleOnEventDate } from "@/lib/registrations/v2/participants";
import { createEventBookingAction } from "@/lib/registrations/v2/actions";
import { participantQuestions } from "@/lib/registrations/participation";
import { renderQuestion } from "./registration-form";
import { EventBookingList } from "@/components/members/event-booking-list";
import type { BookingView } from "@/lib/registrations/v2/repository";

export function GroupRegistrationForm({ event, profile }: { event: Event; profile: MemberProfile }) {
  const { lang, t } = useLanguage();
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);
  const [permission, setPermission] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<BookingView | null>(null);
  const requestKey = useRef<string | null>(null);
  function add(kind: "self" | "proxy") {
    setParticipants((current) => [...current, { key: crypto.randomUUID(), kind, dateOfBirth: "", attendeeEmail: kind === "self" ? profile.email : "", guardianName: "", guardianEmail: "", guardianRelationship: "parent", answers: kind === "self" ? { name: profile.displayName, email: profile.email } : {} }]);
  }
  function update(index: number, patch: Partial<ParticipantInput>) { setParticipants((current) => current.map((p, i) => i === index ? { ...p, ...patch } : p)); }
  if (booking) return <EventBookingList bookings={[booking]} />;
  const originalAmount = event.paymentModel === "free" ? 0 : event.paymentModel === "deposit" ? event.depositAmount : event.fullPaymentAmount;
  return <form className="card space-y-5" onSubmit={(e) => {
    e.preventDefault(); setError("");
    startTransition(async () => {
      try {
        const form = new FormData(); form.set("eventSlug", event.slug); form.set("requestKey", requestKey.current ??= crypto.randomUUID()); form.set("participants", JSON.stringify(participants)); form.set("permission", permission ? "on" : ""); form.set("lang", lang);
        const result = await createEventBookingAction(form);
        if (result.success) setBooking(result.booking); else setError(result.error);
      } catch { setError(t({ en: "Could not submit. Your details are retained; retry this same form.", zh: "提交失败，资料已保留，请在此表单重试。" })); }
    });
  }}>
    <h3 className="text-xl font-semibold">{t({ en: "Register participants", zh: "填写参加者" })}</h3>
    <p className="text-sm leading-6">{t({ en: "Add yourself, friends, or both. Each person has one place, an individual payment and their own waiver. A booker who is not attending does not use a place.", zh: "可仅报名自己、仅替朋友报名，或一起报名。每人一个名额、单独付款及签署免责；代报名人不参加就不占名额。" })}</p>
    <p className="text-sm"><a className="underline" href="mailto:hello@snow-force.com">hello@snow-force.com</a></p>
    <fieldset disabled={pending} className="space-y-6">
      {participants.map((p, index) => {
        const role = signerRoleOnEventDate(p.dateOfBirth, event.eventDate);
        return <fieldset key={p.key} className="space-y-4 rounded-xl border p-4">
          <legend className="px-2 font-semibold">{t({ en: `Participant ${index + 1}`, zh: `参加者 ${index + 1}` })} · {t(p.kind === "self" ? { en: "Myself", zh: "本人" } : { en: "Friend", zh: "朋友" })}</legend>
          {participantQuestions(event.registrationQuestions, "proxy").filter((q) => q.key !== "email").map((q) => renderQuestion({ ...q, key: `${p.key}-${q.key}` }, p.answers[q.key], (value) => update(index, { answers: { ...p.answers, [q.key]: value } }), undefined, lang))}
          <label className="block text-sm font-medium">{t({ en: "Date of birth", zh: "出生日期" })}<input aria-label={t({ en: `Participant ${index + 1} birth date`, zh: `参加者 ${index + 1} 出生日期` })} type="date" required max={event.eventDate} value={p.dateOfBirth} onChange={(e) => update(index, { dateOfBirth: e.target.value })} className="input-field mt-2" /></label>
          <p className="text-xs text-gray-600">{t({ en: `Age is assessed on the event’s local start date: ${event.eventDate}. Birth dates are not shown on tickets or exports.`, zh: `按活动当地开始日 ${event.eventDate} 判断年龄；出生日期不会出现在票据或导出名单中。` })}</p>
          {role === "attendee" && <label className="block text-sm font-medium">{t({ en: "Attendee’s own email", zh: "参加者本人邮箱" })}<input type="email" required value={p.attendeeEmail} disabled={p.kind === "self"} onChange={(e) => update(index, { attendeeEmail: e.target.value })} className="input-field mt-2" /></label>}
          {role === "guardian" && <>
            <p role="note" className="text-sm">{t({ en: "Under 18 on the event date: a parent or legal guardian must verify their email and sign. Staff will review guardian authority before check-in.", zh: "活动当天未满 18 岁：由父母或法定监护人验证邮箱并签署，签到前工作人员将核验监护资格。" })}</p>
            <label className="block text-sm">{t({ en: "Guardian’s legal name", zh: "监护人法定全名" })}<input required maxLength={200} value={p.guardianName} onChange={(e) => update(index, { guardianName: e.target.value })} className="input-field mt-2" /></label>
            <label className="block text-sm">{t({ en: "Guardian’s email", zh: "监护人邮箱" })}<input required type="email" value={p.guardianEmail} onChange={(e) => update(index, { guardianEmail: e.target.value })} className="input-field mt-2" /></label>
            <label className="block text-sm">{t({ en: "Legal relationship", zh: "法定关系" })}<select value={p.guardianRelationship} onChange={(e) => update(index, { guardianRelationship: e.target.value })} className="input-field mt-2"><option value="parent">{t({ en: "Parent", zh: "父母" })}</option><option value="legal_guardian">{t({ en: "Legal guardian", zh: "法定监护人" })}</option></select></label>
          </>}
          {event.paymentModel !== "free" && <label className="block text-sm">{t({ en: "Coupon for this participant (optional)", zh: "此参加者的优惠码（选填）" })}<input maxLength={32} value={p.couponCode ?? ""} onChange={(e) => update(index, { couponCode: e.target.value.toUpperCase() })} className="input-field mt-2" /></label>}
          <button type="button" className="min-h-11 text-sm text-red-700 underline" onClick={() => setParticipants((current) => current.filter((_, i) => i !== index))}>{t({ en: "Remove participant", zh: "移除此人" })}</button>
        </fieldset>;
      })}
      <div className="flex flex-wrap gap-3">
        {!participants.some((p) => p.kind === "self") && <button type="button" className="btn-secondary" onClick={() => add("self")}>{t({ en: "Add myself", zh: "添加本人" })}</button>}
        {event.allowProxyRegistrations && participants.filter((p) => p.kind === "proxy").length < (event.maxProxyRegistrations ?? 5) && <button type="button" className="btn-secondary" onClick={() => add("proxy")}>{t({ en: "Add a friend", zh: "添加朋友" })}</button>}
      </div>
      <p className="text-sm font-semibold">{t({ en: `${participants.length} places · ${originalAmount ?? 0} ${event.depositCurrency.toUpperCase()} per person · ${participants.length * (originalAmount ?? 0)} ${event.depositCurrency.toUpperCase()} total before individual coupons`, zh: `${participants.length} 个名额 · 每人 ${originalAmount ?? 0} ${event.depositCurrency.toUpperCase()} · 个人优惠前合计 ${participants.length * (originalAmount ?? 0)} ${event.depositCurrency.toUpperCase()}` })}</p>
      {event.requiresApproval && <p role="note" className="text-sm text-amber-900">{t({ en: "Each participant needs staff approval in addition to payment and a valid waiver.", zh: "每人除付款和有效免责外，还需工作人员审批。" })}</p>}
      <p className="text-sm">{t({ en: "Payments are separate. If a payment fails, the other participants’ completed payments remain valid. Unsigned or declined waivers do not trigger an automatic refund.", zh: "每人独立付款；某人付款失败不影响其他人已完成的付款。未签或拒签不会自动触发退款。" })} <a href="/refund-policy" target="_blank" rel="noreferrer" className="underline">{t({ en: "Refund terms", zh: "退款条款" })}</a></p>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={permission} onChange={(e) => setPermission(e.target.checked)} />{t({ en: "I have permission to submit these details. Every adult or legal guardian must sign personally. This does not grant marketing or photo consent.", zh: "我已获授权提交这些资料；成年人或法定监护人须亲自签署。本次提交不代表营销订阅或肖像授权。" })}</label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={pending || !participants.length} className="btn-primary w-full">{t(pending ? { en: "Saving participants…", zh: "正在保存…" } : { en: "Save and continue to individual payments", zh: "保存并分别付款" })}</button>
  </form>;
}
