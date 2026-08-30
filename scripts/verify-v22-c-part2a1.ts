import assert from "node:assert/strict";
import fs from "node:fs";
import { businessDateKey, businessDateKeyToInstant, quarterEndKey } from "../lib/calendar";
import { availableAppContexts, canAdminReportingGroup, canEditReportingGroup, canViewReportingGroup, reportingGroupPropertiesAt, reportingScopeForUser, type ReportingUser } from "../lib/reporting/access";
import { nextSnapshotRevision, validateQuarterlyReportPeriod } from "../lib/reporting/invariants";
import { assertEffectiveReportProperties, assertReportTransitionAllowed, assertSnapshotCompatibility, correctionPropertyData } from "../lib/reporting/quarterly-report-service";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
function rejects(test: () => unknown, pattern?: RegExp) { if (pattern) assert.throws(test, pattern); else assert.throws(test); }
const member = (permission: "VIEW" | "EDIT" | "ADMIN", role = "USER"): ReportingUser => ({ id: permission.toLowerCase(), role, reportingGroupMemberships: [{ reportingGroupId: "group", permission }] });
const superAdmin: ReportingUser = { id: "super", role: "SUPER_ADMIN" };
const asOfDate = businessDateKeyToInstant(quarterEndKey(2026, 1));
const source = fs.readFileSync("lib/reporting/quarterly-report-service.ts", "utf8");

async function main() {
  await check("SUPER_ADMIN can edit/admin and all workflow transitions", () => { assert.equal(canEditReportingGroup(superAdmin, "group"), true); assert.equal(canAdminReportingGroup(superAdmin, "group"), true); assert.doesNotThrow(() => assertReportTransitionAllowed("DRAFT", "REVIEW", "SUPER_ADMIN")); assert.doesNotThrow(() => assertReportTransitionAllowed("REVIEW", "DRAFT", "SUPER_ADMIN")); assert.doesNotThrow(() => assertReportTransitionAllowed("REVIEW", "PUBLISHED", "SUPER_ADMIN")); });
  await check("VIEW cannot create/edit/transition", () => { assert.equal(canEditReportingGroup(member("VIEW"), "group"), false); rejects(() => assertReportTransitionAllowed("DRAFT", "REVIEW", "VIEW")); });
  await check("EDIT can create DRAFT only as the mandatory authenticated actor", () => { assert.equal(canEditReportingGroup(member("EDIT"), "group"), true); assert.match(source, /createQuarterlyReport\(input: \{ reportingGroupId: string; year: number; quarter: number \}, actor: QuarterlyReportActor\)/); assert.doesNotMatch(source, /createdById: string \}, actor[^\n]*=/); assert.match(source, /createdById: actor\.id/); assert.match(source, /revision: 1, status: "DRAFT"/); });
  await check("EDIT can submit DRAFT to REVIEW", () => assert.doesNotThrow(() => assertReportTransitionAllowed("DRAFT", "REVIEW", "EDIT")));
  await check("EDIT cannot publish REVIEW", () => rejects(() => assertReportTransitionAllowed("REVIEW", "PUBLISHED", "EDIT")));
  await check("ADMIN can return REVIEW to DRAFT", () => assert.doesNotThrow(() => assertReportTransitionAllowed("REVIEW", "DRAFT", "ADMIN")));
  await check("ADMIN can publish REVIEW", () => assert.doesNotThrow(() => assertReportTransitionAllowed("REVIEW", "PUBLISHED", "ADMIN")));
  await check("MANAGER without group membership has no reporting access", () => { const manager: ReportingUser = { id: "manager", role: "MANAGER" }; assert.equal(canViewReportingGroup(manager, "group"), false); assert.equal(canEditReportingGroup(manager, "group"), false); });
  await check("RENT access alone gives no reporting access", () => { const rent: ReportingUser = { id: "rent", role: "USER", memberships: [{ propertyId: "property" }] }; assert.deepEqual(availableAppContexts(rent), ["RENT"]); assert.equal(canViewReportingGroup(rent, "group"), false); });
  await check("reporting membership gives no RENT access", () => { const reporting = member("VIEW"); assert.deepEqual(availableAppContexts(reporting), ["SHAREHOLDER_REPORTING"]); assert.deepEqual(reportingScopeForUser(reporting), { mode: "SCOPED", wholePropertyIds: [], unitIds: [] }); });
  await check("canAdminReportingGroup matrix is exact", () => { assert.equal(canAdminReportingGroup(member("ADMIN"), "group"), true); assert.equal(canAdminReportingGroup(member("EDIT"), "group"), false); assert.equal(canAdminReportingGroup(member("VIEW"), "group"), false); assert.equal(canAdminReportingGroup(superAdmin, "group"), true); });
  await check("Prague quarter end is canonical", () => { assert.equal(quarterEndKey(2026, 1), "2026-03-31"); assert.equal(businessDateKey(asOfDate), "2026-03-31"); assert.equal(asOfDate.toISOString(), "2026-03-30T22:00:00.000Z"); assert.doesNotThrow(() => validateQuarterlyReportPeriod({ asOfDate, year: 2026, quarter: 1, revision: 1 })); });
  await check("effective property membership is inclusive at asOfDate", () => { const selected = reportingGroupPropertiesAt({ properties: [{ propertyId: "included", effectiveFrom: new Date("2026-01-01T12:00Z"), effectiveTo: new Date("2026-03-31T12:00Z") }, { propertyId: "future", effectiveFrom: new Date("2026-04-01T12:00Z") }] }, asOfDate); assert.deepEqual(selected.map((row) => row.propertyId), ["included"]); });
  await check("report without effective properties is rejected", () => rejects(() => assertEffectiveReportProperties([]), /no effective properties/));
  await check("initial report is revision 1 DRAFT", () => assert.match(source, /revision: 1, status: "DRAFT"/));
  await check("every initial property receives its exact snapshotId", () => assert.match(source, /propertyId: snapshot\.propertyId[\s\S]{0,220}snapshotId: snapshot\.id/));
  await check("snapshot property and asOf compatibility is validated", () => { rejects(() => assertSnapshotCompatibility({ asOfDate, status: "DRAFT" }, "p", { propertyId: "other", asOfDate, source: "CALCULATED" }), /property/); rejects(() => assertSnapshotCompatibility({ asOfDate, status: "DRAFT" }, "p", { propertyId: "p", asOfDate: new Date(0), source: "CALCULATED" }), /as-of/); });
  await check("snapshot selection only works in DRAFT", () => { assert.doesNotThrow(() => assertSnapshotCompatibility({ asOfDate, status: "DRAFT" }, "p", { propertyId: "p", asOfDate, source: "MANUAL_BASELINE" })); rejects(() => assertSnapshotCompatibility({ asOfDate, status: "REVIEW" }, "p", { propertyId: "p", asOfDate, source: "CALCULATED" }), /DRAFT/); });
  await check("snapshot recalculation allocates revision N+1", () => assert.equal(nextSnapshotRevision(4), 5));
  await check("old snapshot remains immutable", () => { assert.doesNotMatch(source, /quarterSnapshot\.update/); assert.match(source, /calculateAndStoreSnapshotTx/); });
  await check("REVIEW content and snapshot changes are immutable", () => rejects(() => assertSnapshotCompatibility({ asOfDate, status: "REVIEW" }, "p", { propertyId: "p", asOfDate, source: "CALCULATED" }), /DRAFT/));
  await check("PUBLISHED report is immutable and never reopens", () => { rejects(() => assertReportTransitionAllowed("PUBLISHED", "DRAFT", "ADMIN"), /immutable/); rejects(() => assertSnapshotCompatibility({ asOfDate, status: "PUBLISHED" }, "p", { propertyId: "p", asOfDate, source: "CALCULATED" }), /DRAFT/); });
  await check("correction creates source revision N+1 in DRAFT", () => { assert.match(source, /source\.revision \+ 1/); assert.match(source, /revision, status: "DRAFT"/); });
  const original = { propertyId: "p", propertyNameSnapshot: "Frozen property", propertyAddressSnapshot: "Frozen address", snapshotId: "snapshot-3", propertyStatus: "STABILIZED" as const, managementCommentary: "unchanged", technicalSections: { roof: "ok" }, valuationRows: [{ value: 1 }] };
  const cloned = correctionPropertyData(original);
  await check("original PUBLISHED correction source is not mutated", () => { assert.deepEqual(original, { propertyId: "p", propertyNameSnapshot: "Frozen property", propertyAddressSnapshot: "Frozen address", snapshotId: "snapshot-3", propertyStatus: "STABILIZED", managementCommentary: "unchanged", technicalSections: { roof: "ok" }, valuationRows: [{ value: 1 }] }); assert.doesNotMatch(source, /quarterlyReport\.update\(\{[\s\S]*source\.id/); });
  await check("correction preserves snapshot references", () => assert.equal(cloned.snapshotId, original.snapshotId));
  await check("concurrent create/correction use serializable transactions plus unique DB guards", () => { assert.match(source, /withCollisionRetry\(\(\) => serializableTransaction/g); assert.match(source, /latest/); });
  await check("double publish uses an atomic stale-status claim", () => assert.match(source, /updateMany\(\{[\s\S]*?where:\s*\{[\s\S]*?id:\s*reportId,[\s\S]*?status:\s*"REVIEW"/));
  await check("all lifecycle audit actions are emitted", () => { for (const action of ["REPORT_CREATED", "REPORT_SNAPSHOT_RECALCULATED", "REPORT_SNAPSHOT_SELECTED", "REPORT_SUBMITTED_REVIEW", "REPORT_RETURNED_DRAFT", "REPORT_PUBLISHED", "REPORT_REVISION_CREATED"]) assert.ok(source.includes(action), action); assert.doesNotMatch(source, /details:[^\n]*snapshot\.data/); });
  console.log(`V22-C Part 2A.1 verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
