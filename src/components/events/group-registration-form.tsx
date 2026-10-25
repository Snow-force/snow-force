"use client";

import { useRef, useState, useTransition } from "react";
import { useLanguage } from "@/lib/language";
import type { Event, MemberProfile } from "@/lib/types";
import type { DeclaredParticipantInput } from "@/lib/registrations/v2/age-declaration";
import { createEventBookingAction } from "@/lib/registrations/v2/actions";
import { participantQuestions } from "@/lib/registrations/participation";
import { renderQuestion } from "./registration-form";
import { EventBookingList } from "@/components/members/event-booking-list";
import type { BookingView } from "@/lib/registrations/v2/repository";

export function GroupRegistrationForm({ event, profile }: { event: Event; profile: MemberProfile }) {
  const { lang, t } = useLanguage();
  const [participants, setParticipants] = useState<DeclaredParticipantInput[]>([]);
  const [permission, setPermission] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<BookingView | null>(null);
  const requestKey = useRef<string | null>(null);
  function add(kind: "self" | "proxy") {
    setParticipants((current) => [...current, { key: crypto.randomUUID(), kind, signerEmail: kind === "self" ? profile.email : "", answers: kind === "self" ? { name: profile.displayName, email: profile.email } : {} }]);
  }
  function update(index: number, patch: Partial<DeclaredParticipantInput>) { setParticipants((current) => current.map((p, i) => i === index ? { ...p, ...patch } : p)); }
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
        return <fieldset key={p.key} className="space-y-4 rounded-xl border p-4">
          <legend className="px-2 font-semibold">{t({ en: `Participant ${index + 1}`, zh: `参加者 ${index + 1}` })} · {t(p.kind === "self" ? { en: "Myself", zh: "本人" } : { en: "Friend", zh: "朋友" })}</legend>
          {participantQuestions(event.registrationQuestions, "proxy").filter((q) => q.key !== "email").map((q) => renderQuestion({ ...q, key: `${p.key}-${q.key}` }, p.answers[q.key], (value) => update(index, { answers: { ...p.answers, [q.key]: value } }), undefined, lang))}
          <label className="block text-sm font-medium">{t({ en: "Waiver signing email", zh: "免责签署邮箱" })}<input type="email" required value={p.signerEmail} onChange={(e) => update(index, { signerEmail: e.target.value })} className="input-field mt-2" /></label>
          <p className="text-xs leading-5 text-gray-600">{t({ en: "Use the adult attendee’s own email, or a parent/legal guardian’s email for a minor. Age is confirmed when signing the waiver; no birth date is collected. Under 14 requires a parent/legal guardian throughout the activity.", zh: "成年人填写本人邮箱；未成年人填写父母或法定监护人邮箱。签署免责时确认是否成年，不收集出生日期。14 岁以下须由父母或法定监护人全程陪同。" })}</p>
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
