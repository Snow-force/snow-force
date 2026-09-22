"use client";

import { useState } from "react";
import { createCheckoutSessionAction } from "@/lib/payments/actions";
import { useLanguage } from "@/lib/language";

type PendingPaymentButtonProps = {
  label: string;
  checkoutInProgress?: boolean;
  pendingRegistrationId: string;
};

export function PendingPaymentButton({ label, checkoutInProgress = false, pendingRegistrationId }: PendingPaymentButtonProps) {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError("");
          const formData = new FormData();
          formData.append("pendingRegistrationId", pendingRegistrationId);
          try {
          const result = await createCheckoutSessionAction(formData);
          if (result.success) {
            window.location.href = result.url;
            return;
          }
          setError(result.error);
          } catch {
            setError(t({ en: "Could not check payment. Please refresh or contact SnowForce before paying again.", zh: "暂时无法查询付款，请刷新或联系 SnowForce，不要再次付款。" }));
          }
          setLoading(false);
        }}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0066ff] px-6 text-[15px] font-semibold text-white transition active:scale-95 disabled:opacity-60"
      >
        {loading ? t({ en: "Checking payment...", zh: "正在核实付款…" }) : checkoutInProgress ? t({ en: "Check / continue payment", zh: "查看 / 继续付款" }) : label}
      </button>
      {error ? <p className="max-w-[220px] text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
