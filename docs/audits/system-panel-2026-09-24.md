# Superadmin system drawer — 2026-09-24

## Scope
- Right-side statistics-only native modal drawer. Main navigation and administrative actions stay on the left.
- Recipient announcements move to a separate Tasks → Announcements tab; legacy URLs preserve the supported view/flash parameters. Audience, dismissal and administration permissions remain unchanged.
- API retains actual-user SUPER_ADMIN authorization. Data is fetched only while the drawer is open and the browser tab visible; failures retain the timestamped last response.
- No Render integration, external scraping, hosting capacity limits, public registration changes or outbound messages.

## Measurement definitions
- Registered users exclude explicitly flagged test identities; disabled real accounts remain registered. Active 30-day and online users must also have an active account and heartbeat in the relevant window. Online remains the existing two minutes.
- Active houses and units belong to this installation. Units in archived houses or with INACTIVE operational status are excluded. Property demo classification does not exist yet; do not aggregate sandbox numbers into production/group reporting. The UI says demo properties are included.
- File totals use unique FileAsset records and original sizeBytes. Soft-deleted records are shown separately, with no claim that physical files were removed. Previews, thumbnails and inline avatars are not included. This is an evidence total, not hosting disk occupancy.
- Database size is queried from PostgreSQL; unavailable is distinct from zero. Hosting metrics and capacities are deferred.
- Scheduler state uses its latest completion audit and a 26-hour stale threshold, catches failed import steps even if the scheduler's legacy main action reports success. It is not an uptime monitor.
- Import periods represent stored observations, not proof of freshness at the upstream source. Failed mail count covers RentNotification failures in the last 24 hours, not all application email.

## History
- Additive SystemDailySnapshot table; one immutable first measurement per UTC day. Concurrent collectors use INSERT ON CONFLICT DO NOTHING.
- Existing scheduler collects daily; opening the panel is an explicit fallback on installations without cron. Gaps are not backfilled or connected by lines. No separate paid cron is provisioned.
- Last 90 days shown, full stored history retained. Thirty-day deltas require an actual observation for that date. No personal identifiers are stored in snapshots.

## Validation
- Local Prisma validation, TypeScript and production build; isolated CI migration and Playwright gates required before merge.
- Tests cover authorization, exclusion of test identities and inactive units, immutable concurrent daily capture, responsive light/dark rendering, focus return, Escape/outside closing, unchanged content position, failed refresh retaining data, announcement navigation and legacy redirect.
- Browser screenshots are saved in CI evidence for desktop light/dark and mobile.
