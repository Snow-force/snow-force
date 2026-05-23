# SnowForce Homepage Immersive Redesign Design

## Goal

Redesign the homepage into an immersive, video-led public landing experience that matches the user's reference style: full-screen mountain media, large white centered copy, minimal controls, and a sequential story that moves from inspiration to community trust to event registration.

The homepage should feel youthful, outdoorsy, and community-driven while keeping SnowForce's practical event discovery and Supabase-powered registration flow easy to reach.

## Page Structure

The homepage will use this order:

1. Hero Section: full-screen snow mountain video.
2. Club Philosophy: why SnowForce exists.
3. How We Ride: activity modes.
4. Community Features: carpooling, room sharing, and level matching.
5. Past Activity Photo Wall.
6. Open Registration Events: dynamically read from Supabase.
7. Footer.

## Visual Direction

The hero uses `snowmountain.mp4` as the primary background video. The implementation should move or copy it to a public asset path so Next.js can serve it directly. The video should autoplay, loop, mute, and plays inline, with a dark overlay so white text stays readable.

The page should avoid the current card-heavy Apple-like landing structure. The first sections should feel like large editorial bands: big type, spacious vertical rhythm, and immersive media. Cards are still appropriate for concrete repeated objects such as event cards and photo tiles.

The palette should lean on snow white, near-black overlays, icy blue action states, and a few warmer mountain-photo tones from imagery. Blue remains reserved for actions and links.

## Content

Hero copy should center the SnowForce identity and the mountain invitation. Suggested Chinese-first copy:

- Eyebrow: `SnowForce`
- Main title: `一起去雪山。`
- Supporting copy: `拼车、拼房、找同水平雪友，把下一次上山变成一件容易发生的事。`
- Primary action: `查看正在报名`
- Secondary action: `看看怎么玩`

English copy should remain available through the current language system:

- Main title: `Ride the mountain together.`
- Supporting copy: `Carpool, share rooms, meet riders at your level, and make the next snow day easier to join.`

The philosophy section explains that SnowForce exists to reduce the friction of joining snow sports activities: not knowing who to ride with, how to get there, where to stay, or whether the group fits your level.

The activity mode section presents three modes:

- Weekend mountain days.
- Skill progression and workshops.
- Theme sessions and social rides.

The community feature section presents:

- Carpool matching.
- Room sharing.
- Level matching.

The photo wall uses published recap data first. It should collect recap cover images and media images. If the local files are missing, it should render polished image placeholders rather than broken images.

The registration section uses the existing `events` prop from `getEvents()`, preserving Supabase as the source of truth. It should prioritize published events with open registration and link to event detail pages.

## Component And Data Flow

`src/app/page.tsx` should keep server-side loading through `getEvents()` and pass results into `HomePageView`.

`HomePageView` can remain a client component because it uses the language context. It should derive:

- `locale` from the current language.
- recap images from `getRecaps()`.
- open registration events from the `events` prop.

No new database schema is needed.

## Responsive Behavior

The hero should fill the first viewport after the sticky navigation while keeping title and actions readable on mobile. Text must wrap cleanly in Chinese and English.

Large visual sections should retain their immersive feel on mobile by using full-width bands, fixed aspect ratios for media, and compact but legible type. Event cards should stack on mobile and become a two-column layout on wider screens.

## Error And Empty States

If Supabase event loading fails, the registration section should show a concise bilingual status message.

If no events are open for registration, the section should say there are no open events right now and invite users to check all events.

If recap images are missing, the photo wall should render designed placeholders with recap titles or activity labels.

## Testing And Verification

Implementation should verify:

- `npm run lint` passes.
- The homepage renders without console errors.
- The video loads from the public path.
- Desktop and mobile screenshots show no overlapping text or broken images.
- The registration section still works when events are loaded from Supabase and when the event list is empty or errors.
