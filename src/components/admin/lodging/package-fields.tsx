"use client";

import { useId } from "react";
import { useLanguage } from "@/lib/language";
import type { Offer } from "@/lib/lodging/catalog";

export function PackagePriceField({ offer }: { offer?: Offer }) {
  const { t } = useLanguage();
  const hintId = useId();
  return <div className="space-y-2">
    <label className="grid gap-1 text-sm font-semibold">
      {t({ en: "Activity package per person, including lodging (USD)", zh: "每人活动套餐总价，含住宿（美元）" })}
      <input name="package_price" type="number" min="0.01" max="1000000" step="0.01" required
        defaultValue={offer?.package_amount == null ? "" : (offer.package_amount / 100).toFixed(2)}
        aria-describedby={hintId} className="mt-1 min-h-11 rounded-md border border-gray-300 px-3 py-2 font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
    </label>
    <p id={hintId} className="text-sm text-gray-600">{t({
      en: "The full activity package has a fixed price for each person. Lodging is included; do not add a room charge. Staff arrange roommates, and the price does not change with the number of roommates.",
      zh: "这是每人的完整活动套餐价，已含住宿，不另加房费。工作人员安排同住；同住人数变化不改变每人价格。",
    })}</p>
  </div>;
}
