"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FAQItem } from "@/lib/types";
import { saveFAQAction } from "@/lib/faqs/actions";

export function FaqEditorForm({ initialData }: { initialData: FAQItem | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(initialData?.category.en || "");
  const [question, setQuestion] = useState(initialData?.question.en || "");
  const [answer, setAnswer] = useState(initialData?.answer.en || "");
  const [order, setOrder] = useState(initialData?.order || 0);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!category.trim() || !question.trim() || !answer.trim()) {
      setMessage("Category, question, and answer are required.");
      return;
    }
    const data: FAQItem = {
      id: initialData?.id || crypto.randomUUID(),
      category: { en: category, zh: initialData?.category.zh || "" },
      question: { en: question, zh: initialData?.question.zh || "" },
      answer: { en: answer, zh: initialData?.answer.zh || "" },
      order,
    };
    startTransition(async () => {
      const result = await saveFAQAction(data, !initialData);
      if (result.translationWarning) {
        setMessage("Saved in English. Chinese translation could not be refreshed.");
        return;
      }
      router.push("/admin/faq");
    });
  }

  return <form onSubmit={handleSubmit} className="space-y-6">
    {message ? <div className="rounded bg-amber-50 p-4 text-sm text-amber-800">{message}</div> : null}
    <h2 className="text-xl font-semibold text-gray-900">{initialData ? "Edit FAQ" : "Add FAQ"}</h2>
    <label className="block text-sm font-medium text-gray-700">Category<input value={category} onChange={(event) => setCategory(event.currentTarget.value)} placeholder="e.g. General, Registration" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
    <label className="block text-sm font-medium text-gray-700">Question<textarea value={question} onChange={(event) => setQuestion(event.currentTarget.value)} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
    <label className="block text-sm font-medium text-gray-700">Answer<textarea value={answer} onChange={(event) => setAnswer(event.currentTarget.value)} rows={6} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
    <label className="block w-48 text-sm font-medium text-gray-700">Display order<input type="number" value={order} onChange={(event) => setOrder(Number(event.currentTarget.value) || 0)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></label>
    <div className="flex items-center gap-4"><button type="submit" disabled={isPending} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isPending ? "Saving..." : "Save FAQ"}</button><Link href="/admin/faq" className="rounded px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</Link></div>
  </form>;
}
