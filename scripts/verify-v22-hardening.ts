import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { businessDateKey } from "../lib/calendar";
import { assertDocumentContextConsistency } from "../lib/documents/service";
import { documentAccessWhere, documentEditAccessWhere } from "../lib/documents/access";
import { reportingGroupPropertiesAt, reportingScopeForUser } from "../lib/reporting/access";
import { validateReportingGroupPropertyIntervals } from "../lib/reporting/group-property-intervals";
import { canonicalSnapshotPeriod, nextSnapshotRevision, validateQuarterlyReportPeriod, validateSnapshotPeriod } from "../lib/reporting/invariants";
import { calculatePropertySnapshot } from "../lib/reporting/snapshot-calculator";
import { quarterSnapshotDataSchema } from "../lib/reporting/snapshot-schema";

type Check = (name: string, assertion: () => unknown) => void;
const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const baseLease = (overrides: Record<string, unknown> = {}) => ({ id: "lease", startDate: new Date("2026-01-01T12:00Z"), endDate: null, terminatedOn: null, cancelledAt: null, rentCents: 10000, servicesCents: 0, depositCents: 0, paymentItems: [], charges: [], securityDepositTerms: [], securityDepositMovements: [], ...overrides });
const baseUnit = (leases: any[], areaM2: number | null = 50) => ({ id: "unit", areaM2, operationalStatusEvents: [{ status: "STANDARD", effectiveAt: new Date("2020-01-01T12:00Z") }], leases });

export function runV22HardeningChecks(check: Check) {
  const pm = { id: "pm", role: "PROPERTY_MANAGER", memberships: [{ propertyId: "A" }], unitMemberships: [{ unitId: "A1", unit: { propertyId: "A" } }] };
  check("property manager is not global", () => assert.deepEqual(reportingScopeForUser(pm), { propertyIds: ["A"], unitIds: ["A1"] }));
  check("scoped PM cannot see requested foreign property", () => assert.deepEqual(reportingScopeForUser(pm, "B"), { propertyIds: [] }));
  check("allProperties PM is global", () => assert.deepEqual(reportingScopeForUser({ ...pm, allProperties: true }, "B"), { propertyIds: ["B"] }));
  check("requested property never expands owner scope", () => assert.deepEqual(reportingScopeForUser({ id: "o", role: "OWNER_VIEWER", memberships: [{ propertyId: "A" }] }, "B").propertyIds, []));
  check("group effectiveFrom is Prague-date inclusive", () => assert.equal(reportingGroupPropertiesAt({ properties: [{ propertyId: "p", effectiveFrom: new Date("2026-06-30T22:00Z") }] }, new Date("2026-06-30T22:30Z")).length, 1));
  check("group effectiveTo is Prague-date inclusive", () => assert.equal(reportingGroupPropertiesAt({ properties: [{ propertyId: "p", effectiveFrom: new Date("2026-01-01T12:00Z"), effectiveTo: new Date("2026-06-30T08:00Z") }] }, new Date("2026-06-30T21:59Z")).length, 1));

  const morning = canonicalSnapshotPeriod(new Date("2026-06-30T08:00Z")), evening = canonicalSnapshotPeriod(new Date("2026-06-30T18:00Z")), july = canonicalSnapshotPeriod(new Date("2026-06-30T23:30Z"));
  check("same Prague date has canonical snapshot instant", () => assert.equal(morning.asOfDate.getTime(), evening.asOfDate.getTime()));
  check("UTC June Prague July is Q3", () => assert.deepEqual({ year: july.year, quarter: july.quarter, date: businessDateKey(july.asOfDate) }, { year: 2026, quarter: 3, date: "2026-07-01" }));
  check("revision starts at one", () => assert.equal(nextSnapshotRevision(), 1));
  check("revision increments", () => assert.equal(nextSnapshotRevision(2), 3));
  check("quarter outside range rejected", () => assert.throws(() => validateSnapshotPeriod({ asOfDate: morning.asOfDate, year: 2026, quarter: 5, revision: 1 })));
  check("snapshot period mismatch rejected", () => assert.throws(() => validateSnapshotPeriod({ asOfDate: morning.asOfDate, year: 2026, quarter: 3, revision: 1 })));
  check("noncanonical snapshot instant rejected", () => assert.throws(() => validateSnapshotPeriod({ asOfDate: new Date("2026-06-30T12:00Z"), year: 2026, quarter: 2, revision: 1 })));
  check("quarterly report mismatch rejected", () => assert.throws(() => validateQuarterlyReportPeriod({ asOfDate: july.asOfDate, year: 2026, quarter: 2, revision: 1 })));

  const charge = { active: true, period: "2026-04", amountCents: 10000, dueDate: new Date("2026-04-15T12:00Z"), items: [], allocations: [], securityDepositOffsets: [], creditApplications: [] };
  const endedLease = baseLease({ endDate: new Date("2026-04-30T12:00Z"), charges: [charge, { ...charge, period: "2026-07", amountCents: 90000, dueDate: new Date("2026-07-15T12:00Z") }] });
  const collections = calculatePropertySnapshot({ propertyId: "p", asOf: new Date("2026-06-30T12:00Z"), units: [baseUnit([endedLease])] }).data;
  check("ended-in-quarter charge expected counted", () => assert.equal(collections.collections.quarterExpectedCents, 10000));
  check("ended lease overdue counted", () => assert.equal(collections.collections.overdueDebtCents, 10000));
  check("future-quarter charge excluded", () => assert.equal(collections.collections.quarterExpectedCents, 10000));

  const deposits = calculatePropertySnapshot({ propertyId: "p", asOf: new Date("2026-06-30T12:00Z"), units: [baseUnit([baseLease({ id: "active", depositCents: 10000, securityDepositMovements: [{ type: "RECEIVED", amountCents: 10000, effectiveAt: new Date("2026-01-01T12:00Z") }] }), baseLease({ id: "ended", endDate: new Date("2026-05-31T12:00Z"), depositCents: 5000, securityDepositMovements: [{ type: "RECEIVED", amountCents: 5000, effectiveAt: new Date("2026-01-01T12:00Z") }] })])] }).data;
  check("ended TO_SETTLE principal included", () => assert.equal(deposits.deposits.heldPrincipalCents, 15000));
  check("TO_SETTLE lease counted", () => assert.equal(deposits.deposits.toSettleLeases, 1));
  check("active agreed excludes ended", () => assert.equal(deposits.deposits.agreedCents, 10000));
  check("active missing coverage", () => assert.equal(deposits.deposits.missingCents, 0));
  const settled = calculatePropertySnapshot({ propertyId: "p", asOf: new Date("2026-06-30T12:00Z"), units: [baseUnit([baseLease({ endDate: new Date("2026-05-31T12:00Z"), depositCents: 5000, securityDepositMovements: [{ type: "RECEIVED", amountCents: 5000, effectiveAt: new Date("2026-01-01T12:00Z") }, { type: "RETURNED", amountCents: 5000, effectiveAt: new Date("2026-06-01T12:00Z") }] })])] }).data;
  check("settled ended principal is zero", () => assert.equal(settled.deposits.heldPrincipalCents, 0));

  const leaseKpi = calculatePropertySnapshot({ propertyId: "p", asOf: new Date("2026-06-30T12:00Z"), units: [baseUnit([baseLease({ id: "soon", endDate: new Date("2026-09-28T12:00Z") }), baseLease({ id: "late", startDate: new Date("2027-01-01T12:00Z"), endDate: new Date("2027-12-31T12:00Z") }), baseLease({ id: "ended", endDate: new Date("2026-02-01T12:00Z") }), baseLease({ id: "old", startDate: new Date("2024-01-01T12:00Z"), endDate: new Date("2025-12-31T12:00Z") })])] }).data;
  check("lease expiring within 90 days counted", () => assert.equal(leaseKpi.leases.expiring90Days, 1));
  check("lease beyond 90 days excluded", () => assert.equal(leaseKpi.leases.expiring90Days, 1));
  check("ended YTD counted", () => assert.equal(leaseKpi.leases.endedYtd, 1));
  check("prior-year end excluded", () => assert.equal(leaseKpi.leases.endedYtd, 1));
  const quality = calculatePropertySnapshot({ propertyId: "p", asOf: new Date("2026-06-30T12:00Z"), units: [baseUnit([baseLease({ paymentItems: [{ active: true, validFrom: new Date("2026-01-01T12:00Z"), validTo: null, category: "RENT", amountCents: 10000 }] })], null)] });
  check("missing current charge is warning", () => assert.ok(quality.quality.issues.some((issue) => issue.code === "MISSING_CHARGE_FOR_PERIOD" && issue.severity === "WARNING")));
  check("missing area makes weighted rent null", () => assert.equal(quality.data.rentRoll.weightedNetRentPerM2Cents, null));
  check("calculated schema permits undefined weighted KPI", () => assert.ok(quarterSnapshotDataSchema.safeParse(quality.data).success));

  const resolved = { unit: { propertyId: "p" }, lease: { unitId: "u", unit: { propertyId: "p" } } };
  check("matching unit and lease accepted", () => assert.doesNotThrow(() => assertDocumentContextConsistency({ propertyId: "p", unitId: "u", leaseId: "l" }, resolved)));
  check("unit A and lease B rejected", () => assert.throws(() => assertDocumentContextConsistency({ propertyId: "p", unitId: "u", leaseId: "l" }, { ...resolved, lease: { unitId: "other", unit: { propertyId: "p" } } })));
  const task = { id: "t", propertyId: "p", unitId: "u", leaseId: null, lease: null };
  check("matching taskEntry and task accepted", () => assert.doesNotThrow(() => assertDocumentContextConsistency({ propertyId: "p", taskId: "t", taskEntryId: "e" }, { task, entry: { taskId: "t", task } })));
  check("mismatching taskEntry and task rejected", () => assert.throws(() => assertDocumentContextConsistency({ propertyId: "p", taskId: "t", taskEntryId: "e" }, { task, entry: { taskId: "other", task: { ...task, id: "other" } } })));
  check("lease and task from different units rejected", () => assert.throws(() => assertDocumentContextConsistency({ propertyId: "p", leaseId: "l", taskId: "t" }, { lease: { unitId: "other", unit: { propertyId: "p" } }, task })));
  const editWhere = JSON.stringify(documentEditAccessWhere({ id: "u", role: "OWNER_VIEWER" }));
  check("unit EDIT reaches lease documents", () => assert.match(editWhere, /lease/));
  check("unit EDIT reaches task documents", () => assert.match(editWhere, /task/));
  check("unit edit excludes bare compliance context", () => assert.doesNotMatch(editWhere, /complianceRecord/));
  check("property VIEW cannot edit", () => assert.doesNotMatch(editWhere, /VIEW/));
  check("property VIEW can read", () => assert.match(JSON.stringify(documentAccessWhere({ id: "u", role: "OWNER_VIEWER" })), /memberships/));
  check("document create requires actor", () => assert.match(read("lib/documents/service.ts"), /actor: Actor/));
  check("document delete requires edit access", () => assert.match(read("lib/documents/service.ts"), /requireDocumentEditAccess\(actor, id\)/));
  check("reporting membership is not mutation grant", () => assert.doesNotMatch(read("lib/documents/service.ts"), /reportingGroup/));
  check("unit update rereads inside serializable transaction", () => assert.match(read("app/api/properties/[id]/units/[unitId]/route.ts"), /serializableTransaction[\s\S]*tx\.unit\.findFirst[\s\S]*tx\.unit\.update/));
  check("adjacent reporting intervals accepted", () => assert.doesNotThrow(() => validateReportingGroupPropertyIntervals([{ effectiveFrom: new Date("2026-01-01T12:00Z"), effectiveTo: new Date("2026-06-30T12:00Z") }, { effectiveFrom: new Date("2026-07-01T12:00Z") }])));
  check("overlapping reporting intervals rejected", () => assert.throws(() => validateReportingGroupPropertyIntervals([{ effectiveFrom: new Date("2026-01-01T12:00Z"), effectiveTo: new Date("2026-06-30T12:00Z") }, { effectiveFrom: new Date("2026-06-30T20:00Z") }])));
}
