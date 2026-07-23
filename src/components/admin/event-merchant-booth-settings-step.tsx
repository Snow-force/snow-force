"use client";

import { useState } from "react";

import type {
  Event,
  EventMerchantBoothPhysicalBooth,
  EventMerchantBoothPlan,
  EventMerchantBoothProgram,
  MerchantBoothCurrency,
} from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type EventMerchantBoothSettingsStepProps = {
  event: Event;
  activeLang: ActiveLang;
  onChange(event: Event): void;
};

const merchantBoothCurrencies: MerchantBoothCurrency[] = ["usd", "cny", "eur", "gbp", "jpy"];

function createBoothPlan(): EventMerchantBoothPlan {
  return {
    id: crypto.randomUUID(),
    name: { en: "", zh: "" },
    description: { en: "", zh: "" },
    priceAmount: 0,
    priceCurrency: "usd",
  };
}

function createPhysicalBooth(existingBooths: EventMerchantBoothPhysicalBooth[]): EventMerchantBoothPhysicalBooth {
  return {
    id: crypto.randomUUID(),
    boothPlanId: existingBooths[0]?.boothPlanId ?? "",
    boothCode: "",
  };
}

function emptyProgram(): EventMerchantBoothProgram {
  return {
    enabled: false,
    paymentInstructions: { en: "", zh: "" },
    plans: [],
    booths: [],
  };
}

function findDuplicateBoothCode(booths: EventMerchantBoothPhysicalBooth[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const booth of booths) {
    const normalized = booth.boothCode.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(booth.id);
    else seen.add(normalized);
  }
  return duplicates;
}

export function EventMerchantBoothSettingsStep({ event, activeLang, onChange }: EventMerchantBoothSettingsStepProps) {
  const { t } = useLanguage();
  const [collapsedPlanIds, setCollapsedPlanIds] = useState<Set<string>>(new Set());
  const program: EventMerchantBoothProgram = event.merchantBoothProgram ?? emptyProgram();
  const duplicateBoothIds = findDuplicateBoothCode(program.booths);
  const planSummaries = program.plans
    .map((plan) => `${plan.name.zh || plan.name.en || "未命名方案"} (${plan.priceAmount} ${plan.priceCurrency})`)
    .join(" · ");

  function updateProgram(next: EventMerchantBoothProgram) {
    onChange({ ...event, merchantBoothProgram: next });
  }

  function toggleEnabled(enabled: boolean) {
    updateProgram({ ...program, enabled });
  }

  function updatePaymentInstructions(value: string) {
    updateProgram({
      ...program,
      paymentInstructions: { ...program.paymentInstructions, [activeLang]: value },
    });
  }

  function addPlan() {
    const plan = createBoothPlan();
    updateProgram({
      ...program,
      plans: [...program.plans, plan],
    });
  }

  function updatePlan(index: number, next: EventMerchantBoothPlan) {
    updateProgram({
      ...program,
      plans: program.plans.map((plan, planIndex) => (planIndex === index ? next : plan)),
    });
  }

  function deletePlan(index: number) {
    const removed = program.plans[index];
    if (!removed) return;
    const nextPlans = program.plans.filter((_, planIndex) => planIndex !== index);
    const nextBooths = program.booths.map((booth) =>
      booth.boothPlanId === removed.id ? { ...booth, boothPlanId: "" } : booth,
    );
    updateProgram({ ...program, plans: nextPlans, booths: nextBooths });
  }

  function togglePlanCollapsed(planId: string) {
    setCollapsedPlanIds((current) => {
      const next = new Set(current);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  function addBooth() {
    const booth = createPhysicalBooth(program.booths);
    booth.boothPlanId = program.plans[0]?.id ?? "";
    updateProgram({ ...program, booths: [...program.booths, booth] });
  }

  function updateBooth(index: number, next: EventMerchantBoothPhysicalBooth) {
    updateProgram({
      ...program,
      booths: program.booths.map((booth, boothIndex) => (boothIndex === index ? next : booth)),
    });
  }

  function deleteBooth(index: number) {
    updateProgram({
      ...program,
      booths: program.booths.filter((_, boothIndex) => boothIndex !== index),
    });
  }

  return (
    <section className="card space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.merchantBooth.title)}</h3>
      <p className="text-sm text-gray-500">{t(adminCopy.merchantBooth.enabledHelp)}</p>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={program.enabled}
          onChange={(changeEvent) => toggleEnabled(changeEvent.currentTarget.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        {t(adminCopy.merchantBooth.enabled)}
      </label>

      {!program.enabled ? (
        <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {t(adminCopy.merchantBooth.disabledNotice)}
        </p>
      ) : null}

      {program.enabled ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-gray-600">
              {t(adminCopy.merchantBooth.paymentInstructionsLabel)} · {activeLang === "zh" ? "中文" : "English"}
              <textarea
                value={program.paymentInstructions[activeLang]}
                onChange={(changeEvent) => updatePaymentInstructions(changeEvent.currentTarget.value)}
                rows={3}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
              />
              <p className="mt-1 text-xs text-gray-500">{t(adminCopy.merchantBooth.paymentInstructionsHelp)}</p>
            </label>
          </div>

          <div className="space-y-3 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">{t(adminCopy.merchantBooth.plansTitle)}</h4>
              <button
                type="button"
                onClick={addPlan}
                className="rounded border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700"
              >
                {t(adminCopy.merchantBooth.addPlan)}
              </button>
            </div>
            {program.plans.length === 0 ? (
              <p className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                {t(adminCopy.merchantBooth.plansEmpty)}
              </p>
            ) : null}
            {program.plans.map((plan, index) => {
              const isCollapsed = collapsedPlanIds.has(plan.id);
              return (
                <div key={plan.id} className="rounded border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">
                      {plan.name.zh || plan.name.en || `${t(adminCopy.merchantBooth.plansTitle)} #${index + 1}`}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePlanCollapsed(plan.id)}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                      >
                        {isCollapsed ? t(adminCopy.editor.expand) : t(adminCopy.editor.collapse)}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePlan(index)}
                        className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
                      >
                        {t(adminCopy.merchantBooth.deletePlan)}
                      </button>
                    </div>
                  </div>
                  {!isCollapsed ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="block text-sm text-gray-600">
                        {t(adminCopy.merchantBooth.planNameEn)}
                        <input
                          value={plan.name.en}
                          onChange={(changeEvent) =>
                            updatePlan(index, { ...plan, name: { ...plan.name, en: changeEvent.currentTarget.value } })
                          }
                          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-gray-600">
                        {t(adminCopy.merchantBooth.planNameZh)}
                        <input
                          value={plan.name.zh}
                          onChange={(changeEvent) =>
                            updatePlan(index, { ...plan, name: { ...plan.name, zh: changeEvent.currentTarget.value } })
                          }
                          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-gray-600">
                        {t(adminCopy.merchantBooth.planDescriptionEn)}
                        <textarea
                          value={plan.description.en}
                          onChange={(changeEvent) =>
                            updatePlan(index, {
                              ...plan,
                              description: { ...plan.description, en: changeEvent.currentTarget.value },
                            })
                          }
                          rows={2}
                          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-gray-600">
                        {t(adminCopy.merchantBooth.planDescriptionZh)}
                        <textarea
                          value={plan.description.zh}
                          onChange={(changeEvent) =>
                            updatePlan(index, {
                              ...plan,
                              description: { ...plan.description, zh: changeEvent.currentTarget.value },
                            })
                          }
                          rows={2}
                          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-gray-600">
                        {t(adminCopy.merchantBooth.planPrice)}
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={plan.priceAmount}
                          onChange={(changeEvent) =>
                            updatePlan(index, { ...plan, priceAmount: Number(changeEvent.currentTarget.value) })
                          }
                          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-gray-600">
                        {t(adminCopy.merchantBooth.planCurrency)}
                        <select
                          value={plan.priceCurrency}
                          onChange={(changeEvent) =>
                            updatePlan(index, { ...plan, priceCurrency: changeEvent.currentTarget.value as MerchantBoothCurrency })
                          }
                          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                        >
                          {merchantBoothCurrencies.map((currency) => (
                            <option key={currency} value={currency}>
                              {currency.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {program.plans.length > 0 ? (
              <p className="text-xs text-gray-500">
                {planSummaries || (activeLang === "zh" ? "无方案摘要" : "No plan summary")}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">{t(adminCopy.merchantBooth.boothsTitle)}</h4>
              <button
                type="button"
                onClick={addBooth}
                className="rounded border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700"
                disabled={program.plans.length === 0}
              >
                {t(adminCopy.merchantBooth.addBooth)}
              </button>
            </div>
            {program.booths.length === 0 ? (
              <p className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                {t(adminCopy.merchantBooth.boothsEmpty)}
              </p>
            ) : null}
            {program.booths.map((booth, index) => {
              const codeTrimmed = booth.boothCode.trim();
              const isDuplicate = duplicateBoothIds.has(booth.id);
              const hasPlan = program.plans.some((plan) => plan.id === booth.boothPlanId);
              return (
                <div key={booth.id} className="rounded border border-gray-200 p-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block text-sm text-gray-600">
                      {t(adminCopy.merchantBooth.boothPlan)}
                      <select
                        value={booth.boothPlanId}
                        onChange={(changeEvent) => updateBooth(index, { ...booth, boothPlanId: changeEvent.currentTarget.value })}
                        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                      >
                        <option value="">{activeLang === "zh" ? "（请选择）" : "(select)"}</option>
                        {program.plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name.zh || plan.name.en || plan.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-gray-600">
                      {t(adminCopy.merchantBooth.boothCode)}
                      <input
                        value={booth.boothCode}
                        onChange={(changeEvent) => updateBooth(index, { ...booth, boothCode: changeEvent.currentTarget.value })}
                        placeholder="A-01"
                        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                      />
                      {isDuplicate ? (
                        <p className="mt-1 text-xs text-red-600">
                          {activeLang === "zh" ? "摊位编号必须唯一" : "Booth code must be unique"}
                        </p>
                      ) : null}
                      {codeTrimmed.length === 0 ? (
                        <p className="mt-1 text-xs text-red-600">
                          {activeLang === "zh" ? "摊位编号不能为空" : "Booth code is required"}
                        </p>
                      ) : null}
                      {!hasPlan ? (
                        <p className="mt-1 text-xs text-red-600">
                          {activeLang === "zh" ? "请选择所属方案" : "Booth plan is required"}
                        </p>
                      ) : null}
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => deleteBooth(index)}
                        className="rounded border border-red-200 bg-white px-3 py-2 text-xs text-red-700"
                      >
                        {t(adminCopy.merchantBooth.deleteBooth)}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
