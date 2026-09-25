# FlatBerry landing — sandbox

Scope: public root page, isolated CSS module, optimized presentation assets, legal-information placeholder, public-page regression tests. No auth, application UI, schema, data or deployment configuration changes.

## Asset provenance
- `public/landing/logo.webp` is a lossless whitespace crop of the repository's original `public/flatberry-logo.png`; lettering and symbol have not been redrawn.
- Application screenshots preserve the actual captured interface. Identifying demo labels were replaced with generic Czech names and house avatars. Marketing copies only: contracts 8, tasks 3; admin analysis control, pointer and right browser scrollbar removed; portfolio KPI column removed; internal Asset report tab removed.
- House photography, Berry and the owner/professional composition originate from the approved visual proposal. The laptop contains the sanitized real application screen.
- Contact phone omitted. Previously shown 605 525 606 originated from the user-provided FlatCloud H1 2025 report, p.14; current validity unverified. Contact email remains info@flatcloud.cz.

## Behavior
- Root page is accessible without login. Existing `/login`, `/portfolio` and authentication/proxy rules are unchanged.
- CTA honors PUBLIC_REGISTRATION_ENABLED at request time. Registration when enabled; an email request for tester access otherwise.
- Native FAQ and mobile navigation work without custom client JS. Disabled resources intentionally have no destination.
- No analytics or marketing scripts added; sandbox noindex inherited from root layout.
- Legal footer routes exist, with clearly marked test-environment scope. Final service terms/full application privacy notices remain pre-launch work.

## Verification
- Local production build and Prisma validate passed.
- TypeScript and diff whitespace checks passed.
- PR CI provides isolated PostgreSQL migration and browser smoke evidence before sandbox merge.

## Approved matrix restoration

The desktop source of truth is `onepager-v04/FlatBerry_onepager_B_cely_navrh.png` (1600 × 9750) and its source composition. Restore its exact claims, section copy, centered hero and closing CTA, left/right benefits introduction, gallery composition, expanded FAQ and proportions. Bundle the original DejaVu typography with its license. Mobile reflows this same content.

Retain only requested differences: original supplied logos, remove hero tester-limit note, sanitized real screenshots (8 contracts / 3 tasks, no superadmin icon, cursor or right sidebar; portfolio KPI column removed), photographic closing background, disabled resources, company and legal footer. Unverified telephone remains omitted. Registration flag and existing legal draft remain unchanged.

Regression coverage checks centered hero/closing claims, FAQ toggle, original logos, disabled resources, legal navigation, mobile overflow, and loaded-image full-page screenshots at 1600 px and 390 px.

Follow-up: use the uncropped approved composite on desktop, with feathered outer edges and its original continuous blue-white background behind the headings. Preserve the person/device positions and original pixels; mobile retains the compact crop with soft edges.


## Compact layout and application-wide privacy (25 September 2026)

Continuous full-width canvas, feathered architectural photo edges, no decorative city illustration layers. Content from the first Berry section through resources uses one 1280 px container; approved copy and composite remain intact. Screenshot checks cover 1600/1920 px desktops and 390 px mobile.

Privacy notice now covers accounts, customer-managed property data, tenants, leases, payments, documents, tasks, CRM, audit and activity data; distinguishes controller/processor roles, purposes, lawful bases, recipients, international transfers, retention criteria, rights and application cookies/storage. Sources: GDPR articles 6, 12–14, 15–22, 28, 44–49; https://uoou.gov.cz/verejnost/zakladni-prirucka-k-ochrane-udaju ; https://uoou.gov.cz/poradna/poradna-gdpr/prava-subjektu-udaju . Implementation evidence: prisma/schema.prisma, lib/auth.ts, lib/storage/index.ts, lib/inbound-bank/retention.ts and local/session storage components.

Deployment-specific processor contracts, regions, transfer safeguards, backup/log retention and DPA are not inferable from source. The test notice explicitly identifies these pending operational confirmations rather than inventing them. No security settings, retention tasks, user data, or terms-of-use paragraph are modified.
