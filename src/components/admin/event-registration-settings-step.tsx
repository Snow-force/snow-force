"use client";

import type { Event } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type EventRegistrationSettingsStepProps = {
  event: Event;
  activeLang: ActiveLang;
  isNew?: boolean;
  onChange(event: Event): void;
};

function localDateTime(value: string) {
  return value ? value.slice(0, 16) : "";
}

export function EventRegistrationSettingsStep({ event, activeLang, onChange, isNew = false }: EventRegistrationSettingsStepProps) {
  const { t } = useLanguage();
  const registrationCloseHint =
    activeLang === "zh"
      ? "格式: YYYY-MM-DD HH:mm，例如 2026-12-10 18:00"
      : "Format: YYYY-MM-DD HH:mm, e.g. 2026-12-10 18:00";
  const feeHint =
    activeLang === "zh"
      ? "示例: 免费 / 120 USD / ¥399"
      : "Example: Free / 120 USD / ¥399";
  const paymentHint =
    activeLang === "zh"
      ? "示例: 报名后在微信群发送支付方式与截止时间"
      : "Example: Payment instructions sent in group chat after signup";

  function updateEventValue<Key extends keyof Event>(key: Key, value: Event[Key]) {
    onChange({ ...event, [key]: value });
  }

  function updatePaymentInstructions(value: string) {
    onChange({
      ...event,
      paymentInstructions: {
        ...event.paymentInstructions,
        [activeLang]: value,
      },
    });
  }

  return (
    <section className="card space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.registrationSettings)}</h3>
      <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
        <p>{t({ en: "Multi-day activities can have fixed-price room-type packages per person, including lodging. Staff arrange roommates.", zh: "多天活动可按房型配置每人固定套餐价，已含住宿，由工作人员安排同住。" })}</p>
        {!isNew && event.slug ? <a href="#event-lodging-settings" className="inline-block text-blue-700 underline">{t({ en: "Configure room-type packages below the event editor", zh: "在活动编辑器下方配置房型套餐" })}</a> : <p className="text-gray-600">{t({ en: "Save the event first, then configure its room-type packages.", zh: "请先保存活动，再配置该活动的房型套餐。" })}</p>}
      </div>
      <div className="grid gap-4 rounded border border-gray-200 p-4 md:grid-cols-2">
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={event.allowProxyRegistrations ?? false}
            onChange={(e) => updateEventValue("allowProxyRegistrations", e.currentTarget.checked)} />
          {t({ en: "Allow friend registrations", zh: "允许代朋友报名" })}
        </label>
        <label className="text-sm text-gray-700">
          {t({ en: "Friends per booker (1–20)", zh: "每位会员可代报朋友数（1–20）" })}
          <input type="number" min={1} max={20} value={event.maxProxyRegistrations ?? 5}
            onChange={(e) => updateEventValue("maxProxyRegistrations", Number(e.currentTarget.value))}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
        </label>
        <p className="text-xs leading-5 text-gray-500 md:col-span-2">{t({ en: "One attendee per payment. Friends sign separately before staff check-in. For approval events, each friend also needs staff approval; payment reserves their place while under review.", zh: "每人独立付款、独立签署。需审批活动中，每位朋友还须经工作人员审核；付款后审核期间预留名额。" })}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.capacity)}
          <input
            type="number"
            min={0}
            value={event.capacity}
            onChange={(changeEvent) => updateEventValue("capacity", Number(changeEvent.currentTarget.value))}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.registrationClose)}
          <input
            type="datetime-local"
            value={localDateTime(event.registrationCloseAt)}
            onChange={(changeEvent) => updateEventValue("registrationCloseAt", changeEvent.currentTarget.value)}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
          <p className="mt-1 text-xs text-gray-500">{registrationCloseHint}</p>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={event.requiresApproval}
            onChange={(changeEvent) => updateEventValue("requiresApproval", changeEvent.currentTarget.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Requires approval
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={event.allowWaitlist}
            onChange={(changeEvent) => updateEventValue("allowWaitlist", changeEvent.currentTarget.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Allow waitlist
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={event.allowCancellation}
            onChange={(changeEvent) => updateEventValue("allowCancellation", changeEvent.currentTarget.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Allow cancellation
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.feeInfo)}
          <input
            value={event.feeAmount}
            onChange={(changeEvent) => updateEventValue("feeAmount", changeEvent.currentTarget.value)}
            placeholder={feeHint}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
          <p className="mt-1 text-xs text-gray-500">{feeHint}</p>
        </label>
        <label className="block text-sm text-gray-600">
          Payment instructions
          <textarea
            value={event.paymentInstructions[activeLang]}
            onChange={(changeEvent) => updatePaymentInstructions(changeEvent.currentTarget.value)}
            placeholder={paymentHint}
            rows={3}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          />
          <p className="mt-1 text-xs text-gray-500">{paymentHint}</p>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2 border-t border-gray-200 pt-4">
        <label className="block text-sm text-gray-600">
          <span className="font-semibold">Online payment</span>
          <select
            value={event.paymentModel}
            onChange={(e) => updateEventValue("paymentModel", e.target.value as Event["paymentModel"])}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
          >
            <option value="free">{t({ en: "Free — no online payment", zh: "免费 — 无需在线支付" })}</option>
            <option value="deposit">{t({ en: "Deposit — collect deposit online, balance offline", zh: "押金 — 在线支付押金，尾款线下收取" })}</option>
            <option value="full_prepay">{t({ en: "Full prepay — collect full fee online", zh: "全款 — 在线支付全额费用" })}</option>
          </select>
        </label>
        {event.paymentModel === "deposit" ? (
          <>
            <label className="block text-sm text-gray-600">
              <span className="font-semibold">Deposit amount</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={event.depositAmount ?? ""}
                onChange={(e) => updateEventValue("depositAmount", e.target.value === "" ? null : Number(e.target.value))}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm text-gray-600">
              <span className="font-semibold">Currency</span>
              <select
                value={event.depositCurrency}
                onChange={(e) => updateEventValue("depositCurrency", e.target.value as Event["depositCurrency"])}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
              >
                <option value="usd">USD</option>
                <option value="cny">CNY</option>
                <option value="eur">EUR</option>
                <option value="gbp">GBP</option>
                <option value="jpy">JPY</option>
              </select>
            </label>
          </>
        ) : null}
        {event.paymentModel === "full_prepay" ? (
          <>
            <label className="block text-sm text-gray-600">
              <span className="font-semibold">Full payment amount</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={event.fullPaymentAmount ?? ""}
                onChange={(e) => updateEventValue("fullPaymentAmount", e.target.value === "" ? null : Number(e.target.value))}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm text-gray-600">
              <span className="font-semibold">Currency</span>
              <select
                value={event.depositCurrency}
                onChange={(e) => updateEventValue("depositCurrency", e.target.value as Event["depositCurrency"])}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
              >
                <option value="usd">USD</option>
                <option value="cny">CNY</option>
                <option value="eur">EUR</option>
                <option value="gbp">GBP</option>
                <option value="jpy">JPY</option>
              </select>
            </label>
          </>
        ) : null}
        {event.paymentModel === "free" ? (
          <p className="text-xs text-gray-500 md:col-span-2">
            {t({ en: "No online payment required — registrations are confirmed at /member as today.", zh: "无需在线支付 — 报名将在 /member 确认（与当前流程一致）。" })}
          </p>
        ) : null}
      </div>
      <div>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.waiverSection)}
          <textarea
            value={event.waiverTextEn ?? ""}
            onChange={(changeEvent) =>
              updateEventValue("waiverTextEn", changeEvent.currentTarget.value || null)
            }
            placeholder="Enter English liability waiver text. Leave empty to use the standard consent checkbox."
            rows={6}
            className="mt-1 w-full rounded border border-gray-200 px-3 py-2 font-mono text-xs"
          />
        </label>
        <p className="mt-1 text-xs text-gray-500">{t(adminCopy.editor.waiverHelp)}</p>
        {event.waiverTextEn && event.waiverTextSha && (
          <p className="mt-1 text-xs text-gray-400">
            {t(adminCopy.editor.waiverSha)}: <span className="font-mono">{event.waiverTextSha.slice(0, 16)}…</span>
          </p>
        )}
      </div>
    </section>
  );
}
