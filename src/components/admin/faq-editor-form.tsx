"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FAQItem } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { saveFAQAction } from "@/lib/faqs/actions";
import { AdminTranslateMissingButton } from "@/components/admin/admin-translate-missing-button";
import type { AdminTranslationResult } from "@/lib/admin/translation";

type FaqEditorFormProps = {
  initialData: FAQItem | null;
};

export function FaqEditorForm({ initialData }: FaqEditorFormProps) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [questionEn, setQuestionEn] = useState(initialData?.question.en || "");
  const [questionZh, setQuestionZh] = useState(initialData?.question.zh || "");
  
  const [answerEn, setAnswerEn] = useState(initialData?.answer.en || "");
  const [answerZh, setAnswerZh] = useState(initialData?.answer.zh || "");
  
  const [categoryEn, setCategoryEn] = useState(initialData?.category.en || "");
  const [categoryZh, setCategoryZh] = useState(initialData?.category.zh || "");
  
  const [order, setOrder] = useState(initialData?.order || 0);

  function getMissingItems(source: "en" | "zh") {
    const items = [];
    if (source === "en") {
      if (questionEn && !questionZh) items.push({ id: "question", value: questionEn });
      if (answerEn && !answerZh) items.push({ id: "answer", value: answerEn });
      if (categoryEn && !categoryZh) items.push({ id: "category", value: categoryEn });
    } else {
      if (questionZh && !questionEn) items.push({ id: "question", value: questionZh });
      if (answerZh && !answerEn) items.push({ id: "answer", value: answerZh });
      if (categoryZh && !categoryEn) items.push({ id: "category", value: categoryZh });
    }
    return items;
  }

  function handleApplyTranslations(translations: AdminTranslationResult[], target: "en" | "zh") {
    for (const t of translations) {
      if (t.id === "question") {
        if (target === "en") setQuestionEn(t.value);
        if (target === "zh") setQuestionZh(t.value);
      } else if (t.id === "answer") {
        if (target === "en") setAnswerEn(t.value);
        if (target === "zh") setAnswerZh(t.value);
      } else if (t.id === "category") {
        if (target === "en") setCategoryEn(t.value);
        if (target === "zh") setCategoryZh(t.value);
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!questionEn || !questionZh || !answerEn || !answerZh || !categoryEn || !categoryZh) {
      setError(lang === "zh" ? "请填写所有中英文必填字段" : "Please fill in all required fields in both languages");
      return;
    }

    const payload: FAQItem = {
      id: initialData?.id || crypto.randomUUID(),
      question: { en: questionEn, zh: questionZh },
      answer: { en: answerEn, zh: answerZh },
      category: { en: categoryEn, zh: categoryZh },
      order,
    };

    startTransition(async () => {
      try {
        const res = await saveFAQAction(payload, !initialData);
        if (res.success) {
          router.push("/admin/faq");
        } else {
          setError(lang === "zh" ? "保存失败" : "Failed to save FAQ");
        }
      } catch (err) {
        setError(lang === "zh" ? "保存时发生错误" : "An error occurred while saving");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-xl font-semibold text-gray-900">
          {initialData 
            ? t({ en: "Edit FAQ", zh: "编辑 FAQ" }) 
            : t({ en: "Add FAQ", zh: "添加 FAQ" })}
        </h2>
        <div className="flex items-center gap-4">
          <AdminTranslateMissingButton
            sourceLang="en"
            targetLang="zh"
            items={getMissingItems("en")}
            onApply={(res) => handleApplyTranslations(res, "zh")}
          />
          <AdminTranslateMissingButton
            sourceLang="zh"
            targetLang="en"
            items={getMissingItems("zh")}
            onApply={(res) => handleApplyTranslations(res, "en")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* English Column */}
        <div className="space-y-6">
          <h3 className="font-medium text-gray-900 border-b border-gray-100 pb-2">English</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Category (EN)</label>
            <input
              type="text"
              value={categoryEn}
              onChange={(e) => setCategoryEn(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g. General, Registration"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Question (EN)</label>
            <textarea
              rows={3}
              value={questionEn}
              onChange={(e) => setQuestionEn(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Answer (EN)</label>
            <textarea
              rows={6}
              value={answerEn}
              onChange={(e) => setAnswerEn(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        {/* Chinese Column */}
        <div className="space-y-6">
          <h3 className="font-medium text-gray-900 border-b border-gray-100 pb-2">中文</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">分类 (ZH)</label>
            <input
              type="text"
              value={categoryZh}
              onChange={(e) => setCategoryZh(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="例如：常见问题，报名相关"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">问题 (ZH)</label>
            <textarea
              rows={3}
              value={questionZh}
              onChange={(e) => setQuestionZh(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">回答 (ZH)</label>
            <textarea
              rows={6}
              value={answerZh}
              onChange={(e) => setAnswerZh(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <div className="w-48 mb-6">
          <label className="block text-sm font-medium text-gray-700">
            {t({ en: "Display Order", zh: "显示排序" })}
          </label>
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t({ en: "Lower numbers appear first", zh: "数字越小越靠前" })}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending 
              ? t({ en: "Saving...", zh: "保存中..." }) 
              : t({ en: "Save FAQ", zh: "保存 FAQ" })}
          </button>
          <Link
            href="/admin/faq"
            className="rounded px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {t({ en: "Cancel", zh: "取消" })}
          </Link>
        </div>
      </div>
    </form>
  );
}
