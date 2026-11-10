"use client";

import { useState } from "react";
import { ArrowDown, Check, Copy, MessageSquare } from "lucide-react";
import { useLanguage } from "@/lib/language";
import type { Event, Registration } from "@/lib/types";
import {
  buildRegistrationFollowUps, followUpDraft, followUpKinds, followUpLabels,
  type FollowUpKind, type RegistrationFollowUp,
} from "@/lib/registrations/follow-up";

const copy = {
  title: { en: "Registration follow-up desk", zh: "报名跟进工作台" },
  intro: { en: "One person. One next step. A clearer conversation.", zh: "一位参加者，一个下一步，让沟通更清楚。" },
  scope: { en: "Based on the current event and filters. Oldest registrations first within each queue. Reload after changes.", zh: "按当前活动与筛选显示，同类按报名时间从早到晚排列。处理后请刷新。" },
  all: { en: "All follow-ups", zh: "全部跟进" },
  empty: { en: "No follow-ups in the current selection.", zh: "当前筛选暂无待跟进事项。" },
  emptyHelp: { en: "This queue covers recorded cancellations, refund settlements, approvals, balances and deposits. Review waivers and payment exceptions separately.", zh: "此队列涵盖已记录的取消、退款结算、审批、尾款与定金。免责签署及付款异常需单独核对。" },
  contact: { en: "Booker / contact", zh: "预订人／联系人" },
  attendee: { en: "Attendee email", zh: "参加者邮箱" },
  noContact: { en: "No contact email recorded", zh: "未记录联系邮箱" },
  draft: { en: "Message draft", zh: "消息草稿" },
  draftHelp: { en: "Edit before copying. Check the recipient and current record. Copying does not send a message or update a registration.", zh: "复制前可编辑，请核对收件人与最新记录。复制不会发送消息或更新报名。" },
  copy: { en: "Copy draft", zh: "复制草稿" },
  copied: { en: "Draft copied. Review before sending.", zh: "草稿已复制，发送前请核对。" },
  denied: { en: "Select the draft and copy it manually.", zh: "请选中草稿，手动复制。" },
  record: { en: "Open attendee record", zh: "查看参加者记录" },
  cancellation: { en: "Open cancellation review", zh: "查看取消审核" },
  people: { en: "people to follow up", zh: "位参加者待跟进" },
};

export function RegistrationFollowUpDesk({ registrations, eventTitle, paymentModel, pendingCancellationIds }: {
  registrations: Registration[];
  eventTitle: { en: string; zh: string };
  paymentModel: Event["paymentModel"] | undefined;
  pendingCancellationIds: string[];
}) {
  const { lang } = useLanguage();
  const [kind, setKind] = useState<FollowUpKind | "all">("all");
  const [selectedId, setSelectedId] = useState("");
  const items = buildRegistrationFollowUps(registrations, paymentModel, pendingCancellationIds);
  const visible = items.filter(item => kind === "all" || item.kind === kind);
  const selected = visible.find(item => item.registration.id === selectedId) ?? visible[0];
  const categories = ["all", ...followUpKinds] as const;

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white" aria-label={copy.title[lang]}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 bg-gray-50 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><MessageSquare size={20} aria-hidden="true" />{copy.title[lang]}</h3>
          <p className="mt-1 text-sm text-gray-700">{copy.intro[lang]}</p>
          <p className="mt-2 max-w-2xl text-xs text-gray-500">{copy.scope[lang]}</p>
        </div>
        <p className="text-sm text-gray-600"><span className="mr-2 text-2xl font-semibold tabular-nums text-gray-900">{items.length}</span>{copy.people[lang]}</p>
      </div>
      <div className="grid grid-cols-2 border-b border-gray-200 sm:grid-cols-3 xl:grid-cols-6" aria-label={copy.all[lang]}>
        {categories.map(category => {
          const count = category === "all" ? items.length : items.filter(item => item.kind === category).length;
          return <button key={category} type="button" aria-pressed={kind === category}
            onClick={() => { setKind(category); setSelectedId(""); }}
            className={`flex min-h-16 items-center justify-between gap-2 border-b border-r border-gray-200 px-4 py-3 text-left text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${kind === category ? "bg-blue-50 text-blue-800" : "text-gray-600 hover:bg-gray-50"}`}>
            <span>{category === "all" ? copy.all[lang] : followUpLabels[category][lang]}</span><span className="text-lg tabular-nums">{count}</span>
          </button>;
        })}
      </div>
      {selected ? <div className="grid md:grid-cols-[minmax(220px,1fr)_2fr]">
        <div className="max-h-96 overflow-y-auto border-b border-gray-200 md:border-b-0 md:border-r">
          {visible.map(item => <button key={item.registration.id} type="button"
            aria-pressed={item.registration.id === selected.registration.id}
            onClick={() => setSelectedId(item.registration.id)}
            className={`block min-h-20 w-full border-b border-gray-100 px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${item.registration.id === selected.registration.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
            <span className="block break-words text-sm font-semibold text-gray-900">{item.registration.contactName}</span>
            <span className="mt-1 block text-xs text-gray-600">{followUpLabels[item.kind][lang]}</span>
          </button>)}
        </div>
        <DraftPanel key={`${selected.registration.id}:${selected.kind}:${lang}`} item={selected} eventTitle={eventTitle[lang] || eventTitle.en || eventTitle.zh} lang={lang} />
      </div> : <div className="p-6">
        <p className="text-sm font-medium text-gray-900">{copy.empty[lang]}</p>
        <p className="mt-2 max-w-2xl text-xs text-gray-500">{copy.emptyHelp[lang]}</p>
      </div>}
    </section>
  );
}

function DraftPanel({ item, eventTitle, lang }: { item: RegistrationFollowUp; eventTitle: string; lang: "en" | "zh" }) {
  const [draft, setDraft] = useState(() => followUpDraft(item, eventTitle, lang));
  const [status, setStatus] = useState<"" | "copied" | "denied">("");
  const registration = item.registration;
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setStatus("copied");
    } catch {
      setStatus("denied");
    }
  }
  return <div className="min-w-0 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="break-words font-semibold text-gray-900">{registration.contactName}</h4><p className="mt-1 text-xs text-gray-600">{followUpLabels[item.kind][lang]}</p></div>
      <a href={`#registration-${registration.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm text-blue-700 underline"><ArrowDown size={14} aria-hidden="true" />{copy.record[lang]}</a>
    </div>
    {item.kind === "cancellation" && <a href="#cancellations" className="mt-3 inline-block text-sm text-blue-700 underline">{copy.cancellation[lang]}</a>}
    <dl className="my-4 grid gap-2 text-xs sm:grid-cols-2">
      <div><dt className="text-gray-500">{copy.contact[lang]}</dt><dd className="mt-1 break-all text-gray-900">{registration.contactEmail || copy.noContact[lang]}</dd></div>
      {registration.attendeeEmail && <div><dt className="text-gray-500">{copy.attendee[lang]}</dt><dd className="mt-1 break-all text-gray-900">{registration.attendeeEmail}</dd></div>}
    </dl>
    <label className="block text-sm font-medium text-gray-900" htmlFor="follow-up-draft">{copy.draft[lang]}</label>
    <textarea id="follow-up-draft" aria-describedby="follow-up-help" value={draft} onChange={event => { setDraft(event.target.value); setStatus(""); }} rows={8}
      className="mt-2 block w-full resize-y rounded border border-gray-300 p-3 text-sm leading-relaxed text-gray-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
    <p id="follow-up-help" className="mt-2 text-xs text-gray-500">{copy.draftHelp[lang]}</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={copyDraft} disabled={!draft.trim()} className="inline-flex min-h-11 items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
        {status === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copy.copy[lang]}
      </button>
      <p role="status" className="text-xs text-gray-600">{status ? copy[status][lang] : ""}</p>
    </div>
  </div>;
}
