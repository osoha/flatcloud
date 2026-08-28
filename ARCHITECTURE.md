# FlatCloud – current architecture

FlatCloud is a Next.js 16 / React 19 / TypeScript application backed by Prisma 6 and PostgreSQL. It separates transactional rent operations from reproducible reporting and immutable publication inputs.

## Access and application contexts

Rent access is the intersection of the requested context and the user's grants. `SUPER_ADMIN`, `MANAGER` and explicitly configured global access use the global path; `UserProperty` grants property-wide `VIEW/EDIT/ADMIN`; `UserUnit` grants only named units. Every server-side read and mutation scopes the target again. Unit-only access never expands to another unit or to property-level content.

Shareholder reporting is independent. `ReportingGroupMember` grants `VIEW/EDIT/ADMIN` only inside a `ReportingGroup`; it does not grant access to Property, Unit, Lease, rent transactions or documents. Conversely `OWNER_VIEWER`, `UserProperty` and `UserUnit` do not imply reporting-group membership. A user may therefore have the `RENT` context, `SHAREHOLDER_REPORTING`, or both. There is deliberately no `UserRole.SHAREHOLDER`.

## Rent, lifecycle and finance

The core chain is `Property → Unit → Lease → Charge`; ownership and account assignment are separate (`PropertyOwnership`, `UnitOwnership`, `OwnerBankAccount`, `PropertyPaymentAccount`). Lease lifecycle is derived from dates by shared lifecycle helpers, not from legacy `Lease.status`. The final Prague calendar day remains active and the lease becomes ended on the following Prague date.

V21.6 introduced append-only security-deposit terms and movements. `securityDepositSnapshot(lease, asOf)` is the single ledger calculation; an event effective on the as-of Prague date is included. Credits remain `LeaseCredit`; applying one creates `LeaseCreditApplication` with explicit `effectiveAt`.

Current charge state uses all allocations. Historical reporting uses `paidCentsAsOf`, `outstandingCentsAsOf` and `overdueDebtCentsAsOf`. Allocation time comes from `BankTransaction.bookedAt`, deposit offsets from movement `effectiveAt`, and credit application from its own `effectiveAt`.

## Business calendar and operational history

`lib/calendar.ts` owns business date/month/quarter/range semantics in `Europe/Prague`. Business concepts use date keys; deterministic noon-UTC instants are used only where DateTime is required, avoiding server timezone and DST drift.

`Unit.operationalStatus` is the current cache. Historical occupancy reads append-only `UnitOperationalStatusEvent`. V22 creates a `SYSTEM_BASELINE` at rollout for each existing unit and does not claim the state existed earlier. Before the first event the result is `UNKNOWN_BEFORE_HISTORY` until a `MANUAL_BASELINE` is supplied. Create/change updates cache and event atomically; unchanged edits add no event.

## Reporting and snapshots

Live reports can be recalculated. `QuarterSnapshot` is app-level immutable: recalculation creates a revision and never updates an old record. Data and quality JSON are strictly validated and identify schema/calculator versions. `CALCULATED` requires automatic KPIs; `MANUAL_BASELINE` permits only the sourced historical subset. KPI semantics are normative in `REPORTING-V22.md`.

Targeted snapshot loaders fetch operational events, leases/payment items, charges/items/allocations/transactions, deposits and credits in bounded relation queries. They do not use the UI `accessibleProperties()` tree or query per unit.

`ReportingGroupProperty` has effective dates. `QuarterlyReport` is revisioned and progresses through `DRAFT`, `REVIEW`, `PUBLISHED`; every `QuarterlyPropertyReport` must reference its exact immutable snapshot. Future publication creates immutable publication revisions/media.

## Documents and private file storage

`FileAsset` is immutable binary metadata with random storage keys and checksum; it has no public URL. `Document` supplies mandatory property-anchored metadata and optional unit, lease, task, task-entry or compliance context. The service verifies all contextual entities belong to the same property. `ComplianceRecord.documentUrl` remains legacy compatibility; new attachments use `Document`.

Property members see non-deleted property documents. Unit-only users see only documents resolving to their unit through unit, lease, task or task entry; they cannot see property-level/compliance documents. Reporting membership grants no document access. Downloads are authorized by Document, never asset ID alone.

Storage is private behind `FileStorage`. `s3` supports AWS S3, R2 and compatible endpoints with signed downloads. `local` uses OS temp and is development/test only. Default is `disabled`; production never silently uses Render/project disk. Validation checks size, MIME and common signatures, sanitizes display names, creates UUID keys and SHA-256. Images receive aspect-preserving WebP preview/thumbnail. DB failure triggers best-effort binary cleanup; cleanup failure belongs in operational logging.

## Workspace, audit and bank verification

V21.7 consolidated scoped workspace/security checks. `TaskEntry` is an append-only conversation and Document already supports task/task-entry attachments without coupling FileAsset lifetime to task cascade. `AuditLog` remains an independent scoped mutation trail.

Bank notification email enters `InboxPayment`, trusted input materializes as technical `BankTransaction`, and allocations use destination account plus variable symbol. No bank credentials/consent are stored. Current verification source of truth is `OwnerBankAccount.notificationVerifiedAt`; `PropertyPaymentAccount.notificationVerifiedAt` is compatibility/property-link history. Ambiguous payments remain reviewable.

## Delivery

CI installs exact dependencies, generates/validates Prisma, deploys migrations to PostgreSQL, runs V20–V22 verifiers and builds. Historical migrations are immutable; V22 foundation is one additive/backfill migration without data loss.
