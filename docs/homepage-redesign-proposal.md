# SnowForce cinematic homepage

Approved visual: the second image from the latest exploration, `/workspace/generated_images/exec-bc75c1d6-26a8-432b-9198-6db3b49772c5.png`.

The implementation retains the existing mountain video and introduces left-aligned bilingual headings, large outlined SNOW / FORCE typography, a dark departure preview, and a light community story with sticky imagery and a preparation sequence. Genuine existing SnowForce imagery replaces illustrative concept photos. Navigation, event details, FAQs, accounts, stories and commerce retain their existing routes.

Motion uses native CSS scroll timelines for image depth, outlined lettering drift and section reveals. Unsupported browsers show the full static page. Mobile visitors get a simpler layout without scroll-driven effects. Reduced-motion preference disables decorative motion. Video downloads begin only after an explicit play action; offscreen and background playback pauses and never restarts merely because the visitor scrolls back.

Public homepage content uses server-only, anonymous summary queries: at most three published events and three published recap covers. Open events sort before full events. The homepage never reads registration records, form questions, event modules, article bodies or entire albums. Commerce requests a maximum of three products rather than crawling the entire catalog. Successful reads are shared in Next Data Cache for 300 seconds, independently per content source. Failures are caught outside the cached reads. Staff event and recap changes invalidate the homepage. Availability and final prices are checked on the detail/registration flow.

No database schema, payment, member authorization or deployment changes. Real production egress reduction must be measured after deployment; the supplied billing screenshot alone does not identify the source of the traffic.

Final mobile direction: retain the immersive full-bleed background rather than the separated landscape-panel trial. Use playback-synchronised focal positions for the snowpeak, rider and board in the existing 15-second video. On explicit playback, mobile copy temporarily fades out and the decorative wordmark becomes quieter; pausing restores the event links. Some horizontal crop is inevitable, so keeping the main subject visible takes priority over showing the entire panorama. Desktop composition and data caches are unchanged.
