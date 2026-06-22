"use client";

import { useState, useTransition } from "react";

import type { AdminTranslationItem, AdminTranslationLang, AdminTranslationResult } from "@/lib/admin/translation";
import { useLanguage } from "@/lib/language";

type AdminTranslateMissingButtonProps = {
  sourceLang: AdminTranslationLang;
  targetLang: AdminTranslationLang;
  items: AdminTranslationItem[];
  onApply(translations: AdminTranslationResult[]): void;
};

function langLabel(lang: AdminTranslationLang) {
  return lang === "zh" ? "中文" : "English";
}

function isTranslationResponse(value: unknown): value is { translations: AdminTranslationResult[]; message?: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray((value as { translations?: unknown }).translations) &&
    (value as { translations: unknown[] }).translations.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { value?: unknown }).value === "string",
    )
  );
}

export function AdminTranslateMissingButton({
  sourceLang,
  targetLang,
  items,
  onApply,
}: AdminTranslateMissingButtonProps) {
  const { lang } = useLanguage();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const disabled = isPending || items.length === 0;
  const label = `${langLabel(sourceLang)} -> ${langLabel(targetLang)}`;

  function translateMissing() {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/admin/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceLang, targetLang, items }),
        });
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          const errorMessage =
            payload !== null && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
              ? (payload as { message: string }).message
              : "Translation failed.";
          setMessage(errorMessage);
          return;
        }

        if (!isTranslationResponse(payload)) {
          setMessage(lang === "zh" ? "翻译结果格式异常。" : "Unexpected translation response.");
          return;
        }

        onApply(payload.translations);
        setMessage(
          lang === "zh"
            ? `已填补 ${payload.translations.length} 个字段。`
            : `Filled ${payload.translations.length} field${payload.translations.length === 1 ? "" : "s"}.`,
        );
      } catch {
        setMessage(lang === "zh" ? "翻译请求失败。" : "Translation request failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={translateMissing}
        disabled={disabled}
        className="rounded border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (lang === "zh" ? "翻译中..." : "Translating...") : label}
      </button>
      <span className={`text-xs ${message.includes("failed") || message.includes("失败") ? "text-red-600" : "text-gray-500"}`}>
        {items.length === 0 && !message ? (lang === "zh" ? "没有可补全字段" : "No missing fields") : message}
      </span>
    </div>
  );
}
