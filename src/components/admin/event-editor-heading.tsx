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
  const fieldNameMap: Record<string, string> = {
    "title.zh": "活动标题（中文）",
    eventDate: "活动日期",
    meetTime: "集合时间（HH:mm，例如 07:30）",
    "activityLocation.zh": "活动地点（中文）",
    detailModules: "活动详情模块（请至少添加 1 个模块并填写中文内容）",
  };
  const missingLabels = missing?.map((field) => fieldNameMap[field] ?? field) ?? [];

  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-gray-900">
        {mode === "new" ? t(adminCopy.editor.newTitle) : t(adminCopy.editor.editTitle)}
      </h2>
      {saved ? <p className="mt-1 text-sm text-green-600">{t(adminCopy.editor.saved)}</p> : null}
      {missingLabels.length ? (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(adminCopy.editor.publishMissing)}: {missingLabels.join("；")}
        </p>
      ) : null}
    </div>
  );
}
