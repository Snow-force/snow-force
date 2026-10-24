"use client";

import { useState, useTransition } from "react";
import { useLanguage } from "@/lib/language";
import type { Registration } from "@/lib/types";
import { staffGuestCheckinAction, staffGuestInvitationAction, staffRevokeGuestInvitationAction, staffReviewProxyRegistrationAction } from "@/lib/registrations/guest-actions";

export function GuestRegistrationControl({ registration }: { registration: Registration }) {
  const { t } = useLanguage();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  if (registration.waiverParticipantId) return <a className="mt-3 block min-h-11 text-blue-700 underline" href={`/admin/events/${registration.eventSlug}/waivers`}>{t({ en: "Manage verified waiver / guardian / check-in", zh: "管理邮箱验证免责 / 监护人 / 签到" })}</a>;
  if (registration.registrationKind !== "proxy") return null;
  return <div className="mt-3 space-y-2 text-xs">
    <p>{t({ en: "Staff approval", zh: "工作人员审批" })}: {registration.approvalStatus ?? "not_required"}</p>
    {registration.status === "confirmed" && registration.approvalStatus === "pending" && <div className="space-y-2">
      <p>{t({ en: "Rejecting cancels the place and revokes unsigned invitations. Review this attendee’s payment and process any refund separately below.", zh: "拒绝将取消名额并撤销未签邀请。请核对此人的付款，并在下方单独处理应退金额。" })}</p>
      {(["approve", "reject"] as const).map((decision) => <button key={decision} type="button" disabled={pending} className="mr-3 min-h-11 rounded border px-3"
        onClick={() => startTransition(async () => {
          const form = new FormData(); form.set("registrationId",registration.id); form.set("decision",decision);
          try { const result = await staffReviewProxyRegistrationAction(form); setMessage(t(result.success ? { en: "Review saved", zh: "审核已保存" } : { en: "Review failed; refresh and retry", zh: "审核失败，请刷新后重试" })); }
          catch { setMessage(t({ en: "Review failed", zh: "审核失败" })); }
        })}>{t(decision === "approve" ? { en: "Approve attendee", zh: "批准参加" } : { en: "Reject / review refund", zh: "拒绝 / 核对退款" })}</button>)}
    </div>}
    <p>{t({ en: "Acceptance", zh: "授权" })}: {registration.attendeeConfirmationStatus} · {registration.attendanceStatus}</p>
    {registration.status === "confirmed" && registration.attendeeConfirmationStatus !== "accepted" && <button disabled={pending}
      type="button" className="min-h-11 text-blue-700 underline" onClick={() => startTransition(async () => {
        const form = new FormData(); form.set("registrationId", registration.id);
        try { const result = await staffGuestInvitationAction(form);
          if (result.success) setLink(new URL(result.url, window.location.origin).href);
          else setMessage(t({ en: "Invitation unavailable", zh: "邀请不可用" }));
        } catch { setMessage(t({ en: "Invitation unavailable", zh: "邀请不可用" })); }
      })}>{t({ en: "Issue / replace invitation", zh: "生成 / 替换邀请" })}</button>}
    {link && <label className="block">{t({ en: "Forward privately / replaces previous link", zh: "私下转发 / 旧链接将失效" })}<input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full rounded border p-2" /></label>}
    {registration.attendeeConfirmationStatus === "pending" && <button disabled={pending} type="button" className="ml-3 min-h-11 text-red-700 underline" onClick={() => startTransition(async () => {
      const form = new FormData(); form.set("registrationId", registration.id);
      try { const result = await staffRevokeGuestInvitationAction(form); if (result.success) setLink(""); setMessage(t(result.success ? { en: "Invitation revoked", zh: "邀请已撤销" } : { en: "Could not revoke invitation", zh: "无法撤销邀请" })); }
      catch { setMessage(t({ en: "Could not revoke invitation", zh: "无法撤销邀请" })); }
    })}>{t({ en: "Revoke invitation", zh: "撤销邀请" })}</button>}
    {registration.status === "confirmed" && !["pending","rejected"].includes(registration.approvalStatus ?? "not_required") && registration.attendeeConfirmationStatus === "accepted" && registration.attendanceStatus !== "attended" && <form
      onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); startTransition(async () => {
        try { const result = await staffGuestCheckinAction(form); setMessage(t(result.success ? { en: "Checked in", zh: "核销完成" } : { en: "Check-in rejected", zh: "核销被拒绝" })); }
        catch { setMessage(t({ en: "Check-in failed", zh: "核销失败" })); }
      }); }} className="space-y-2">
      <input type="hidden" name="registrationId" value={registration.id} />
      <label className="flex items-start gap-2"><input type="checkbox" name="identityChecked" required />{t({ en: "I checked this attendee’s ticket and identity", zh: "已核验此参加者的票据与身份" })}</label>
      <button disabled={pending} className="min-h-11 rounded border px-3">{t({ en: "Check in attendee", zh: "核销此参加者" })}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </div>;
}
