---
name: SnowForce
description: Bilingual snow sports activity platform for energetic community discovery and practical event operations.
colors:
  primary-blue: "#0066cc"
  primary-blue-focus: "#0071e3"
  link-blue-bright: "#2997ff"
  snow-50: "#f0f7ff"
  snow-100: "#e0effe"
  snow-500: "#1088e9"
  snow-600: "#046bc7"
  snow-700: "#0555a1"
  ink: "#1d1d1f"
  charcoal: "#272729"
  charcoal-deep: "#252527"
  text-strong: "#333333"
  text-muted: "#7a7a7a"
  text-inverse-muted: "#cccccc"
  surface: "#ffffff"
  surface-soft: "#f5f5f7"
  border-soft: "#e0e0e0"
  control-muted: "#d2d2d7"
typography:
  display:
    fontFamily: "SF Pro Display, system-ui, -apple-system, BlinkMacSystemFont, Inter, sans-serif"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: "-0.28px"
  headline:
    fontFamily: "SF Pro Display, system-ui, -apple-system, BlinkMacSystemFont, Inter, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.374px"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, SF Pro Text, Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.28px"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, SF Pro Text, Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: "-0.374px"
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, SF Pro Text, Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: "-0.224px"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  card: "18px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.primary-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-blue}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
---

# Design System: SnowForce

## 1. Overview

**Creative North Star: "Alpine Street Session"**

SnowForce should feel like a well-run mountain meet-up with real momentum: clean enough for registration trust, energetic enough to belong to a youthful snow sports community. The current implementation uses precise Apple-like typography, rounded controls, and cool blue action color; future work should keep that operational clarity while adding more vibrant, sporty, activity-led surfaces where public discovery needs energy.

This is a product system first. Public pages sell confidence in the next ride, member pages lower repeat-registration friction, and admin screens help staff scan and ship bilingual event content. The system explicitly rejects the PRODUCT.md anti-references: too corporate, luxury resort brochure, generic SaaS dashboard, and childish cartoon sports brand.

**Key Characteristics:**
- Bilingual by default, with Chinese and English UI treated as equally designed.
- Sporty and youthful in public discovery, calm and dense in staff workflows.
- Rounded, tactile controls with clear focus states and mobile-first spacing.
- Snow-blue action color used for navigation, primary calls to action, links, and progress.
- Real activity imagery should replace abstract placeholder graphics wherever possible.

## 2. Colors

The palette is cool, high-clarity, and snow-sport aligned: blue action color, near-black ink, white and icy gray surfaces, and dark charcoal bands for contrast.

### Primary
- **Lift-Line Blue**: The primary action color for main calls to action, links, progress, and public navigation emphasis. It appears as `primary-blue` in tokens.
- **Focus Blue**: The accessible focus and active border color for form controls and keyboard navigation. It appears as `primary-blue-focus`.
- **Bright Trail Link**: The brighter link color used on dark charcoal bands. It appears as `link-blue-bright`.

### Secondary
- **Snowfield Tint**: The Tailwind `snow` scale supports softer chips, info panels, progress bars, and admin links. Use `snow-50`, `snow-100`, `snow-500`, `snow-600`, and `snow-700` when the surface needs a quieter version of the primary hue.

### Neutral
- **Powder Surface**: The default white page and card surface. It appears as `surface`.
- **Icy Surface**: The soft page band, nav underlay, and subtle status background. It appears as `surface-soft`.
- **Goggle Ink**: The near-black text color used for primary content and selected controls. It appears as `ink`.
- **Night Run Charcoal**: Dark public feature bands for event and partner sections. It appears as `charcoal` and `charcoal-deep`.
- **Trail Gray**: Secondary copy and metadata. It appears as `text-strong`, `text-muted`, and `text-inverse-muted`.
- **Packed Snow Border**: The standard border and divider color. It appears as `border-soft`.

### Named Rules
**The Blue Has a Job Rule.** Blue is for action, direction, state, and progress. Do not use it as random decoration.

**The Dark Band Rule.** Dark charcoal sections must reveal active content or a strong call to action. Never use dark bands as empty mood lighting.

## 3. Typography

**Display Font:** SF Pro Display, with system-ui and Inter fallbacks
**Body Font:** system-ui / SF Pro Text, with Inter and sans-serif fallbacks
**Label/Mono Font:** system-ui for labels; monospace only for admin JSON or technical fields

**Character:** The type system is crisp, modern, and product-literate. It should feel fast to scan in admin flows and confident on public event pages, without drifting into sterile hardware-launch minimalism.

### Hierarchy
- **Display** (600, 48px to 56px, 1.07): Hero-level brand and landing page titles only.
- **Headline** (600, 34px to 40px, 1.1 to 1.2): Section headings and major page titles.
- **Title** (600, 24px, 1.18): Event cards, recap cards, and panel titles that need quick scanning.
- **Body** (400, 17px, 1.47): Main explanatory copy, form copy, details, and registration content. Keep long prose to readable line lengths around 65 to 75 characters.
- **Label** (600, 14px, -0.224px): Form labels, compact navigation, metadata, and footer headings.

### Named Rules
**The Bilingual Scan Rule.** Chinese and English strings must both fit the same component without shrinking below legible product UI sizes.

**The No Hero Inside Panels Rule.** Large display type belongs to real page heroes. Cards, admin panels, forms, and tables use title, body, and label sizes.

## 4. Elevation

SnowForce is mostly flat, using tonal bands, borders, and spacing to create hierarchy. Shadows appear only as light interaction feedback or in the current abstract hero graphic; they should not become the primary layout system.

### Shadow Vocabulary
- **Hero Ambient Lift** (`3px 5px 30px rgba(0,0,0,0.22)`): Existing abstract hero tiles only. Replace with real image treatments before expanding this pattern.
- **Card Hover Lift** (`shadow-md`): Recap cards and admin stat cards may use a subtle hover shadow to signal clickability.

### Named Rules
**The Flat Until Touched Rule.** Surfaces are flat at rest. Use borders and tonal contrast first; use shadows only for hover, focus, or a deliberate featured media treatment.

## 5. Components

### Buttons
- **Shape:** Fully rounded pill controls (`9999px`) with a minimum height of 44px.
- **Primary:** Lift-Line Blue background with white text, 17px body type, and 11px 22px padding.
- **Hover / Focus:** Use color continuity and visible focus outlines in Focus Blue. Active state may scale to 95 percent for tactile feedback.
- **Secondary:** White surface with Lift-Line Blue text and border. Use for paired actions, not as the default replacement for primary.
- **Danger:** Red is reserved for destructive or failed states. Keep it out of the brand palette.

### Chips
- **Style:** Rounded pills, 12px text, compact 4px 12px padding, soft borders or snow-tinted backgrounds.
- **State:** Tags describe event level, status, or recap category. Keep them compact and informational, not decorative badges.

### Cards / Containers
- **Corner Style:** Gently rounded event cards and panels (`18px`).
- **Background:** White cards on white, icy, or charcoal sections.
- **Shadow Strategy:** Flat by default with border separation. Hover lift is allowed only when the whole card is clickable.
- **Border:** Packed Snow Border on light surfaces; translucent white borders on dark surfaces.
- **Internal Padding:** Standard card padding is 24px; dense admin rows may be tighter.

### Inputs / Fields
- **Style:** Pill-shaped public inputs with 44px height, white background, subtle border, and 17px text. Admin editor fields may use smaller 4px radius rectangular inputs for dense bilingual editing.
- **Focus:** Border and ring move to Focus Blue. Focus state must remain visible on light and dark surfaces.
- **Error / Disabled:** Error text uses red. Disabled fields reduce opacity or use soft gray backgrounds without hiding the value.

### Navigation
- **Style:** Two-tier public nav: black global strip above a translucent icy local bar. Compact 14px links, white-on-black global items, near-black local brand text, and blue hover/action states.
- **Mobile Treatment:** Use a compact menu button in the global strip and keep language controls accessible inside the mobile menu.
- **Admin Treatment:** Horizontal tabs with small rounded active states, tuned for scanning rather than brand expression.

### Event Cards
Event cards are the signature product object. They combine tags, title, subtitle, registration state, date, location, and audience level. They should feel like an activity invitation with enough logistical clarity for riders to decide quickly.

## 6. Do's and Don'ts

### Do:
- **Do** keep the default register product-first: public screens may be expressive, but registration and admin flows must stay dependable.
- **Do** use Lift-Line Blue for actions, links, focus, progress, and selected states.
- **Do** use real snow activity images or media for public hero and recap surfaces when available.
- **Do** keep cards at `18px` radius, with `24px` padding and subtle borders, unless a dense admin table requires a tighter shape.
- **Do** test Chinese and English strings in the same component before shipping.
- **Do** preserve visible focus states and readable contrast in every registration, member, and admin flow.

### Don't:
- **Don't** make SnowForce look too corporate.
- **Don't** make SnowForce look like a luxury resort brochure.
- **Don't** make SnowForce look like a generic SaaS dashboard.
- **Don't** make SnowForce look like a childish cartoon sports brand.
- **Don't** use sterile Apple-clone minimalism when it makes the snow sports community feel distant or over-polished.
- **Don't** use blue as random decoration, gradient text, side-stripe borders, nested cards, or glassmorphism as a default style.
- **Don't** place marketing hero typography inside admin panels, event editor sections, tables, or compact cards.
