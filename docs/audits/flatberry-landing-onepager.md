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
