"use client";

import { useLanguage } from "@/lib/language";

type NoticeKind = "success" | "error" | null;

type RecapEditorNoticeProps = {
  kind: NoticeKind;
  text: { en: string; zh: string };
};

export function RecapEditorNotice({ kind, text }: RecapEditorNoticeProps) {
  const { t } = useLanguage();
  if (!kind) return null;
  const cls =
    kind === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : "border-red-200 bg-red-50 text-red-700";
  const message = t(text);
  if (!message) return null;
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${cls}`} role="status">
      {message}
    </div>
  );
}

export const RECAP_MEDIA_ERRORS = {
  missing: { en: "No file selected. Choose at least one photo before uploading.", zh: "未选择文件。请先至少选择一张照片再上传。" },
  invalid: { en: "Some files were rejected. Use JPG, PNG, WebP, or GIF under 10 MB each.", zh: "部分文件被拒绝。仅支持 JPG、PNG、WebP、GIF，且单张不超过 10MB。" },
  upload: { en: "Upload failed. Storage rejected the file — check server logs and Supabase config.", zh: "上传失败，存储服务拒绝了文件，请查看服务端日志与 Supabase 配置。" },
} as const;

export type RecapMediaErrorKey = keyof typeof RECAP_MEDIA_ERRORS;