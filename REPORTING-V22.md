# V22 reporting semantics

This document is the source of truth for V22 KPI meaning.

## Time, live data and revisions

`asOf` means facts effective on or before the named `Europe/Prague` business date. Q1 is Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep and Q4 Oct–Dec; normal as-of is the final calendar date. Live data may be recalculated. A snapshot is immutable and carries schema/calculator versions, quality and provenance. Recalculation creates revision N+1. A published report retains its linked snapshot.

`CALCULATED` means critical automatic fields passed schema/quality rules. `MANUAL_BASELINE` is a sourced historical point for incomplete source data; it contains only known KPIs and never invents missing values. `sourceNote` records provenance.

## Occupancy

Operational state is the latest event effective by as-of. Before the first event it is unknown; current unit state is never projected backward. `STANDARD` is rentable; `RENOVATION` and `INACTIVE` are separate and excluded from the denominator. Unknown is excluded and warned. A rentable unit is occupied when shared `leaseStatusAt` is `ACTIVE`; vacancy is rentable minus occupied. Lease end is inclusive. Renovation is not vacancy.

## Rent roll

Monthly net rent run-rate sums effective rent for occupied rentable units. Source priority: as-of month RENT `ChargeItem`; effective RENT `LeasePaymentItem`; legacy `Lease.rentCents` only with warning. Services follow the hierarchy. No source yields unknown plus quality issue. Weighted rent/m² divides rent by area only for units with known area > 0; exclusions count in `missingAreaUnits`.

## Collections, overdue and deposits

Quarter expected is active charge amount in the quarter through as-of. Quarter paid uses `paidCentsAsOf`. Rate is paid/expected in basis points; expected zero yields null, never artificial 100%. Allocation effective dates are transaction `bookedAt`, offset `effectiveAt`, and credit-application `effectiveAt`; same-day is included, future excluded. Overdue requires active charge, due date strictly before as-of, and positive historical outstanding.

Deposit KPIs reuse `securityDepositSnapshot(lease, asOf)` for agreed/held/missing and status counts; reporting never duplicates ledger math. Lease classifications use shared lifecycle dates, not cached status.

## Quality, scope and publication

Quality JSON has stable code, `INFO/WARNING/BLOCKER`, message and optional entity IDs. Initial codes cover unknown operational history, missing area, legacy/missing rent, missing charge, deposit configuration and no rentable units. Calculators disclose fallbacks and never turn unknown history into silent facts.

Rent scope is requested context intersected with global/property/unit grants; unit-only calculations include only granted units. Shareholder calculations separately intersect group membership with effective group-property history. Neither grants the other.

Quarterly reports are group/year/quarter revisions. Every property row has mandatory snapshot ID, retaining its numerical origin. `PUBLISHED` is designed for immutable publication; future PDF/media must be explicitly published assets rather than mutable live output.
