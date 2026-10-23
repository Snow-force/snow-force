"use client";

import { useState, useTransition } from "react";
import type { Registration } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { createGuestInvitationAction } from "@/lib/registrations/guest-actions";

export function ProxyRegistrationList({ registrations }: { registrations: Registration[] }) {
  const { t } = useLanguage();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const rows = registrations.filter((row) => row.registrationKind === "proxy");
  if (!rows.length) return null;
  return <section className="rounded-[18px] border border-[#dce2d7] bg-white p-6">
    <h2 className="text-lg font-semibold">{t({ en: "Friends I registered", zh: "我替朋友的报名" })}</h2>
    <p className="mt-2 text-sm leading-6 text-gray-600">{t({ en: "Each friend has their own ticket and payment. Send their personal invitation; they must accept before staff check-in. Contact staff for individual cancellation or refund under the event terms.", zh: "每位朋友独立票据和付款。请转发个人邀请，朋友接受后才能现场核销。单人取消或退款请按活动条款联系工作人员。" })}</p>
    <div className="mt-4 divide-y">
      {rows.map((row) => <article key={row.id} className="space-y-2 py-4">
        <h3 className="font-semibold">{row.contactName} · <a className="text-[#0066cc]" href={`/events/${row.eventSlug}`}>{row.eventSlug}</a></h3>
        {row.approvalStatus === "pending" && <p role="status" className="text-sm text-amber-800">{t({ en: "Awaiting staff approval. Payment reserves this place; attendance is not yet approved.", zh: "等待工作人员审批。付款后预留名额，尚未获准参加。" })}</p>}
        {row.approvalStatus === "rejected" && <p role="status" className="text-sm text-red-700">{t({ en: "Not approved. This place was cancelled. Contact staff to review this attendee’s refund under the event terms.", zh: "未获批准，名额已取消。请按活动条款联系工作人员核对此人的退款。" })}</p>}
        <p className="text-sm">{t({ en: "Ticket", zh: "票据" })}: {row.status} · {t({ en: "Payment", zh: "付款" })}: {row.finance?.depositStatus ?? "pending"}</p>
        <p className="text-sm">{t({ en: "Attendee acceptance", zh: "参加者授权" })}: {row.attendeeConfirmationStatus ?? "pending"} · {t({ en: "Check-in", zh: "核销" })}: {row.attendanceStatus}</p>
        {row.status === "confirmed" && row.attendeeConfirmationStatus !== "accepted" && <button disabled={pending} className="btn-secondary min-h-11 text-sm"
          onClick={() => { setError(""); startTransition(async () => { try { const result = await createGuestInvitationAction(row.id);
            if (result.success) setLinks((current) => ({ ...current, [row.id]: new URL(result.url, window.location.origin).href }));
            else setError(t({ en: "Could not create an invitation. Please refresh and try again.", zh: "无法创建邀请，请刷新后重试。" }));
          } catch { setError(t({ en: "Could not create an invitation.", zh: "无法创建邀请。" })); } }); }}>
          {t({ en: "Create / replace invitation", zh: "生成 / 替换邀请" })}
        </button>}
        {links[row.id] && <div className="space-y-2"><label className="block text-sm">{t({ en: "Personal link to forward (replacing invalidates the previous link)", zh: "可转发的个人链接（替换后旧链接失效）" })}<input readOnly className="input-field mt-1 text-sm" value={links[row.id]} onFocus={(e) => e.currentTarget.select()} /></label><a href={links[row.id]} className="text-sm text-[#0066cc]">{t({ en: "Open invitation", zh: "打开邀请" })}</a></div>}
      </article>)}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
