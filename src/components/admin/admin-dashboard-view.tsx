"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Clipboard, ListChecks, RotateCw } from "lucide-react";
import { buildShiftBrief, type Operation, type OperationGroup, type OperationKind } from "@/lib/admin-operations";
import { useLanguage } from "@/lib/language";
import type { PartnerInquiry } from "@/lib/types";
import { adminCopy } from "./admin-copy";
import { AdminOpsGuide } from "./admin-ops-guide";

type Stat = { key: keyof typeof adminCopy.dashboard; value: number | null; href: string };
type UnavailableSource = "events" | "registrations" | "recaps" | "inquiries" | "cancellations";
const control = "rounded border border-gray-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow-600";

export function AdminDashboardView({ stats, operations, unavailable, inquiries }: {
  stats: Stat[];
  operations: Operation[];
  unavailable: UnavailableSource[];
  inquiries: Pick<PartnerInquiry, "id" | "organizationName" | "contactName" | "contactEmail" | "message">[];
}) {
  const { lang, t } = useLanguage();
  const copy = adminCopy.operations;
  const [group, setGroup] = useState<OperationGroup | "all">("all");
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const labels = Object.fromEntries(Object.entries(copy.kinds).map(([kind, label]) => [kind, label[lang]])) as Record<OperationKind, string>;
  const brief = buildShiftBrief(operations, labels, lang, unavailable.length > 0);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = operations.filter((operation) => (group === "all" || operation.group === group) &&
    [operation.title.en, operation.title.zh, operation.context.en, operation.context.zh, labels[operation.kind]].some((text) => text.toLocaleLowerCase().includes(normalizedQuery)));
  const reviewCount = operations.filter((operation) => operation.priority === "review").length;

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-500"><ListChecks size={18} aria-hidden="true" /> SNOWFORCE / OPS</div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{t(copy.title)}</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">{t(copy.intro)}</p>
        </div>
        <button className={`${control} inline-flex items-center gap-2 bg-white text-gray-700`} onClick={() => window.location.reload()}><RotateCw size={16} aria-hidden="true" />{t(copy.refresh)}</button>
      </header>

      {unavailable.length > 0 && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">{t(copy.partial)}</p>
        <p className="mt-1">{unavailable.map((source) => source === "cancellations" ? t(copy.cancellations) : t(adminCopy.dashboard[source])).join(" · ")}</p>
      </div>}

      <AdminOpsGuide />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section id="ops-work-queue" className="min-w-0 scroll-mt-24 overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby="work-queue-title">
          <div className="border-b border-gray-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="work-queue-title" className="text-lg font-semibold text-gray-900">{t(copy.queue)}</h3>
              <p className="text-xs text-gray-600">{t(copy.review)}: {reviewCount} · {t(copy.prepare)}: {operations.length - reviewCount}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t(copy.queue)}>
              {(["all", "people", "payments", "publishing"] as const).map((key) => <button key={key} aria-pressed={group === key} onClick={() => setGroup(key)}
                className={`${control} ${group === key ? "border-snow-600 bg-snow-50 text-snow-700" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {t(copy[key])} <span className="ml-1 tabular-nums">{key === "all" ? operations.length : operations.filter((operation) => operation.group === key).length}</span>
              </button>)}
            </div>
            <label className="mt-4 block text-xs font-medium text-gray-600" htmlFor="operation-search">{t(copy.search)}</label>
            <input id="operation-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${control} mt-1 w-full bg-white text-gray-900`} />
          </div>
          <div aria-live="polite">
            {visible.length === 0 ? <div className="p-8 text-center text-sm text-gray-600">
              <p>{t(operations.length === 0 ? copy.empty : copy.noMatches)}</p>
              {(query || group !== "all") && <button onClick={() => { setQuery(""); setGroup("all"); }} className={`${control} mt-4 text-snow-700`}>{t(copy.reset)}</button>}
            </div> : <ol className="divide-y divide-gray-100">
              {visible.map((operation) => <li key={operation.id}>
                <Link href={operation.href} className="group flex items-center gap-4 p-4 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-snow-600 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold ${operation.priority === "review" ? "text-amber-800" : "text-gray-500"}`}>{labels[operation.kind]}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-gray-900">{t(operation.title) || operation.title.zh || operation.title.en}</p>
                    <p className="mt-1 break-words text-xs text-gray-500">{t(operation.context) || operation.context.zh || operation.context.en}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-snow-700"><span className="hidden sm:inline">{t(copy.open)}</span><ArrowRight size={16} aria-hidden="true" /><span className="sr-only sm:hidden">{t(copy.open)}</span></span>
                </Link>
              </li>)}
            </ol>}
          </div>
        </section>

        <aside className="space-y-5">
          <section id="ops-shift-handoff" className="scroll-mt-24 rounded-lg bg-gray-900 p-5 text-white" aria-labelledby="shift-title">
            <Clipboard size={20} className="mb-3 text-gray-300" aria-hidden="true" />
            <h3 id="shift-title" className="font-semibold">{t(copy.brief)}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-300">{t(copy.briefHelp)}</p>
            <button onClick={copyBrief} className={`${control} mt-4 w-full border-white bg-white font-medium text-gray-900 hover:bg-gray-100`}>{t(copy.copy)}</button>
            <p role="status" className="mt-2 text-xs text-gray-200">{copyStatus === "copied" ? t(copy.copied) : copyStatus === "failed" ? t(copy.copyFailed) : ""}</p>
            {copyStatus === "failed" && <textarea aria-label={t(copy.manualCopy)} readOnly value={brief} rows={9} className="mt-2 w-full rounded bg-white p-2 text-xs text-gray-900" onFocus={(event) => event.target.select()} />}
          </section>
          <section id="inquiries" className="scroll-mt-24 rounded-lg border border-gray-200 p-5" aria-labelledby="inquiries-title">
            <h3 id="inquiries-title" className="font-semibold text-gray-900">{t(copy.inquiries)} <span className="text-gray-500">({inquiries.length})</span></h3>
            {unavailable.includes("inquiries") ? <p className="mt-3 text-sm text-amber-800">{t(copy.unavailable)}</p> : inquiries.length === 0 ? <p className="mt-3 text-sm text-gray-500">{t(copy.noInquiries)}</p> :
              <div className="mt-3 divide-y divide-gray-100">{inquiries.map((inquiry) => <details key={inquiry.id} className="py-3 text-sm">
                <summary className="cursor-pointer break-words font-medium text-gray-800">{inquiry.organizationName}</summary>
                <p className="mt-2 break-words text-xs text-gray-500">{inquiry.contactName} · {inquiry.contactEmail}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-gray-600">{inquiry.message}</p>
                <a href={`mailto:${encodeURIComponent(inquiry.contactEmail)}`} className="mt-3 inline-block text-sm font-medium text-snow-700 underline">{t(copy.reply)}</a>
              </details>)}</div>}
          </section>
          <details className="rounded-lg border border-gray-200 p-5 text-sm">
            <summary className="cursor-pointer font-medium text-gray-800">{t(copy.guide)}</summary>
            <p className="mt-3 leading-6 text-gray-600">{t(copy.guideText)}</p>
          </details>
        </aside>
      </div>

      <div className="grid grid-cols-2 divide-gray-200 rounded-lg border border-gray-200 bg-gray-50 sm:grid-cols-5">
        {stats.map((stat) => <Link key={stat.key} href={stat.href} className="p-4 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-snow-600">
          <p className="text-xs text-gray-600">{t(adminCopy.dashboard[stat.key])}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{stat.value ?? "—"}<span className="sr-only">{stat.value === null ? t(copy.unavailable) : ""}</span></p>
        </Link>)}
      </div>
    </div>
  );
}
