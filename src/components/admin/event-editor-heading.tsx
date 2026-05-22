"use client";

import { useLanguage } from "@/lib/language";
import { adminCopy } from "./admin-copy";

export function EventEditorHeading({
  mode,
  saved,
  missing,
}: {
  mode: "new" | "edit";
  saved?: boolean;
  missing?: string[];
}) {
  const { t } = useLanguage();

  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-gray-900">
        {mode === "new" ? t(adminCopy.editor.newTitle) : t(adminCopy.editor.editTitle)}
      </h2>
      {saved ? <p className="mt-1 text-sm text-green-600">{t(adminCopy.editor.saved)}</p> : null}
      {missing?.length ? (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(adminCopy.editor.publishMissing)}: {missing.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
