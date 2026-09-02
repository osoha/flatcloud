# V22 reporting semantics

This document is the source of truth for V22 KPI meaning.

## Time, live data and revisions

`asOf` means facts effective on or before the named `Europe/Prague` business date. Q1 is Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep and Q4 Oct–Dec; normal report as-of is the final calendar date. A calculated snapshot canonicalizes every instant to Prague local midnight for its business-date key; year and quarter are derived from that key. Calls within the same Prague date therefore share one revision stream. Live data may be recalculated. A snapshot is immutable and carries schema/calculator versions, quality and provenance. Recalculation atomically creates revision N+1 (starting at 1) in a serializable transaction with controlled retry. A published report retains its linked snapshot.

`CALCULATED` means critical automatic fields passed schema/quality rules. `MANUAL_BASELINE` is a sourced historical point for incomplete source data; it contains only known KPIs and never invents missing values. `sourceNote` records provenance.

TRENDS-1 continues to use `MANUAL_BASELINE` as the historical source. Existing schema-version-1 baselines retain their original meaning; new immutable schema-version-2 revisions may store an explicitly known `occupancyBps` without fabricating occupied or rentable unit counts. Every save creates a new revision and `sourceNote` remains the required provenance. Trend resolution never invents a missing value or period. The current report's linked snapshot wins for its own period; otherwise an eligible `PUBLISHED` report snapshot wins over the latest eligible manual baseline. Draft and review reports use currently available revisions. For a published target, historical published reports are limited by their `publishedAt` and manual baselines by their `createdAt`, both at or before the target's `publishedAt`, so later corrections cannot retroactively change its history.

## Occupancy

Operational state is the latest event effective by as-of. Before the first event it is unknown; current unit state is never projected backward. `STANDARD` is rentable; `RENOVATION` and `INACTIVE` are separate and excluded from the denominator. Unknown is excluded and warned. A rentable unit is occupied when shared `leaseStatusAt` is `ACTIVE`; vacancy is rentable minus occupied. Lease end is inclusive. Renovation is not vacancy. Contract KPIs are independent of operational status: an active lease on a renovation, inactive, or historically unknown unit remains active/expiring even though it does not create occupancy.

## Rent roll

Monthly net rent run-rate sums effective rent for occupied rentable units. RENT and SERVICES resolve independently. Each component uses the as-of month's active `ChargeItem`, then its effective `LeasePaymentItem`, then the corresponding legacy `Lease` amount with a fallback warning. A SERVICES charge item therefore never hides a payment-item RENT, and vice versa. A present component item with amount zero is a known zero; the legacy required numeric fields cannot distinguish every historical zero from missing data, so zero legacy RENT remains missing while zero legacy SERVICES is treated as known. A missing current-month charge emits `MISSING_CHARGE_FOR_PERIOD`. Weighted rent/m² divides rent by area only for units with known area > 0; exclusions count in `missingAreaUnits`. If no valid area denominator exists, weighted rent/m² is `null`, not zero. Throughout calculated data, `null` means mathematically unknown/undefined while `0` means a known, actual zero; critical fields that can be calculated remain non-null.

## Collections, overdue and deposits

Quarter expected is every active charge amount in the quarter through as-of. It includes real obligations from leases that ended during the quarter; it is not restricted to leases active at quarter-end. `Charge.active` remains the semantic source of truth, so a cancelled contract does not create an obligation unless an active charge actually exists. Quarter paid uses `paidCentsAsOf`. Rate is paid/expected in basis points; expected zero yields null, never artificial 100%. Allocation effective dates are transaction `bookedAt`, offset `effectiveAt`, and credit-application `effectiveAt`; same-day is included, future excluded. Overdue requires active charge, due date strictly before as-of, and positive historical outstanding, including outstanding debt from an ended lease.

Deposit KPIs reuse `securityDepositSnapshot(lease, asOf)`; reporting never duplicates ledger math. Agreed coverage, missing amount and `FUNDED`/`PARTIAL`/`UNPAID` counts describe only leases active at as-of. Held principal additionally includes ended leases whose deposit status is `TO_SETTLE`, and those increment `toSettleLeases`. A fully settled ended lease contributes zero; its historical agreed amount is not added to current coverage.

Lease classifications use shared lifecycle dates, not cached status. `expiring90Days` counts active leases whose effective end is after as-of and no later than 90 calendar days after the Prague business date. `endedYtd` counts non-cancelled leases with an effective end from January 1 through as-of inclusive; cancelled-before-start contracts are excluded.

## Quality, scope and publication

Quality JSON has stable code, `INFO/WARNING/BLOCKER`, message and optional entity IDs. Initial codes cover unknown operational history, missing area, legacy/missing rent, missing charge, deposit configuration and no rentable units. Calculators disclose fallbacks and never turn unknown history into silent facts.

Operational LIVE KPIs on both `/portfolio` and `/reporty` use the same universe of accessible, active properties. Inactive and archived properties remain visible in navigation and the scope picker for historical context, but they are excluded from LIVE aggregates, including when retained in an explicit URL selection.

Rent scope is an explicit discriminated value: `ALL` means the whole portfolio, while `SCOPED` always carries complete whole-property and unit-ID grants (including an intentionally empty no-access scope). Its shared Prisma builder maps `ALL` to no filter, a non-empty scoped union to property-or-unit predicates, and empty scope to match-nothing. Requested property context is always an intersection. Shareholder calculations separately intersect group membership with effective group-property history. Neither grants the other.

Quarterly reports are group/year/quarter revisions. Every property row has mandatory snapshot ID, retaining its numerical origin. `PUBLISHED` is designed for immutable publication; future PDF/media must be explicitly published assets rather than mutable live output.

Reporting-group property membership uses inclusive Prague business-date intervals. For one group/property pair intervals must not overlap; adjacent `...-06-30` then `...-07-01` intervals are valid. This is an application-level invariant enforced by the shared interval validator (PostgreSQL has no extension-dependent exclusion constraint in V22-A).
