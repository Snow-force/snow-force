"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { getFAQs, deleteFAQ } from "@/lib/faqs/repository";

export default function AdminFAQPage() {
  const { t } = useLanguage();
  const [faqs, setFaqs] = useState(getFAQs());
  const [message, setMessage] = useState("");

  function handleDelete(id: string) {
    deleteFAQ(id);
    setFaqs(getFAQs());
    setMessage(t({ en: "FAQ deleted", zh: "FAQ 已删除" }));
    setTimeout(() => setMessage(""), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {t({ en: "FAQ Management", zh: "FAQ 管理" })}
          </h2>
          <Link
            href="/admin/faq/new"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t({ en: "Add FAQ", zh: "添加 FAQ" })}
          </Link>
        </div>
        {message && <span className="text-sm text-green-600">{message}</span>}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-400 uppercase">
              <th className="py-3 pr-4 w-12">#</th>
              <th className="py-3 px-4">{t({ en: "Question", zh: "问题" })}</th>
              <th className="py-3 px-4">{t({ en: "Category", zh: "分类" })}</th>
              <th className="py-3 pl-4">{t({ en: "Actions", zh: "操作" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {faqs.map((faq) => (
              <tr key={faq.id} className="hover:bg-gray-50">
                <td className="py-3 pr-4 text-gray-400">{faq.order}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-gray-900">{t(faq.question)}</p>
                  <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{t(faq.answer)}</p>
                </td>
                <td className="py-3 px-4 text-gray-500">{t(faq.category)}</td>
                <td className="py-3 pl-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/faq/${faq.id}`}
                      className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      {t({ en: "Edit", zh: "编辑" })}
                    </Link>
                    <button onClick={() => handleDelete(faq.id)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                      {t({ en: "Delete", zh: "删除" })}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
