import assert from "node:assert/strict";
import fs from "node:fs";
import { canAdminReportingBackoffice, canReadReportingBackoffice, effectiveBackofficePermission } from "../lib/reporting/backoffice-access";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");
const detailPath = "app/reporty/kvartalni/[groupId]/page.tsx";
const workspacePath = "app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx";
const createPath = "app/api/reporting-groups/[groupId]/quarterly-reports/route.ts";
const snapshotPath = "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/snapshot/route.ts";
const recalcPath = "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/recalculate/route.ts";
const transitionPath = "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/transition/route.ts";
const detail = read(detailPath), workspacePage = read(workspacePath), workspace = workspacePage + read("components/quarterly-report-workspace/QuarterlyReportDataPanel.tsx") + read("components/quarterly-report-workspace/QuarterlyReportReviewExport.tsx"), service = read("lib/reporting/quarterly-report-service.ts");
const mutationRoutes = [createPath, snapshotPath, recalcPath, transitionPath].map(read);
const existingReportRoutes = mutationRoutes.slice(1).join("\n");

async function main() {
  await check("VIEW remains outside reporting backoffice", () => assert.equal(canReadReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "VIEW")), false));
  await check("EDIT ADMIN and SUPER_ADMIN receive report preparation access", () => { for (const permission of ["EDIT", "ADMIN"]) assert.equal(canReadReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", permission)), true); assert.equal(canReadReportingBackoffice(effectiveBackofficePermission("SUPER_ADMIN", null)), true); assert.match(detail, /Nový kvartální report/); });
  await check("inactive group hides the create form and explains why", () => { assert.match(detail, /group\.active \? <form[\s\S]*quarterly-reports/); assert.match(detail, /Skupina je neaktivní\. Nový kvartální report nelze založit\./); });
  await check("server create rejects inactive group from current transaction state", () => { assert.match(service, /tx\.reportingGroup\.findUnique\([\s\S]*select: \{ active: true[^}]*\}/); assert.match(service, /if \(!group\?\.active\) throw new Error\("Reporting group is inactive\."\)/); });
  await check("report rows link to canonical group-scoped workspace", () => assert.match(detail, /href=\{`\/reporty\/kvartalni\/\$\{group\.id\}\/reporty\/\$\{report\.id\}`\}/));
  await check("workspace query scopes the report by reportId and groupId", () => { assert.match(workspacePage, /where: \{ id: reportId, reportingGroupId: groupId \}/); assert.match(workspacePage, /if \(!report\) notFound\(\)/); });
  await check("existing-report routes deny group/report mismatch before mutation", () => { assert.equal((existingReportRoutes.match(/requireReportInGroup\(reportId, groupId\)/g) || []).length, 3); assert.match(read("lib/reporting/quarterly-workflow-route.ts"), /where: \{ id: reportId, reportingGroupId: groupId \}/); });
  await check("all new routes derive actor from authenticated session", () => { for (const route of mutationRoutes) { assert.match(route, /requireUser\(\)/); assert.doesNotMatch(route, /actorId|createdById|userRole|permission[^A-Za-z]/); } });
  await check("routes call only the intended workflow services", () => { assert.match(mutationRoutes[0], /createQuarterlyReport\(/); assert.match(mutationRoutes[1], /selectSnapshot\(/); assert.match(mutationRoutes[2], /recalculatePropertySnapshot\(/); assert.match(mutationRoutes[3], /submitQuarterlyReportForReview\(/); assert.match(mutationRoutes[3], /returnQuarterlyReportToDraft\(/); });
  await check("routes never mutate status directly", () => assert.doesNotMatch(mutationRoutes.join("\n"), /quarterlyReport\.(update|updateMany)|data:\s*\{\s*status/));
  await check("baseline review transition controls remain available", () => { assert.match(mutationRoutes[3], /action === "submit-review"/); assert.match(mutationRoutes[3], /action === "return-draft"/); });
  await check("DRAFT shows snapshot recalculation selection and submit controls", () => { assert.match(workspace, /report\.status === "DRAFT"/); assert.match(workspace, /Použít snapshot/); assert.match(workspace, /Přepočítat snapshot/); assert.match(workspace, /Odeslat ke kontrole/); });
  await check("REVIEW return is restricted to ADMIN and SUPER_ADMIN", () => { assert.equal(canAdminReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "EDIT")), false); assert.equal(canAdminReportingBackoffice(effectiveBackofficePermission("OWNER_VIEWER", "ADMIN")), true); assert.match(workspace, /status === "REVIEW" && admin/); });
  await check("PUBLISHED remains outside DRAFT editing controls", () => { assert.ok((workspace.match(/report\.status === "DRAFT"/g) || []).length >= 2); assert.match(workspace, /editable=\{report\.status === "DRAFT"\}/); assert.match(workspace, /status === "PUBLISHED"/); assert.doesNotMatch(workspace, /status === "PUBLISHED"[\s\S]{0,500}(Použít snapshot|Přepočítat snapshot|Uložit shrnutí)/); });
  await check("candidate snapshots use one DRAFT-only batched exact-asOf query", () => { assert.match(workspace, /report\.status === "DRAFT" && propertyIds\.length \? await prisma\.quarterSnapshot\.findMany/); assert.match(workspace, /propertyId: \{ in: propertyIds \}, asOfDate: report\.asOfDate/); assert.match(workspace, /source: \{ in: \["CALCULATED", "MANUAL_BASELINE"\] \}/); assert.doesNotMatch(workspace, /for[\s\S]{0,100}quarterSnapshot\.find/); });
  await check("quality and existing snapshot data are schema-validated and raw JSON is never rendered", () => { assert.match(workspace, /quarterSnapshotQualitySchema\.safeParse/); assert.match(workspace, /INFO \{counts\.INFO\} · WARNING \{counts\.WARNING\} · BLOCKER \{counts\.BLOCKER\}/); assert.match(workspacePage, /quarterSnapshotDataSchema\.safeParse\(row\.snapshot\.data\)/); assert.doesNotMatch(workspace, /JSON\.stringify/); });
  await check("workspace introduces no RENT-domain reads or links and uses frozen property identity", () => { assert.doesNotMatch(workspace, /prisma\.(unit|lease|tenant|payment|document)|\/nemovitosti\/|\/smlouvy\//); assert.match(workspacePage, /propertyNameSnapshot/); assert.match(workspacePage, /propertyAddressSnapshot/); });
  await check("LIVE reporting page remains unchanged in semantics", () => { const live = read("app/reporty/page.tsx"); assert.match(live, /loadLiveReport/); assert.match(live, /PortfolioScopePicker/); assert.doesNotMatch(live, /QuarterlyReport|ReportingGroup/); });
  await check("Part 2A.2B follows Part 2A.2A in CI", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2a2a\n      - run: npm run verify:v22-c-part2a2b\n")));
  await check("checkpoint adds no Prisma schema or migration", () => { assert.equal(fs.existsSync("prisma/migrations/20260830_v22_c_part2a2b"), false); assert.doesNotMatch(workspace + mutationRoutes.join("\n"), /prisma\.(unit|lease|tenant|payment|document)/); });
  console.log(`V22-C Part 2A.2B verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
