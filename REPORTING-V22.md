# V22 reporting semantics

This document is the source of truth for V22 KPI meaning.

## Time, live data and revisions

`asOf` means facts effective on or before the named `Europe/Prague` business date. Q1 is Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep and Q4 Oct–Dec; normal report as-of is the final calendar date. A calculated snapshot canonicalizes every instant to Prague local midnight for its business-date key; year and quarter are derived from that key. Calls within the same Prague date therefore share one revision stream. Live data may be recalculated. A snapshot is immutable and carries schema/calculator versions, quality and provenance. Recalculation atomically creates revision N+1 (starting at 1) in a serializable transaction with controlled retry. A published report retains its linked snapshot.

`CALCULATED` means critical automatic fields passed schema/quality rules. `MANUAL_BASELINE` is a sourced historical point for incomplete source data; it contains only known KPIs and never invents missing values. `sourceNote` records provenance.

## Occupancy

Operational state is the latest event effective by as-of. Before the first event it is unknown; current unit state is never projected backward. `STANDARD` is rentable; `RENOVATION` and `INACTIVE` are separate and excluded from the denominator. Unknown is excluded and warned. A rentable unit is occupied when shared `leaseStatusAt` is `ACTIVE`; vacancy is rentable minus occupied. Lease end is inclusive. Renovation is not vacancy.

## Rent roll

Monthly net rent run-rate sums effective rent for occupied rentable units. Source priority: as-of month RENT `ChargeItem`; effective RENT `LeasePaymentItem`; legacy `Lease.rentCents` only with warning. A missing current-month charge emits `MISSING_CHARGE_FOR_PERIOD`. Services follow the hierarchy. Weighted rent/m² divides rent by area only for units with known area > 0; exclusions count in `missingAreaUnits`. If no valid area denominator exists, weighted rent/m² is `null`, not zero. Throughout calculated data, `null` means mathematically unknown/undefined while `0` means a known, actual zero; critical fields that can be calculated remain non-null.

## Collections, overdue and deposits

Quarter expected is every active charge amount in the quarter through as-of. It includes real obligations from leases that ended during the quarter; it is not restricted to leases active at quarter-end. `Charge.active` remains the semantic source of truth, so a cancelled contract does not create an obligation unless an active charge actually exists. Quarter paid uses `paidCentsAsOf`. Rate is paid/expected in basis points; expected zero yields null, never artificial 100%. Allocation effective dates are transaction `bookedAt`, offset `effectiveAt`, and credit-application `effectiveAt`; same-day is included, future excluded. Overdue requires active charge, due date strictly before as-of, and positive historical outstanding, including outstanding debt from an ended lease.

Deposit KPIs reuse `securityDepositSnapshot(lease, asOf)`; reporting never duplicates ledger math. Agreed coverage, missing amount and `FUNDED`/`PARTIAL`/`UNPAID` counts describe only leases active at as-of. Held principal additionally includes ended leases whose deposit status is `TO_SETTLE`, and those increment `toSettleLeases`. A fully settled ended lease contributes zero; its historical agreed amount is not added to current coverage.

Lease classifications use shared lifecycle dates, not cached status. `expiring90Days` counts active leases whose effective end is after as-of and no later than 90 calendar days after the Prague business date. `endedYtd` counts non-cancelled leases with an effective end from January 1 through as-of inclusive; cancelled-before-start contracts are excluded.

## Quality, scope and publication

Quality JSON has stable code, `INFO/WARNING/BLOCKER`, message and optional entity IDs. Initial codes cover unknown operational history, missing area, legacy/missing rent, missing charge, deposit configuration and no rentable units. Calculators disclose fallbacks and never turn unknown history into silent facts.

Rent scope is requested context intersected with global/property/unit grants; unit-only calculations include only granted units. Shareholder calculations separately intersect group membership with effective group-property history. Neither grants the other.

Quarterly reports are group/year/quarter revisions. Every property row has mandatory snapshot ID, retaining its numerical origin. `PUBLISHED` is designed for immutable publication; future PDF/media must be explicitly published assets rather than mutable live output.

Reporting-group property membership uses inclusive Prague business-date intervals. For one group/property pair intervals must not overlap; adjacent `...-06-30` then `...-07-01` intervals are valid. This is an application-level invariant enforced by the shared interval validator (PostgreSQL has no extension-dependent exclusion constraint in V22-A).
