"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useLanguage } from "@/lib/language";
import { unarchiveRecapAction } from "@/lib/recaps/actions";
import { adminCopy } from "./admin-copy";
import type { EventRecap } from "@/lib/types";

function recapMissingFields(recap: EventRecap) {
  const missing: string[] = [];
  if (!recap.title.zh) missing.push("中文标题");
  if (!recap.summary.zh) missing.push("中文摘要");
  if (!recap.content.zh) missing.push("中文正文");
  if (!recap.location.zh) missing.push("中文地点");
  if (recap.media.length === 0) missing.push("media");
  return missing;
}

export function AdminRecapsView({ initialRecaps }: { initialRecaps: EventRecap[] }) {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const archivedSlug = searchParams.get("archived");
  const [recaps, setRecaps] = useState(initialRecaps);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleStatus(slug: string) {
    const recap = recaps.find((item) => item.slug === slug);
    if (!recap) return;
    const status = recap.status === "published" ? "draft" : "published";

    startTransition(async () => {
      const formData = new FormData();
      formData.set("slug", slug);
      formData.set("status", status);
      const nextRecaps = await setRecapStatusAction(formData);
      setRecaps(nextRecaps);
      setMessage(t({ en: "Updated", zh: "已更新" }));
      setTimeout(() => setMessage(""), 2000);
    });
  }

  return (
    <div>
      {archivedSlug ? (
        <div className="mb-6 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-medium">
            {t({ en: "Activity archived successfully.", zh: "活动已归档。" })}
          </p>
          <p className="mt-0.5 text-blue-600">
            {t({
              en: `A recap draft has been created for "${archivedSlug}". Edit it below to add photos and publish it to the recap page.`,
              zh: `已为"${archivedSlug}"创建回顾草稿，请在下方编辑并添加照片后发布到往期回顾页面。`,
            })}
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          {t(adminCopy.recaps.title)}
        </h2>
        {message ? <span className="text-sm text-green-600">{message}</span> : null}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-400">
              <th className="py-3 pr-4">{t(adminCopy.recaps.recap)}</th>
              <th className="px-4 py-3">{t(adminCopy.recaps.date)}</th>
              <th className="px-4 py-3">{t(adminCopy.recaps.location)}</th>
              <th className="px-4 py-3">{t(adminCopy.recaps.media2)}</th>
              <th className="px-4 py-3">{t(adminCopy.recaps.sourceEvent)}</th>
              <th className="px-4 py-3">{t(adminCopy.events.status)}</th>
              <th className="py-3 pl-4">{t(adminCopy.events.actions)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recaps.map((recap) => {
              const isJustArchived = recap.eventSlug === archivedSlug;
              return (
                <tr
                  key={recap.slug}
                  className={`hover:bg-gray-50 ${isJustArchived ? "bg-blue-50/40" : ""}`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{t(recap.title)}</p>
                    <p className="text-xs text-gray-400">{recap.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(recap.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t(recap.location)}</td>
                  <td className="px-4 py-3 text-gray-500">{recap.media.length}</td>
                  <td className="px-4 py-3">
                    {recap.eventSlug ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        {recap.eventSlug}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        recap.status === "published"
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {recap.status === "published"
                        ? t(adminCopy.recaps.published)
                        : t(adminCopy.recaps.draft)}
                    </span>
                  </td>
                  <td className="py-3 pl-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/recaps/${recap.slug}/edit`}
                        className="rounded px-2 py-1 text-xs font-medium text-snow-600 hover:bg-snow-50"
                      >
                        {t(adminCopy.recaps.edit)}
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleStatus(recap.slug)}
                        disabled={isPending}
                        className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      >
                        {recap.status === "published"
                          ? t(adminCopy.recaps.unpublish)
                          : t(adminCopy.recaps.publish)}
                      </button>
                      {recap.eventSlug ? (
                        <form action={unarchiveRecapAction}>
                          <input type="hidden" name="slug" value={recap.slug} />
                          <button
                            type="submit"
                            onClick={(event) => {
                              if (
                                recap.status === "published" &&
                                !window.confirm(
                                  t(adminCopy.recaps.unarchivePublishedConfirm),
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                          >
                            {t(adminCopy.recaps.unarchive)}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card mt-8">
        <h3 className="text-lg font-semibold text-gray-900">
          {t(adminCopy.recaps.bilingualCheck)}
        </h3>
        <p className="mt-1 text-sm text-gray-400">{t(adminCopy.recaps.bilingualCheckHelp)}</p>
        <div className="mt-4 divide-y divide-gray-100">
          {recaps
            .filter((recap) => recap.status === "published")
            .map((recap) => {
              const missing = recapMissingFields(recap);

              return (
                <div key={recap.slug} className="flex items-center justify-between py-2">
                  <span className="text-sm">{t(recap.title)}</span>
                  {missing.length > 0 ? (
                    <span className="text-xs text-red-600">
                      {t({ en: `Missing: ${missing.join(", ")}`, zh: `缺失：${missing.join("、")}` })}
                    </span>
                  ) : (
                    <span className="text-xs text-green-600">{t(adminCopy.recaps.complete)}</span>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

async function setRecapStatusAction(formData: FormData): Promise<EventRecap[]> {
  const response = await fetch("/admin/recaps/status", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) return [];
  return (await response.json()) as EventRecap[];
}
