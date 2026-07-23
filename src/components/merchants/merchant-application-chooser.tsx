"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import type { MerchantPortalEvent } from "@/lib/merchants/portal";
import { MerchantApplicationStatus } from "./merchant-application-status";

type MerchantApplicationChooserProps = {
  readonly events: readonly MerchantPortalEvent[];
};

export function MerchantApplicationChooser({ events }: MerchantApplicationChooserProps) {
  const { lang, t } = useLanguage();

  return (
    <section className="space-y-5">
      <header>
        <p className="label text-snow-700">{t({ en: "Merchant booths", zh: "商家展位" })}</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--sf-ink)]">{t({ en: "Choose an eligible event", zh: "选择可申请活动" })}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--sf-text-muted)]">{t({ en: "Each event accepts one active application per verified merchant.", zh: "每个活动仅接受每位已验证商家的一份有效申请。" })}</p>
      </header>
      {events.length === 0 ? (
        <div className="merchant-status">
          <p className="font-semibold text-[var(--sf-ink)]">{t({ en: "No events are accepting merchant booths right now.", zh: "目前没有活动正在接受商家展位申请。" })}</p>
        </div>
      ) : (
        events.map(({ event, applicationState }) => {
          const program = event.merchantBoothProgram;
          const firstPlan = program?.plans[0];
          return (
            <article key={event.slug} className="merchant-portal-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--sf-ink)]">{lang === "en" ? event.title.en : event.title.zh}</h2>
                  <p className="mt-2 text-sm text-[var(--sf-text-muted)]">{event.eventDate}</p>
                </div>
                {!applicationState && firstPlan ? <Link href={`/merchant/applications?event=${encodeURIComponent(event.slug)}&plan=${encodeURIComponent(firstPlan.id)}`} className="btn-primary">{t({ en: "Select booth plan", zh: "选择展位方案" })}</Link> : null}
              </div>
              {applicationState ? <div className="mt-5"><MerchantApplicationStatus event={event} state={applicationState} /></div> : null}
            </article>
          );
        })
      )}
    </section>
  );
}
