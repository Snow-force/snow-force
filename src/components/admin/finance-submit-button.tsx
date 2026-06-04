"use client";

import { useFormStatus } from "react-dom";

export function FinanceSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-gray-900 px-2 py-1 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-wait disabled:bg-gray-500"
    >
      {pending ? "Saving..." : "Save finance"}
    </button>
  );
}
