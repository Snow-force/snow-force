# Admin Bilingual UI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin event workflow follow the existing site language switcher and verify the editor by saving one unpublished test event.

**Architecture:** Server admin pages keep authentication and data access. Localized admin surfaces use the existing React language context in focused client components, preserving current server wrappers and the editor's always-visible English and Chinese content panels.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Supabase-backed event repository.

---

## File Structure

- `src/components/admin/admin-shell.tsx`: localized shell header and sign-out control used by the admin layout.
- `src/components/admin/admin-dashboard-view.tsx`: localized dashboard stats and recent registrations rendering.
- `src/components/admin/admin-events-view.tsx`: localized event list and bilingual audit rendering with existing event actions.
- `src/components/admin/event-editor-form.tsx`: localized event editor labels in the existing client form.
- `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/events/page.tsx`, and event new/edit pages: server wrappers delegate localized rendering.
- Admin-oriented tests under `src/components/admin` cover language-sensitive labels before the UI edits.

### Task 1: Add Admin Localization Coverage

**Files:**
- Create: `src/components/admin/admin-copy.test.ts`
- Create: `src/components/admin/admin-copy.ts`

- [ ] **Step 1: Write the failing copy test**

```ts
import { describe, expect, it } from "vitest";
import { adminCopy } from "./admin-copy";

describe("adminCopy", () => {
  it("keeps admin event workflow labels bilingual", () => {
    expect(adminCopy.events.title.zh).toBe("活动管理");
    expect(adminCopy.editor.save.en).toBe("Save Event");
    expect(adminCopy.shell.signOut.zh).toBe("退出");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm.cmd test -- src/components/admin/admin-copy.test.ts`

Expected: FAIL because `admin-copy` does not exist yet.

- [ ] **Step 3: Add the minimal shared bilingual copy object**

Create `admin-copy.ts` with strongly grouped bilingual labels for shell, dashboard, event list, and editor labels used by the touched admin screens.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm.cmd test -- src/components/admin/admin-copy.test.ts`

Expected: PASS.

### Task 2: Localize Admin Shell And Dashboard

**Files:**
- Create: `src/components/admin/admin-shell.tsx`
- Create: `src/components/admin/admin-dashboard-view.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Render shell copy from a client component**

Move shell header, site link, and sign-out form rendering into a client component using `useLanguage()` and the shared copy object while keeping `requireAdmin()` in `layout.tsx`.

- [ ] **Step 2: Render dashboard copy from a client view**

Pass loaded stats and registrations from the server page into a dashboard client view that localizes statistic labels, section heading, empty state, and registration status display text.

- [ ] **Step 3: Verify the focused tests still pass**

Run: `npm.cmd test -- src/components/admin/admin-copy.test.ts`

Expected: PASS.

### Task 3: Localize Event List And Editor

**Files:**
- Create: `src/components/admin/admin-events-view.tsx`
- Modify: `src/app/admin/events/page.tsx`
- Modify: `src/components/admin/event-editor-form.tsx`
- Modify: `src/app/admin/events/new/page.tsx`
- Modify: `src/app/admin/events/[slug]/edit/page.tsx`

- [ ] **Step 1: Move event management rendering into a localized client view**

Keep event fetch error handling in the server page, then render localized event headings, table labels, date fallbacks, state pills, action buttons, and bilingual audit output in a client view.

- [ ] **Step 2: Localize the editor form labels**

Use the shared copy object and `useLanguage()` inside the existing editor form. Keep `English Content` and `Chinese Content` explicit editing sections while translating surrounding form UI and field labels.

- [ ] **Step 3: Localize new and edit page headings**

Pass localized heading rendering through a client-facing component or editor header so `/admin/events/new` and edit pages do not keep English-only top-level labels.

- [ ] **Step 4: Run type and lint checks for the touched UI**

Run: `npm.cmd exec tsc -- --noEmit`

Expected: PASS.

Run: `npm.cmd run lint`

Expected: PASS.

### Task 4: Verify Browser Workflow And Save Draft Test Event

**Files:**
- No code files required.

- [ ] **Step 1: Run the full test suite**

Run: `npm.cmd test`

Expected: PASS.

- [ ] **Step 2: Inspect admin pages in both languages**

Use the in-app browser on `/admin`, `/admin/events`, and `/admin/events/new`. Confirm the language switcher changes admin interface copy without hiding the two content-entry language panels.

- [ ] **Step 3: Save one draft test activity**

Fill `/admin/events/new` with a unique slug such as `codex-admin-bilingual-draft-test`, valid bilingual titles and minimal draft-safe fields, then save without publishing.

- [ ] **Step 4: Confirm admin-only result**

Verify the new draft appears in `/admin/events` and remains unpublished.

