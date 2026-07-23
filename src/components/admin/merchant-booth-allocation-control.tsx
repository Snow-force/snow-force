"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";
import type { AdminMerchantApplicationItem } from "@/lib/merchants/admin-view";
import type { MerchantFormAction } from "./merchant-operation-actions";

export function MerchantBoothAllocationControl({
  record,
  returnEvent,
  returnStatus,
  action,
}: {
  readonly record: AdminMerchantApplicationItem;
  readonly returnEvent: string;
  readonly returnStatus: string;
  readonly action: MerchantFormAction;
}) {
  const { t } = useLanguage();
  const [boothId, setBoothId] = useState("");
  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={record.application.id} />
      <input type="hidden" name="returnEvent" value={returnEvent} />
      <input type="hidden" name="returnStatus" value={returnStatus} />
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        {t({ en: "Matching booth", zh: "匹配摊位" })}
        <select
          name="boothId"
          value={boothId}
          onChange={(event) => setBoothId(event.currentTarget.value)}
          required
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        >
          <option value="">{t({ en: "Select booth", zh: "选择摊位" })}</option>
          {record.availableBooths.map((booth) => <option key={booth.id} value={booth.id}>{booth.boothCode}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!boothId} className="mt-2 rounded bg-snow-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-snow-700 disabled:cursor-not-allowed disabled:opacity-50">
        {t({ en: "Assign matching booth", zh: "分配匹配摊位" })}
      </button>
    </form>
  );
}
