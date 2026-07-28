# Refund Policy Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bilingual `/refund-policy` page, link it from the SnowForce footer column, and remove the full agreement from the global footer.

**Architecture:** Follow the existing client-rendered public-page pattern by using `useLanguage()` inside one focused App Router page. Keep global navigation in `Footer`, but move all policy content and cancellation-fee presentation into the new route.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File Structure

- Create `src/app/refund-policy/page.tsx`: owns the bilingual policy page and semantic cancellation-fee table.
- Create `src/app/refund-policy/page.test.tsx`: verifies footer navigation and English/Chinese policy content.
- Modify `src/components/site/footer.tsx`: points `Refund Policy / 退款政策` to the dedicated route and restores a copyright-only footer bottom row.

### Task 1: Lock the Route and Footer Behavior with Tests

**Files:**
- Create: `src/app/refund-policy/page.test.tsx`

- [ ] **Step 1: Add failing tests for the new route and footer destination**

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Footer } from "@/components/site/footer";
import { LanguageProvider } from "@/lib/language";
import RefundPolicyPage from "./page";

function renderInLanguage(ui: React.ReactNode, language: "en" | "zh") {
  document.cookie = `lang=${language};path=/`;
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("RefundPolicyPage", () => {
  beforeEach(() => {
    document.cookie = "lang=en;path=/";
  });

  it("links the footer item to the dedicated refund policy route", () => {
    renderInLanguage(<Footer />, "en");
    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refund-policy");
    expect(screen.queryByText(/Refund and itinerary change statement/)).not.toBeInTheDocument();
  });

  it("renders the English policy and fee schedule", () => {
    renderInLanguage(<RefundPolicyPage />, "en");
    expect(screen.getByRole("heading", { level: 1, name: "Refund Policy" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "14–8 days before the event" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "50%" })).toBeInTheDocument();
  });

  it("renders the Chinese policy and fee schedule", () => {
    renderInLanguage(<RefundPolicyPage />, "zh");
    expect(screen.getByRole("heading", { level: 1, name: "退款政策" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "活动开始前 14–8 日" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "50%" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails before implementation**

Run: `npx vitest run src/app/refund-policy/page.test.tsx`

Expected: FAIL because `src/app/refund-policy/page.tsx` does not exist and the footer still links to `#refund-policy`.

### Task 2: Create the Bilingual Refund Policy Page

**Files:**
- Create: `src/app/refund-policy/page.tsx`

- [ ] **Step 1: Implement the page with semantic sections and fee table**

Create a client page that calls `useLanguage()` and renders:

```tsx
"use client";

import { useLanguage } from "@/lib/language";

export default function RefundPolicyPage() {
  const { t } = useLanguage();

  return (
    <main className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <header className="text-center">
          <h1 className="section-title">{t({ en: "Refund Policy", zh: "退款政策" })}</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#7a7a7a]">
            {t({
              en: "Unless an event page states otherwise, the following policy applies to confirmed SnowForce registrations.",
              zh: "除活动页面另有说明外，以下政策适用于所有已确认的 SnowForce 活动报名。",
            })}
          </p>
        </header>

        <section className="mt-10 border-t border-[#e0e0e0] pt-8">
          <h2 className="text-xl font-semibold text-[#1d1d1f]">
            {t({ en: "Event changes and cancellations", zh: "活动变更与取消" })}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-7 text-[#333333]">
            <p>{t({ en: "In rare circumstances, SnowForce reserves the right to modify, postpone, or cancel an event due to weather, transportation, venue conditions, public safety, force majeure, or other reasons beyond SnowForce's control.", zh: "在极少数特殊情况下，因天气、交通、场地、公共安全、不可抗力或其他 SnowForce 无法控制的原因，SnowForce 保留更改、推迟或取消活动的权利。" })}</p>
            <p>{t({ en: "SnowForce also reserves the right to cancel an event when the minimum group size is not met.", zh: "若因成团人数不足等原因无法成行，SnowForce 亦保留取消活动的权利。" })}</p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-[#1d1d1f]">
            {t({ en: "Cancellation fees", zh: "取消费用" })}
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-[#e0e0e0]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#f5f5f7] text-[#333333]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t({ en: "Cancellation timing", zh: "取消时间" })}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t({ en: "Fee", zh: "费用" })}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0e0] text-[#333333]">
                <tr><td className="px-4 py-4">{t({ en: "14–8 days before the event", zh: "活动开始前 14–8 日" })}</td><td className="px-4 py-4 font-semibold">50%</td></tr>
                <tr><td className="px-4 py-4">{t({ en: "Within 7 days or on the event day", zh: "活动开始前 7 日内或活动当天" })}</td><td className="px-4 py-4 font-semibold">100%</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
```

### Task 3: Point the Footer to the Dedicated Page

**Files:**
- Modify: `src/components/site/footer.tsx:20-54`

- [ ] **Step 1: Replace the anchor destination**

Change:

```tsx
<FooterLink href="#refund-policy">{t({ en: "Refund Policy", zh: "退款政策" })}</FooterLink>
```

to:

```tsx
<FooterLink href="/refund-policy">{t({ en: "Refund Policy", zh: "退款政策" })}</FooterLink>
```

- [ ] **Step 2: Remove the full agreement and restore the copyright-only footer row**

Use:

```tsx
<div className="mt-10 border-t border-[#e0e0e0] pt-6 text-[12px] leading-none tracking-[-0.12px] text-[#7a7a7a]">
  &copy; {new Date().getFullYear()} SnowForce. {t({ en: "All rights reserved.", zh: "保留所有权利。" })}
</div>
```

### Task 4: Verify Behavior

**Files:**
- Verify: `src/app/refund-policy/page.tsx`
- Verify: `src/app/refund-policy/page.test.tsx`
- Verify: `src/components/site/footer.tsx`

- [ ] **Step 1: Run the focused test**

Run: `npx vitest run src/app/refund-policy/page.test.tsx`

Expected: 3 tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit 0; existing unrelated `<img>` warnings may remain.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0. If the local install is stale, report missing declared dependencies separately rather than changing application behavior.

- [ ] **Step 4: Exercise the route in a browser**

Verify at desktop and mobile widths:

- Footer link opens `/refund-policy`.
- English and Chinese policy copy switches with the site language control.
- The fee table remains readable at 375px.
- The global footer no longer displays the full agreement.
