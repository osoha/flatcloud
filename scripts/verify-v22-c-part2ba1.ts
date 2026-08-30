import assert from "node:assert/strict";
import fs from "node:fs";
import { UserRole } from "@prisma/client";
import { businessDateKeyToInstant, quarterEndKey } from "../lib/calendar";
import { prisma } from "../lib/db";
import { phone } from "../lib/format";
import { CzkMoneyParseError, parseCzkToCents } from "../lib/forms";
import { technicalSectionsSchema, valuationRowsSchema } from "../lib/reporting/editorial-schema";
import { createCorrectionRevision, submitQuarterlyReportForReview, updateQuarterlyPropertyReportContent, updateQuarterlyReportEditorial } from "../lib/reporting/quarterly-report-service";
import { quarterlyWorkflowErrorMessage } from "../lib/reporting/quarterly-workflow-route";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");

async function verifyDatabaseBehavior() {
  const marker = `verify-v22c-part2ba1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const users = await Promise.all([["edit", UserRole.OWNER_VIEWER], ["view", UserRole.OWNER_VIEWER]].map(([label, role]) => prisma.user.create({ data: { email: `${marker}-${label}@example.test`, name: `${marker}-${label}`, passwordHash: "verifier-not-a-login", role: role as UserRole, active: true } })));
  const [editor, viewer] = users;
  const actor = (user: { id: string; role: UserRole }) => ({ id: user.id, role: user.role });
  let ownerId: string | undefined, propertyId: string | undefined, groupId: string | undefined, snapshotId: string | undefined, reportId: string | undefined;
  try {
    const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } }); ownerId = owner.id;
    const property = await prisma.property.create({ data: { name: `${marker}-property`, address: "Verifier 1", city: "Praha", ownerId: owner.id } }); propertyId = property.id;
    const group = await prisma.reportingGroup.create({ data: { name: `${marker}-group`, members: { create: [{ userId: editor.id, permission: "EDIT" }, { userId: viewer.id, permission: "VIEW" }] } } }); groupId = group.id;
    const asOfDate = businessDateKeyToInstant(quarterEndKey(2026, 2));
    const snapshot = await prisma.quarterSnapshot.create({ data: { propertyId: property.id, asOfDate, year: 2026, quarter: 2, revision: 1, source: "MANUAL_BASELINE", schemaVersion: 1, calculatorVersion: "verifier", data: { source: "MANUAL_BASELINE", schemaVersion: 1, asOfDate: "2026-06-30" }, quality: { issues: [] }, createdById: editor.id } }); snapshotId = snapshot.id;
    const report = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, year: 2026, quarter: 2, revision: 1, status: "DRAFT", asOfDate, createdById: editor.id, propertyReports: { create: { propertyId: property.id, snapshotId: snapshot.id } } } }); reportId = report.id;

    await check("DB: EDIT updates DRAFT executive summary without RENT grants", async () => {
      await updateQuarterlyReportEditorial(report.id, { executiveSummary: "Souhrn vedení" }, actor(editor));
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).executiveSummary, "Souhrn vedení");
      assert.equal(await prisma.userProperty.count({ where: { userId: editor.id } }), 0); assert.equal(await prisma.userUnit.count({ where: { userId: editor.id } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_EDITORIAL_UPDATED", entityId: report.id } }), 1);
    });
    const technicalSections = [{ title: "Střecha", status: "WATCH" as const, commentary: "Kontrola v příštím kvartálu" }];
    const valuationRows = [{ label: "CAPEX", amountCents: -125000, valueLabel: null, note: "Podepsaná oprava" }];
    await check("DB: EDIT persists typed property content including signed valuation", async () => {
      await updateQuarterlyPropertyReportContent(report.id, property.id, { propertyStatus: "RENOVATION", managementCommentary: "Probíhá příprava", technicalSections, valuationRows }, actor(editor));
      const stored = await prisma.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: report.id, propertyId: property.id } } });
      assert.deepEqual(technicalSectionsSchema.parse(stored.technicalSections), technicalSections);
      assert.deepEqual(valuationRowsSchema.parse(stored.valuationRows), valuationRows);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_PROPERTY_CONTENT_UPDATED", entityId: report.id } }), 1);
    });
    await check("DB: malformed technical and valuation input is rejected without mutation or audit", async () => {
      const before = await prisma.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: report.id, propertyId: property.id } } });
      await assert.rejects(updateQuarterlyPropertyReportContent(report.id, property.id, { propertyStatus: "RENOVATION", managementCommentary: null, technicalSections: [{ title: "", commentary: "bad", extra: true }], valuationRows: [{ label: "Bez hodnoty" }] } as never, actor(editor)));
      const after = await prisma.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: report.id, propertyId: property.id } } });
      assert.deepEqual(after.technicalSections, before.technicalSections); assert.deepEqual(after.valuationRows, before.valuationRows);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_PROPERTY_CONTENT_UPDATED", entityId: report.id } }), 1);
    });
    await check("DB: VIEW cannot update editorial content and produces no audit", async () => {
      await assert.rejects(updateQuarterlyReportEditorial(report.id, { executiveSummary: "Zakázáno" }, actor(viewer)), /EDIT permission/);
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).executiveSummary, "Souhrn vedení");
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_EDITORIAL_UPDATED", userId: viewer.id } }), 0);
    });
    await prisma.quarterlyPropertyReport.update({ where: { quarterlyReportId_propertyId: { quarterlyReportId: report.id, propertyId: property.id } }, data: { propertyStatus: null } });
    await check("DB: DRAFT to REVIEW rejects missing property status without audit", async () => {
      await assert.rejects(submitQuarterlyReportForReview(report.id, actor(editor)), /property status before review/);
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).status, "DRAFT");
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_SUBMITTED_REVIEW", entityId: report.id } }), 0);
    });
    await updateQuarterlyPropertyReportContent(report.id, property.id, { propertyStatus: "RENOVATION", managementCommentary: null, technicalSections: [], valuationRows: [] }, actor(editor));
    await check("DB: complete statuses enter REVIEW without optional editorial fields", async () => {
      await submitQuarterlyReportForReview(report.id, actor(editor));
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).status, "REVIEW");
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_SUBMITTED_REVIEW", entityId: report.id } }), 1);
    });
    await check("DB: REVIEW rejects report and property editorial mutations", async () => {
      await assert.rejects(updateQuarterlyReportEditorial(report.id, { executiveSummary: "Review změna" }, actor(editor)), /only change in DRAFT/);
      await assert.rejects(updateQuarterlyPropertyReportContent(report.id, property.id, { propertyStatus: "EXIT", managementCommentary: null, technicalSections: [], valuationRows: [] }, actor(editor)), /only change in DRAFT/);
    });
    await prisma.quarterlyReport.update({ where: { id: report.id }, data: { status: "DRAFT" } });
    await updateQuarterlyPropertyReportContent(report.id, property.id, { propertyStatus: "RENOVATION", managementCommentary: "Obsah pro opravu", technicalSections, valuationRows }, actor(editor));
    await prisma.quarterlyReport.update({ where: { id: report.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: editor.id } });
    await check("DB: PUBLISHED rejects report and property editorial mutations", async () => {
      await assert.rejects(updateQuarterlyReportEditorial(report.id, { executiveSummary: "Publikovaná změna" }, actor(editor)), /only change in DRAFT/);
      await assert.rejects(updateQuarterlyPropertyReportContent(report.id, property.id, { propertyStatus: "EXIT", managementCommentary: null, technicalSections: [], valuationRows: [] }, actor(editor)), /only change in DRAFT/);
    });
    await check("DB: correction clones executive summary, property content, and snapshot without changing source", async () => {
      const sourceBefore = await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id }, include: { propertyReports: true } });
      const correction = await createCorrectionRevision(report.id, actor(editor));
      const cloned = await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: correction.id }, include: { propertyReports: true } });
      assert.equal(cloned.executiveSummary, sourceBefore.executiveSummary); assert.equal(cloned.propertyReports[0].snapshotId, sourceBefore.propertyReports[0].snapshotId);
      assert.equal(cloned.propertyReports[0].propertyStatus, sourceBefore.propertyReports[0].propertyStatus); assert.equal(cloned.propertyReports[0].managementCommentary, sourceBefore.propertyReports[0].managementCommentary);
      assert.deepEqual(cloned.propertyReports[0].technicalSections, sourceBefore.propertyReports[0].technicalSections); assert.deepEqual(cloned.propertyReports[0].valuationRows, sourceBefore.propertyReports[0].valuationRows);
      const sourceAfter = await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id }, include: { propertyReports: true } }); assert.deepEqual(sourceAfter, sourceBefore);
    });
    await check("DB: every successful editorial mutation writes exactly one concise audit", async () => {
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_EDITORIAL_UPDATED", entityId: report.id } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { action: "REPORT_PROPERTY_CONTENT_UPDATED", entityId: report.id } }), 3);
      const audits = await prisma.auditLog.findMany({ where: { action: { in: ["REPORT_EDITORIAL_UPDATED", "REPORT_PROPERTY_CONTENT_UPDATED"] }, entityId: report.id } });
      assert.equal(audits.length, 4); for (const audit of audits) { const serialized = JSON.stringify(audit.details); assert.doesNotMatch(serialized, /Souhrn vedení|Probíhá příprava|Obsah pro opravu/); }
    });
  } finally {
    const userIds = users.map((user) => user.id);
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    if (groupId) await prisma.quarterlyReport.deleteMany({ where: { reportingGroupId: groupId } });
    if (snapshotId) await prisma.quarterSnapshot.deleteMany({ where: { id: snapshotId } });
    if (groupId) { await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: groupId } }); await prisma.reportingGroup.deleteMany({ where: { id: groupId } }); }
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function main() {
  const schema = read("lib/reporting/editorial-schema.ts"), service = read("lib/reporting/quarterly-report-service.ts"), workspace = read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx"), client = read("components/QuarterlyPropertyEditorialEditor.tsx");
  const editorialRoute = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/editorial/route.ts"), contentRoute = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/content/route.ts");
  await check("schemas enforce strict bounded ordered editorial structures and signed amounts", () => { assert.match(schema, /technicalSectionsSchema = z\.array\(technicalSectionSchema\)\.max\(25\)/); assert.match(schema, /valuationRowsSchema = z\.array\(valuationRowSchema\)\.max\(40\)/); assert.doesNotThrow(() => valuationRowsSchema.parse([{ label: "Dluh", amountCents: -1 }])); assert.throws(() => valuationRowsSchema.parse([{ label: "Bez hodnoty" }])); assert.throws(() => technicalSectionsSchema.parse([{ title: "A", commentary: "", extra: true }])); });
  await check("authenticated group-scoped routes parse and validate controlled form data", () => { for (const route of [editorialRoute, contentRoute]) { assert.match(route, /requireUser\(\)/); assert.match(route, /requireReportInGroup\(reportId, groupId\)/); assert.match(route, /\.parse\(/); assert.doesNotMatch(route, /actorId|userRole|permission/); } assert.match(contentRoute, /JSON\.parse/); });
  await check("services use DRAFT-safe conditional mutations and exact audits", () => { assert.match(service, /updateQuarterlyReportEditorial/); assert.match(service, /updateQuarterlyPropertyReportContent/); assert.match(service, /status: "DRAFT"/); assert.match(service, /REPORT_EDITORIAL_UPDATED/); assert.match(service, /REPORT_PROPERTY_CONTENT_UPDATED/); assert.doesNotMatch(service, /REPORT_(EDITORIAL|PROPERTY_CONTENT)_UPDATED[\s\S]{0,300}(executiveSummary|managementCommentary):/); });
  await check("workspace has typed editors but no raw JSON editor", () => { assert.match(workspace, /QuarterlyPropertyEditorialEditor/); assert.match(client, /Přidat technickou oblast/); assert.match(client, /Přidat řádek ocenění/); assert.doesNotMatch(workspace + client, /textarea[^>]+name=["'](technicalSections|valuationRows)/); });
  await check("editorial checkpoint remains free of publish logic in editorial routes and client editor", () => assert.doesNotMatch(client + editorialRoute + contentRoute, /publishQuarterlyReport|createCorrectionRevision|acknowledgeQuarterlyReportWarnings/));
  await check("LIVE semantics and RENT data boundaries remain unchanged", () => { const live = read("app/reporty/page.tsx"); assert.match(live, /loadLiveReport/); assert.match(live, /PortfolioScopePicker/); assert.doesNotMatch(workspace + client + editorialRoute + contentRoute, /prisma\.(unit|lease|tenant|payment|document)|\/nemovitosti\/|\/smlouvy\//); });
  await check("checkpoint contains no benchmark media storage work", () => assert.doesNotMatch(schema + client, /benchmark|FileAsset|storage|media/i));
  await check("Part 2B-A1 follows Part 2A.2B in CI", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2a2b\n      - run: npm run verify:v22-c-part2ba1\n")));
  await check("CZK editor input parses deterministically to signed integer cents", () => {
    assert.equal(parseCzkToCents("3174780"), 317478000);
    assert.equal(parseCzkToCents("3 174 780"), 317478000);
    assert.equal(parseCzkToCents("3174780,50"), 317478050);
    assert.equal(parseCzkToCents("3 174 780,50"), 317478050);
    assert.equal(parseCzkToCents("3174780.50"), 317478050);
    assert.equal(parseCzkToCents("-25 000,50"), -2500050);
    assert.equal(parseCzkToCents("0"), 0);
    for (const malformed of ["abc", "1,2.3", "1,234", "", "--1"]) assert.throws(() => parseCzkToCents(malformed));
    assert.equal(quarterlyWorkflowErrorMessage(new CzkMoneyParseError()), "Zadaná částka není platná.");
    assert.match(client, /Částka \(Kč\)/); assert.match(client, /inputMode="decimal"/); assert.doesNotMatch(client, /haléřích|Number\(row\.amount/); assert.match(contentRoute, /parseCzkToCents/);
  });
  await check("Czech phone display formatter is safe and shared by human-readable surfaces", () => {
    assert.equal(phone("544216094"), "544 216 094"); assert.equal(phone("544 216 094"), "544 216 094");
    assert.equal(phone("+420544216094"), "+420 544 216 094"); assert.equal(phone("+420 544 216 094"), "+420 544 216 094");
    assert.equal(phone("+49 30 123456"), "+49 30 123456"); assert.equal(phone("  linka 123  "), "linka 123"); assert.equal(phone(null), ""); assert.equal(phone("   "), "");
    for (const path of ["app/najemnici/[tenantId]/page.tsx", "app/najemnici/page.tsx", "app/nemovitosti/[id]/[section]/page.tsx", "app/nemovitosti/[id]/jednotky/[unitId]/page.tsx"]) { const source = read(path); assert.match(source, /import \{[^}]*phone[^}]*\} from "@\/lib\/format"/); assert.match(source, /phone\(/); assert.doesNotMatch(source, /\.replace\([^\n]*phone|phone[^\n]*\.replace\(/); }
  });
  await verifyDatabaseBehavior();
  console.log(`V22-C Part 2B-A1 verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
