"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";
import { getAllRecaps, updateRecap } from "@/lib/recaps/repository";

export default function AdminRecapsPage() {
  const { t } = useLanguage();
  const [recaps, setRecaps] = useState(getAllRecaps());
  const [message, setMessage] = useState("");

  function toggleStatus(slug: string) {
    const recap = recaps.find((r) => r.slug === slug);
    if (!recap) return;
    const newStatus = recap.status === "published" ? "draft" : "published";
    updateRecap(slug, { status: newStatus });
    setRecaps([...getAllRecaps()]);
    setMessage(t({ en: "Updated", zh: "已更新" }));
    setTimeout(() => setMessage(""), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          {t({ en: "Recap Management", zh: "回顾管理" })}
        </h2>
        {message && <span className="text-sm text-green-600">{message}</span>}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-400 uppercase">
              <th className="py-3 pr-4">{t({ en: "Recap", zh: "回顾" })}</th>
              <th className="py-3 px-4">{t({ en: "Date", zh: "日期" })}</th>
              <th className="py-3 px-4">{t({ en: "Location", zh: "地点" })}</th>
              <th className="py-3 px-4">{t({ en: "Media", zh: "媒体" })}</th>
              <th className="py-3 px-4">{t({ en: "Status", zh: "状态" })}</th>
              <th className="py-3 pl-4">{t({ en: "Actions", zh: "操作" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recaps.map((recap) => (
              <tr key={recap.slug} className="hover:bg-gray-50">
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-900">{t(recap.title)}</p>
                  <p className="text-xs text-gray-400">{recap.slug}</p>
                </td>
                <td className="py-3 px-4 text-gray-500">
                  {new Date(recap.date).toLocaleDateString()}
                </td>
                <td className="py-3 px-4 text-gray-500">{t(recap.location)}</td>
                <td className="py-3 px-4 text-gray-500">{recap.media.length}</td>
                <td className="py-3 px-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    recap.status === "published" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {recap.status}
                  </span>
                </td>
                <td className="py-3 pl-4">
                  <button
                    onClick={() => toggleStatus(recap.slug)}
                    className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    {recap.status === "published"
                      ? t({ en: "Unpublish", zh: "取消发布" })
                      : t({ en: "Publish", zh: "发布" })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bilingual Check */}
      <div className="mt-8 card">
        <h3 className="text-lg font-semibold text-gray-900">
          {t({ en: "Bilingual Content Check", zh: "双语内容检查" })}
        </h3>
        <div className="mt-4 divide-y divide-gray-100">
          {recaps.filter((r) => r.status === "published").map((recap) => {
            const missing: string[] = [];
            if (!recap.title.en || !recap.title.zh) missing.push("title");
            if (!recap.content.en || !recap.content.zh) missing.push("content");
            return (
              <div key={recap.slug} className="flex items-center justify-between py-2">
                <span className="text-sm">{t(recap.title)}</span>
                {missing.length > 0 ? (
                  <span className="text-xs text-red-600">
                    {t({ en: `Missing: ${missing.join(", ")}`, zh: `缺失：${missing.join("、")}` })}
                  </span>
                ) : (
                  <span className="text-xs text-green-600">{t({ en: "Complete", zh: "完整" })}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
