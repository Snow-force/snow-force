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
  db: { en: "Files uploaded but the recap record could not be saved — check server logs and database connectivity.", zh: "文件已上传但回顾记录保存失败，请查看服务端日志与数据库连接。" },
  sign_failed: { en: "Could not request a signed upload URL. Refresh the page and try again.", zh: "无法请求签名上传地址，请刷新页面后重试。" },
  finalize_failed: { en: "Could not finalize the upload. Files were saved but the recap record was not updated.", zh: "无法完成上传确认，文件已保存但回顾记录未更新。" },
  bad_path: { en: "Invalid upload path. Refresh the page and try again.", zh: "上传路径无效，请刷新页面后重试。" },
  missing_object: { en: "Uploaded file was not found in storage after upload. Check Supabase storage and try again.", zh: "上传后未在存储中找到文件，请检查 Supabase 存储后重试。" },
  metadata_invalid: { en: "Uploaded file metadata failed validation. Check the file type and size.", zh: "上传文件元数据校验失败，请检查文件类型与大小。" },
  recap_not_found: { en: "Recap not found. It may have been deleted.", zh: "未找到该回顾，可能已被删除。" },
  save_failed: { en: "Recap record could not be saved — check server logs and database connectivity.", zh: "回顾记录保存失败，请查看服务端日志与数据库连接。" },
  empty_upload: { en: "No uploaded files were provided. Choose at least one photo.", zh: "未提供上传文件，请至少选择一张照片。" },
} as const;

export type RecapMediaErrorKey = keyof typeof RECAP_MEDIA_ERRORS;
