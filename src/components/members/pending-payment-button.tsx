"use client";

import { useState } from "react";
import { createCheckoutSessionAction } from "@/lib/payments/actions";

type PendingPaymentButtonProps = {
  label: string;
  pendingRegistrationId: string;
};

export function PendingPaymentButton({ label, pendingRegistrationId }: PendingPaymentButtonProps) {
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
          const result = await createCheckoutSessionAction(formData);
          if (result.success) {
            window.location.href = result.url;
            return;
          }
          setError(result.error);
          setLoading(false);
        }}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0066ff] px-6 text-[15px] font-semibold text-white transition active:scale-95 disabled:opacity-60"
      >
        {loading ? "Redirecting..." : label}
      </button>
      {error ? <p className="max-w-[220px] text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
