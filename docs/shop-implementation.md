# SnowForce gear shop

## Reference projects reviewed

- [Vercel Commerce](https://github.com/vercel/commerce): Next.js App Router storefront, with image-led product tiles and separate product routes. The maintained implementation uses Shopify. Reviewed `components/grid/three-items.tsx`.
- [Medusa Next.js Starter](https://github.com/medusajs/nextjs-starter-medusa): product listing refinements, detail pages, variants, cart and checkout. Requires a Medusa backend. Reviewed `src/modules/store/templates/index.tsx`.
- [Medusa DTC Starter](https://github.com/medusajs/dtc-starter): a larger storefront/backend monorepo; useful for later full commerce operations, but unnecessary for this catalog release.

The SnowForce implementation is original code within the current Next.js 14 app. No upstream source or dependencies were copied. It follows the existing bilingual language provider and design system.

## Current experience

`/shop` lists 14 curated styles across VECTOR, BURTON, ISEE MIGGA, PSN and REV. Brand/category filters, bilingual text search, reference-price sorting and empty-state recovery work locally. `/shop/[slug]` provides product information, catalog colors/sizes, USD reference prices and related gear. Unknown slugs return Next.js not-found.

The selection drawer stores validated product/variant/quantity records in `snowforce-shop-selection-v1`. Identical variants merge, quantities range from 1 to 99, and invalid or stale persisted records are discarded. Storage failures leave a usable in-page selection with an explicit notice. Native `<dialog>` supplies modal focus containment, Escape dismissal and focus restoration. A selected product can be copied as an inquiry or opened in the user's email client. The website does not send messages automatically.

## Catalog provenance

All product photos and details come from the supplied `Products/` PDFs. `src/lib/shop/catalog.ts` records the source filename and one-based PDF page for each item. `scripts/shop/asset-manifest.json` records image crop coordinates as fractions of the original page. VECTOR adult pages 13/15 and children pages 12/14 were reviewed visually because their text is embedded in images. The PSN PDF cover says 2026/27, while page 3 labels its Arctic range 2025/26; product copy deliberately does not assert a release year for that range.

The source values remain CNY catalog reference prices internally. Public prices are estimated USD amounts converted using a fixed 2026-09-29 snapshot of 6.712 CNY per USD, sourced from https://wise.com/us/currency-converter/usd-to-cny-rate/history/29-09-2026. This is not a live rate or a committed SnowForce sale price. The Aspen price covers the jacket only, even though the photo shows a full look. Sizes and colors are selectable only where established by the source. Images show the catalog styling and do not change when selecting another color. Provenance remains in the catalog and asset manifest. Full catalog page images are not displayed or linked on public detail pages because they contain CNY prices.

To regenerate the committed WebP assets, run `python scripts/shop/extract_catalog_assets.py` from the repository root with Pillow and pypdfium2 installed and the original PDFs present. This script is not required for app builds. The source PDFs are not published or copied into `public/`.

## Commerce boundary

This first release supports browsing and selection inquiries. It does not create orders, reserve stock, take payments, calculate taxes/shipping or reuse event-registration payment logic. Final prices, availability, fulfillment regions and return terms need business confirmation before adding a transactional checkout. A future commerce backend should own product variants, inventory, orders and dedicated payment fulfillment.

## Validation

The storefront was subsequently refined using CRMEB and Spree live UI patterns and Saleor/Medusa project guidance: compact discovery layout, category/brand entry points, framed product cards, URL category entry, product photo expansion, quantity selection, mobile options shortcut, information sections and USD selection estimates. Research evidence and adaptation decisions are in `docs/shop-reference-research.md`.

The homepage includes a bilingual featured shop section directly after past event recaps and before current events. It reuses the product cards and USD price formatter for snowwear, goggles and kids' gear, with links to each product and the full shop. Product cards carry their own Tailwind styling so they render consistently outside the shop route.

Focused tests cover combined filters, bilingual browsing, navigation discovery, ordering by reference price, source/asset consistency, unknown product routes, variant requirements, persistence validation, quantity limits, inquiry composition and clipboard failure recovery. Full suite/build/coverage results and browser findings are recorded in `docs/shop-verification.md`.
