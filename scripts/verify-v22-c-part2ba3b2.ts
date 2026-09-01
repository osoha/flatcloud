import assert from "node:assert/strict";
import fs from "node:fs";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/db";
import { parseAreaM2, parseCzkToCents } from "../lib/forms";
import { valuationRowsSchema, valuationTotalCents } from "../lib/reporting/editorial-schema";
import { renderPublishedReportPdfPreview } from "../lib/reporting/report-asset-service";
import { createCorrectionRevision, updateQuarterlyPropertyReportContent } from "../lib/reporting/quarterly-report-service";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");
const structured = { kind: "UNIT" as const, unitLabel: "BJ 5", disposition: "2+kk", floor: "1.NP", areaM2: 50.42, amountCents: 725000050 };
const legacyNumeric = { label: "Historické ocenění", amountCents: 125000000, valueLabel: null, note: "Zmrazeno" };
const legacyText = { label: "Poznámka", valueLabel: "Bude doplněno", note: null };

async function runtimeChecks() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for A3b.2 runtime verification.");
  const marker = `verify-v22c-a3b2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `${marker}@example.test`, name: marker, passwordHash: "not-a-login", role: UserRole.OWNER_VIEWER, active: true } });
  const actor = { id: user.id, role: user.role };
  let ownerId: string | undefined, propertyId: string | undefined, groupId: string | undefined, snapshotId: string | undefined;
  try {
    const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } }); ownerId = owner.id;
    const property = await prisma.property.create({ data: { name: `${marker}-property`, address: "Test 1", city: "Praha", ownerId: owner.id } }); propertyId = property.id;
    const group = await prisma.reportingGroup.create({ data: { name: `${marker}-group`, members: { create: { userId: user.id, permission: "ADMIN" } } } }); groupId = group.id;
    const asOfDate = new Date("2026-06-29T22:00:00.000Z");
    const snapshot = await prisma.quarterSnapshot.create({ data: { propertyId: property.id, asOfDate, year: 2026, quarter: 2, revision: 1, source: "MANUAL_BASELINE", schemaVersion: 1, calculatorVersion: "a3b2", data: { source: "MANUAL_BASELINE", schemaVersion: 1, asOfDate: "2026-06-30" }, quality: { issues: [] }, createdById: user.id } }); snapshotId = snapshot.id;
    const published = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: group.name, year: 2026, quarter: 2, revision: 1, status: "PUBLISHED", asOfDate, createdById: user.id, publishedById: user.id, publishedAt: new Date(), propertyReports: { create: { propertyId: property.id, propertyNameSnapshot: property.name, propertyAddressSnapshot: property.address, snapshotId: snapshot.id, propertyStatus: "STABILIZED", technicalSections: [], valuationRows: [legacyNumeric, legacyText] } } } });
    const draft = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: group.name, year: 2026, quarter: 3, revision: 1, status: "DRAFT", asOfDate: new Date("2026-09-29T22:00:00.000Z"), createdById: user.id, propertyReports: { create: { propertyId: property.id, propertyNameSnapshot: property.name, propertyAddressSnapshot: property.address, snapshotId: snapshot.id } } } });

    await check("DB: existing PUBLISHED legacy report preview renders PDF", async () => { const preview = await renderPublishedReportPdfPreview(published.id, group.id, actor); assert.equal(Buffer.from(preview.bytes.subarray(0, 5)).toString(), "%PDF-"); });
    await check("DB: correction preserves frozen legacy JSON exactly", async () => { const before = await prisma.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: published.id, propertyId: property.id } } }); const correction = await createCorrectionRevision(published.id, actor); const cloned = await prisma.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: correction.id, propertyId: property.id } } }); assert.deepEqual(cloned.valuationRows, before.valuationRows); });
    await check("DB: structured DRAFT valuation persists and round-trips", async () => { await updateQuarterlyPropertyReportContent(draft.id, property.id, { propertyStatus: "STABILIZED", managementCommentary: null, technicalSections: [], valuationRows: [structured] }, actor); const stored = await prisma.quarterlyPropertyReport.findUniqueOrThrow({ where: { quarterlyReportId_propertyId: { quarterlyReportId: draft.id, propertyId: property.id } } }); assert.deepEqual(valuationRowsSchema.parse(stored.valuationRows), [structured]); });
    await check("DB: REVIEW and PUBLISHED mutation rules remain immutable", async () => { await prisma.quarterlyReport.update({ where: { id: draft.id }, data: { status: "REVIEW" } }); await assert.rejects(updateQuarterlyPropertyReportContent(draft.id, property.id, { propertyStatus: "EXIT", managementCommentary: null, technicalSections: [], valuationRows: [] }, actor), /only change in DRAFT/); await assert.rejects(updateQuarterlyPropertyReportContent(published.id, property.id, { propertyStatus: "EXIT", managementCommentary: null, technicalSections: [], valuationRows: [] }, actor), /only change in DRAFT/); });
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    if (groupId) await prisma.quarterlyReport.deleteMany({ where: { reportingGroupId: groupId } });
    if (snapshotId) await prisma.quarterSnapshot.deleteMany({ where: { id: snapshotId } });
    if (groupId) { await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: groupId } }); await prisma.reportingGroup.deleteMany({ where: { id: groupId } }); }
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

async function main() {
  await check("structured UNIT schema accepts BJ, disposition, floor, area and integer amount", () => assert.deepEqual(valuationRowsSchema.parse([structured]), [structured]));
  await check("area parser accepts Czech and dot decimals plus blank", () => { assert.equal(parseAreaM2("50,42"), 50.42); assert.equal(parseAreaM2("50.42"), 50.42); assert.equal(parseAreaM2("   "), null); });
  await check("area parser rejects malformed, zero and negative values", () => { for (const value of ["abc", "0", "-1", "1,2.3"]) assert.throws(() => parseAreaM2(value)); });
  await check("CZK parser supplies persisted integer cents", () => { const cents = parseCzkToCents("7 250 000,50"); assert.equal(cents, 725000050); assert.ok(Number.isInteger(cents)); });
  await check("automatic total sums structured and numeric legacy rows only", () => { assert.equal(valuationTotalCents([structured]), structured.amountCents); assert.equal(valuationTotalCents([structured, legacyNumeric, legacyText]), structured.amountCents + legacyNumeric.amountCents); });
  await check("old legacy valuation JSON still parses without inferred fields", () => { const parsed = valuationRowsSchema.parse([legacyNumeric, legacyText]); assert.deepEqual(parsed, [legacyNumeric, legacyText]); assert.ok(!("kind" in parsed[0])); });
  await check("route parses editor strings server-side and validates final schema", () => { const route = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/content/route.ts"); assert.match(route, /parseAreaM2\(row\.areaM2\)/); assert.match(route, /parseCzkToCents\(row\.amountCzk\)/); assert.match(route, /quarterlyPropertyReportContentSchema\.parse/); });
  await check("editor and PDF expose structured columns, derived total and legacy compatibility", () => { const editor = read("components/QuarterlyPropertyEditorialEditor.tsx"), pdf = read("lib/reporting/pdf/quarterly-report-pdf.tsx"); for (const label of ["BJ", "Dispozice", "Podlaží", "Plocha m²", "Ocenění"]) assert.ok(editor.includes(label)); assert.match(editor, /Starší formát ocenění/); assert.match(editor, /Celkové ocenění:/); assert.match(pdf, /valuationTotalCents/); assert.match(pdf, /Starší formát ocenění/); });
  await check("stored BJ label renders as-is and mixed PDF puts legacy content before one global total", () => { const page = read("components/quarterly-report-workspace/QuarterlyReportPropertyWorkspace.tsx"), pdf = read("lib/reporting/pdf/quarterly-report-pdf.tsx"); assert.match(page, /<td>\{row\.unitLabel\}<\/td>/); assert.doesNotMatch(page, /BJ \{row\.unitLabel\}/); const valuation = pdf.slice(pdf.indexOf("function ValuationTable"), pdf.indexOf("function PortfolioSummary")); assert.ok(valuation.indexOf("Starší formát ocenění") < valuation.indexOf('[["Celkem"')); assert.equal(valuation.match(/\[\["Celkem"/g)?.length, 1); });
  await check("valuation stays JSON with no A3b.2 Prisma migration", () => { assert.match(read("prisma/schema.prisma"), /valuationRows\s+Json\?/); assert.equal(fs.readdirSync("prisma/migrations").filter((name) => /a3b2|valuation.*unit/i.test(name)).length, 0); });
  await check("A3b.2 follows A3b.1 and precedes later checkpoints in CI", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2ba3b\n      - run: npm run verify:v22-c-part2ba3b0\n      - run: npm run verify:v22-c-part2ba3b1\n      - run: npm run verify:v22-c-part2ba3b2\n      - run: npm run verify:v22-c-part2ba3b3\n      - run: npm run verify:v22-c-payments1\n      - run: npm run verify:v22-c-payments2a\n      - run: npm run verify:v22-c-inactive-property-notifications\n      - run: npm run verify:report-design-1\n      - run: npm run verify:report-design-2\n      - run: npm run verify:report-design-2-1\n      - run: npm run verify:report-design-2-1-upload\n      - run: npm run verify:report-design-3a\n      - run: npm run verify:report-design-3b\n      - run: npm run build")));
  await runtimeChecks();
  console.log(`V22-C Part 2B-A3b.2 verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
