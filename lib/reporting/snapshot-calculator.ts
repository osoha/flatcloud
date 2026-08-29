import { businessDateKey, businessMonthKey, businessQuarter, quarterStartKey } from "../calendar";
import { effectiveLeaseEnd, leaseStatusAt } from "../lease-lifecycle-core";
import { securityDepositSnapshot } from "../security-deposit";
import { operationalStatusAt } from "../unit-operational-history";
import { overdueDebtCentsAsOf, paidCentsAsOf } from "./finance";
import type { ReportingQualityIssue } from "./data-quality";
import type { CalculatedSnapshotData } from "./snapshot-schema";

type UnitInput = { id: string; areaM2: number | null; operationalStatusEvents: Array<{ status: string; effectiveAt: Date; createdAt?: Date }>; leases: any[] };
function addCalendarDays(key: string, days: number) { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

export function calculatePropertySnapshot(input: { propertyId: string; asOf: Date; units: UnitInput[] }): { data: CalculatedSnapshotData; quality: { issues: ReportingQualityIssue[] } } {
  const issues: ReportingQualityIssue[] = [];
  let rentable = 0, occupied = 0, renovation = 0, inactive = 0, unknown = 0, missingArea = 0, net = 0, services = 0, rentableArea = 0, occupiedArea = 0, weightedRent = 0, weightedArea = 0;
  const allLeases = input.units.flatMap((unit) => unit.leases);
  const activeLeases: any[] = [];
  const asOfKey = businessDateKey(input.asOf);

  for (const unit of input.units) {
    const operational = operationalStatusAt(unit.operationalStatusEvents, input.asOf);
    if (operational.kind === "UNKNOWN_BEFORE_HISTORY") { unknown += 1; issues.push({ code: "UNKNOWN_OPERATIONAL_HISTORY", severity: "WARNING", message: "Operational status is unknown at as-of date.", propertyId: input.propertyId, unitId: unit.id }); continue; }
    if (operational.status === "RENOVATION") { renovation += 1; continue; }
    if (operational.status === "INACTIVE") { inactive += 1; continue; }
    rentable += 1;
    const lease = unit.leases.find((candidate) => leaseStatusAt(candidate, input.asOf) === "ACTIVE");
    if (lease) { occupied += 1; activeLeases.push(lease); }
    if (!unit.areaM2 || unit.areaM2 <= 0) { missingArea += 1; issues.push({ code: "MISSING_UNIT_AREA", severity: "WARNING", message: "Unit has no usable area.", propertyId: input.propertyId, unitId: unit.id }); }
    else { rentableArea += unit.areaM2; if (lease) occupiedArea += unit.areaM2; }
    if (!lease) continue;

    const charge = lease.charges?.find((candidate: any) => candidate.active && candidate.period === businessMonthKey(input.asOf));
    let items = charge?.items?.length ? charge.items : lease.paymentItems?.filter((item: any) => item.active && businessDateKey(item.validFrom) <= asOfKey && (!item.validTo || businessDateKey(item.validTo) >= asOfKey));
    if (!charge) issues.push({ code: "MISSING_CHARGE_FOR_PERIOD", severity: "WARNING", message: "Active occupied lease has no charge for the as-of month; rent was reconstructed.", propertyId: input.propertyId, unitId: unit.id, leaseId: lease.id });
    let rent = items?.filter((item: any) => item.category === "RENT").reduce((sum: number, item: any) => sum + item.amountCents, 0) || 0;
    let service = items?.filter((item: any) => item.category === "SERVICES").reduce((sum: number, item: any) => sum + item.amountCents, 0) || 0;
    if (!items?.length) { items = []; rent = lease.rentCents; service = lease.servicesCents; issues.push({ code: "RENT_SOURCE_LEGACY_FALLBACK", severity: "WARNING", message: "Legacy current lease rent used as fallback.", propertyId: input.propertyId, unitId: unit.id, leaseId: lease.id }); }
    if (!rent) issues.push({ code: "MISSING_RENT_SOURCE", severity: "WARNING", message: "No rent source at as-of date.", propertyId: input.propertyId, unitId: unit.id, leaseId: lease.id });
    net += rent; services += service;
    if (unit.areaM2 && unit.areaM2 > 0) { weightedRent += rent; weightedArea += unit.areaM2; }
  }

  if (!rentable) issues.push({ code: "NO_RENTABLE_UNITS", severity: "INFO", message: "Property has no known rentable units.", propertyId: input.propertyId });
  const quarter = businessQuarter(input.asOf), quarterStart = quarterStartKey(quarter.year, quarter.quarter);
  // Charge.active is the source of truth for a real obligation. Ended leases remain relevant for both quarter collections and outstanding debt.
  const quarterCharges = allLeases.flatMap((lease) => lease.charges || []).filter((charge: any) => charge.active && `${charge.period}-01` >= quarterStart && `${charge.period}-01` <= asOfKey);
  const expected = quarterCharges.reduce((sum: number, charge: any) => sum + charge.amountCents, 0);
  const paid = quarterCharges.reduce((sum: number, charge: any) => sum + paidCentsAsOf(charge, input.asOf), 0);
  const overdue = allLeases.flatMap((lease) => lease.charges || []).reduce((sum: number, charge: any) => sum + overdueDebtCentsAsOf(charge, input.asOf), 0);

  let agreed = 0, held = 0, missing = 0, funded = 0, partial = 0, unpaid = 0, toSettle = 0;
  for (const lease of allLeases) {
    const status = leaseStatusAt(lease, input.asOf);
    if (status !== "ACTIVE" && status !== "ENDED") continue;
    const deposit = securityDepositSnapshot(lease, input.asOf);
    if (status === "ACTIVE") {
      agreed += deposit.agreedAmountCents; held += deposit.heldPrincipalCents; missing += deposit.missingDepositCents;
      if (deposit.status === "FUNDED") funded += 1;
      if (deposit.status === "PARTIAL") partial += 1;
      if (deposit.status === "UNPAID") unpaid += 1;
      if (deposit.status === "NOT_CONFIGURED") issues.push({ code: "DEPOSIT_CONFIGURATION_WARNING", severity: "INFO", message: "Deposit is not configured.", propertyId: input.propertyId, leaseId: lease.id });
    } else if (deposit.status === "TO_SETTLE") { held += deposit.heldPrincipalCents; toSettle += 1; }
  }

  const ninetyDayKey = addCalendarDays(asOfKey, 90);
  const expiring90Days = activeLeases.filter((lease) => { const end = effectiveLeaseEnd(lease); if (!end) return false; const key = businessDateKey(end); return key > asOfKey && key <= ninetyDayKey; }).length;
  const yearStart = `${quarter.year}-01-01`;
  const endedYtd = allLeases.filter((lease) => { if (leaseStatusAt(lease, input.asOf) !== "ENDED" || lease.cancelledAt) return false; const end = effectiveLeaseEnd(lease); if (!end) return false; const key = businessDateKey(end); return key >= yearStart && key <= asOfKey; }).length;

  const data = { source: "CALCULATED" as const, schemaVersion: 1 as const, asOfDate: asOfKey, units: { total: input.units.length, rentable, occupied, vacant: rentable - occupied, renovation, inactive, unknownOperationalStatus: unknown }, rentRoll: { monthlyNetRentCents: net, monthlyServicesCents: services, monthlyTotalCents: net + services, rentableAreaM2: rentableArea, occupiedAreaM2: occupiedArea, weightedNetRentPerM2Cents: weightedArea ? Math.round(weightedRent / weightedArea) : null, missingAreaUnits: missingArea }, collections: { quarterExpectedCents: expected, quarterPaidCents: paid, collectionRateBps: expected ? Math.round(paid * 10000 / expected) : null, overdueDebtCents: overdue }, deposits: { agreedCents: agreed, heldPrincipalCents: held, missingCents: missing, fundedLeases: funded, partialLeases: partial, unpaidLeases: unpaid, toSettleLeases: toSettle }, leases: { active: activeLeases.length, future: allLeases.filter((lease) => leaseStatusAt(lease, input.asOf) === "FUTURE").length, expiring90Days, endedYtd } } satisfies CalculatedSnapshotData;
  return { data, quality: { issues } };
}
