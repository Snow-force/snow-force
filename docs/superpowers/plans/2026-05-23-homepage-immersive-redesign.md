# Homepage Immersive Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved video-led SnowForce homepage that focuses on community collective activity registration without implying built-in carpooling or room-sharing product features.

**Architecture:** Keep `src/app/page.tsx` as the server data loader for Supabase events and keep `HomePageView` as the client-rendered bilingual homepage. Move the root `snowmountain.mp4` into a public asset path, then replace the current card-heavy homepage with section components inside `HomePageView`.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, existing Supabase event repository, existing language context, existing `EventCard`.

---

## File Structure

- Modify `src/components/site/home-page-view.tsx`: replace the current homepage layout with the new immersive section sequence and helper components.
- Modify `src/app/globals.css`: add one or two reusable animation/media utilities only if the component needs them; otherwise leave global CSS alone.
- Create `public/videos/snowmountain.mp4`: public video asset served by the Next.js app.
- Optional create `public/images/home/`: only if verification shows the video needs a static poster image; otherwise do not add extra image files.
- Do not modify `src/app/page.tsx` unless a type or prop shape change becomes necessary. The existing `getEvents()` flow is correct.
- Do not create carpooling or room-sharing pages. Homepage copy must say WeChat/community coordination, not built-in logistics tooling.

## Task 1: Publish The Hero Video Asset

**Files:**
- Create: `public/videos/snowmountain.mp4`
- Source: `snowmountain.mp4`

- [ ] **Step 1: Create the public video directory**

Run:

```powershell
New-Item -ItemType Directory -Force public\videos
```

Expected: command succeeds and `public\videos` exists.

- [ ] **Step 2: Copy the provided video into the public asset path**

Run:

```powershell
Copy-Item -LiteralPath snowmountain.mp4 -Destination public\videos\snowmountain.mp4 -Force
```

Expected: `public\videos\snowmountain.mp4` exists.

- [ ] **Step 3: Verify the asset size is nonzero**

Run:

```powershell
Get-Item public\videos\snowmountain.mp4 | Select-Object Name,Length
```

Expected: `Length` is greater than `0`.

- [ ] **Step 4: Commit the asset**

Run:

```bash
git add public/videos/snowmountain.mp4
git commit -m "feat: add homepage hero video asset"
```

Expected: commit succeeds with only the video asset staged.

## Task 2: Replace The Homepage With The Immersive Section Sequence

**Files:**
- Modify: `src/components/site/home-page-view.tsx`

- [ ] **Step 1: Replace imports and top-level data derivation**

Use these imports at the top of `src/components/site/home-page-view.tsx`:

```tsx
"use client";

import Link from "next/link";
import { EventCard } from "@/components/events/event-card";
import { useLanguage } from "@/lib/language";
import { getRecaps } from "@/lib/recaps/repository";
import type { Event, EventRecap } from "@/lib/types";
```

Inside `HomePageView`, derive the display data:

```tsx
const { lang, t } = useLanguage();
const locale = lang === "zh" ? "zh-CN" : "en-US";
const recaps = getRecaps().slice(0, 4);
const openEvents = events.filter((event) => event.registrationState === "open").slice(0, 4);
```

Expected: no `getFAQs` import remains, and homepage no longer renders FAQ or partner sections.

- [ ] **Step 2: Replace the returned section order**

Return the following section sequence from `HomePageView`:

```tsx
return (
  <div className="bg-[#07090c] text-white">
    <HeroSection t={t} />
    <PhilosophySection t={t} />
    <ActivityModesSection t={t} />
    <CommunityExperienceSection t={t} />
    <PhotoWallSection recaps={recaps} t={t} locale={locale} />
    <OpenEventsSection
      events={openEvents}
      allEventCount={events.length}
      eventLoadError={eventLoadError}
      lang={lang}
      t={t}
    />
  </div>
);
```

Expected: footer remains provided by `src/app/layout.tsx`, so `HomePageView` does not render its own footer.

- [ ] **Step 3: Add `HeroSection`**

Implement the hero with `/videos/snowmountain.mp4`, centered copy, and anchors to lower page sections:

```tsx
function HeroSection({ t }: { t: Translate }) {
  return (
    <section className="relative flex min-h-[calc(100svh-96px)] items-center justify-center overflow-hidden px-4 py-24 text-center sm:px-6">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/snowmountain.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.52)_62%,rgba(7,9,12,0.94))]" />
      <div className="relative z-10 mx-auto max-w-[980px]">
        <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-white/80">SnowForce</p>
        <h1 className="mt-8 text-[58px] font-semibold leading-[0.98] text-white sm:text-[86px] lg:text-[112px]">
          {t({ en: "Ride the mountain together.", zh: "一起去雪山。" })}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-[1.55] text-white/82 sm:text-[21px]">
          {t({
            en: "Meet riders through the community, join collective mountain activities, and make the next snow day easier to join.",
            zh: "在社群里找到同行的雪友，报名参加集体活动，把下一次上山变成一件容易发生的事。",
          })}
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="#open-events" className="btn-primary bg-white text-[#111827] hover:bg-white/90">
            {t({ en: "View open events", zh: "查看正在报名" })}
          </Link>
          <Link href="#how-we-ride" className="btn-secondary border-white/70 bg-transparent text-white hover:bg-white/10">
            {t({ en: "See how it works", zh: "看看怎么玩" })}
          </Link>
        </div>
      </div>
    </section>
  );
}
```

Expected: hero fills the first viewport below the sticky nav and video is decorative for screen readers.

- [ ] **Step 4: Add philosophy, activity modes, and community sections**

Implement three focused sections with bilingual copy:

```tsx
function PhilosophySection({ t }: { t: Translate }) {
  return (
    <section className="bg-[#07090c] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
        <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#7dd3fc]">
          {t({ en: "Why we exist", zh: "为什么存在" })}
        </p>
        <div>
          <h2 className="text-[38px] font-semibold leading-[1.08] text-white sm:text-[56px]">
            {t({ en: "Make joining a snow day feel simple.", zh: "让上山这件事，没那么难开始。" })}
          </h2>
          <p className="mt-6 max-w-3xl text-[18px] leading-[1.65] text-white/68">
            {t({
              en: "SnowForce organizes collective mountain activities so riders do not have to figure out every detail alone: who to ride with, which session fits, and how to join the group with confidence.",
              zh: "SnowForce 组织社区集体活动，让大家不用一个人解决所有不确定：跟谁一起滑、适合参加哪一场、怎么安心加入队伍。",
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
```

Add arrays for the next two sections inside their components, using these Chinese labels exactly: `周末雪场日`, `进阶训练局`, `主题社群局`, `微信群协调`, `一起上山的氛围`, `按水平组织活动`.

Expected: copy does not claim website carpooling or room-sharing features.

- [ ] **Step 5: Add photo wall section**

Implement `PhotoWallSection` using recap cover and media data:

```tsx
function getRecapTiles(recaps: EventRecap[], t: Translate) {
  return recaps.flatMap((recap) => [
    { key: `${recap.slug}-cover`, src: recap.coverImage, title: t(recap.title), meta: t(recap.location) },
    ...recap.media.map((item, index) => ({
      key: `${recap.slug}-${index}`,
      src: item.url,
      title: t(item.caption),
      meta: new Date(recap.date).toLocaleDateString(),
    })),
  ]).slice(0, 8);
}
```

Render each tile with a CSS background image and gradient fallback:

```tsx
style={tile.src ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.72)), url(${tile.src})` } : undefined}
```

Expected: if image files are missing, tiles still show readable labels on a dark snow-inspired fallback.

- [ ] **Step 6: Add open registration section**

Implement `OpenEventsSection` with `eventLoadError`, empty state, and existing `EventCard`:

```tsx
function OpenEventsSection({ events, allEventCount, eventLoadError, lang, t }: OpenEventsSectionProps) {
  return (
    <section id="open-events" className="bg-[#f5f5f7] px-4 py-20 text-[#1d1d1f] sm:px-6 sm:py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#0066cc]">
              {t({ en: "Open registration", zh: "正在报名" })}
            </p>
            <h2 className="mt-4 text-[38px] font-semibold leading-[1.08] sm:text-[56px]">
              {t({ en: "Join the next community ride.", zh: "加入下一场集体活动。" })}
            </h2>
          </div>
          <Link href="/events" className="text-[17px] leading-[1.47] text-[#0066cc]">
            {t({ en: "All events", zh: "全部活动" })}
          </Link>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {eventLoadError ? (
            <StatusTile light>{t({ en: "Event data is not ready yet. Check the Supabase event setup.", zh: "活动数据暂时没有加载成功，请稍后再试。" })}</StatusTile>
          ) : events.length === 0 ? (
            <StatusTile light>{allEventCount > 0 ? t({ en: "No events are open for registration right now. You can still browse all events.", zh: "目前没有正在报名的活动，可以先查看全部活动。" }) : t({ en: "No upcoming events right now. Check back soon.", zh: "暂时没有活动，敬请期待。" })}</StatusTile>
          ) : (
            events.map((event) => <EventCard key={event.slug} event={event} lang={lang} t={t} />)
          )}
        </div>
      </div>
    </section>
  );
}
```

Expected: only open events appear on the homepage registration section.

- [ ] **Step 7: Run lint and fix TypeScript/ESLint issues**

Run:

```bash
npm run lint
```

Expected: lint passes. If it fails due to type names, add local types:

```tsx
type Translate = <T>(value: { en: T; zh: T }) => T;
type OpenEventsSectionProps = {
  events: Event[];
  allEventCount: number;
  eventLoadError: boolean;
  lang: "en" | "zh";
  t: Translate;
};
```

- [ ] **Step 8: Commit the homepage implementation**

Run:

```bash
git add src/components/site/home-page-view.tsx src/app/globals.css
git commit -m "feat: redesign homepage around immersive activity signup"
```

Expected: commit succeeds with homepage code changes only. Omit `src/app/globals.css` from `git add` if it was not changed.

## Task 3: Browser Verification

**Files:**
- No source files unless verification reveals a defect.

- [ ] **Step 1: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Next.js serves the app on `http://localhost:3000` or the next available port.

- [ ] **Step 2: Open the homepage in a browser**

Open:

```text
http://localhost:3000
```

Expected: homepage loads without runtime error.

- [ ] **Step 3: Verify desktop layout**

Check at a desktop viewport:

```text
1440x1000
```

Expected:

- Hero video is visible and covers the full hero.
- White hero title is centered and readable.
- The page order is hero, philosophy, how we ride, community experience, photo wall, open registration, footer.
- Community copy does not present carpooling or room sharing as website features.
- Open registration cards link to event detail pages.

- [ ] **Step 4: Verify mobile layout**

Check at a mobile viewport:

```text
390x844
```

Expected:

- Hero text wraps without overlapping buttons.
- Section headings do not overflow.
- Photo tiles and event cards stack cleanly.
- Sticky navigation does not hide the primary hero copy.

- [ ] **Step 5: Fix any visual defects and rerun lint**

If text overlaps, images break, or video does not load, patch `src/components/site/home-page-view.tsx` and rerun:

```bash
npm run lint
```

Expected: lint passes after any fixes.

- [ ] **Step 6: Commit verification fixes if needed**

Run only if Step 5 changed files:

```bash
git add src/components/site/home-page-view.tsx src/app/globals.css
git commit -m "fix: polish immersive homepage responsiveness"
```

Expected: commit succeeds with only verification fixes.
