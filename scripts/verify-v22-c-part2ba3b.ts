import assert from "node:assert/strict";
import fs from "node:fs";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/db";
import { aggregateKnownReportValues } from "../lib/reporting/pdf/aggregation";
import { REPORT_PDF_FONT_PATH, REPORT_PDF_LOGO_PATH } from "../lib/reporting/pdf/assets";
import { REPORT_PDF_RENDERER_VERSION } from "../lib/reporting/pdf/constants";
import { loadFrozenQuarterlyReportPdfData } from "../lib/reporting/pdf/quarterly-report-pdf-data";
import { createCorrectionRevision } from "../lib/reporting/quarterly-report-service";
import { generatePublishedReportAsset, REPORT_PDF_MIME_TYPE } from "../lib/reporting/report-asset-service";
import type { FileStorage, PutObjectInput, SignedDownloadOptions } from "../lib/storage/types";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");

class MemoryStorage implements FileStorage {
  objects = new Map<string, Uint8Array>();
  async putObject(input: PutObjectInput) { this.objects.set(input.key, input.body.slice()); }
  async deleteObject(key: string) { this.objects.delete(key); }
  async getObject(key: string) { const value = this.objects.get(key); if (!value) throw new Error(`Verifier storage object is missing: ${key}`); return value.slice(); }
  async getSignedDownloadUrl(_key: string, _expires?: number, _options?: SignedDownloadOptions) { return "https://example.test/signed"; }
  async exists(key: string) { return this.objects.has(key); }
}

async function verifyDatabaseRuntime() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for A3b runtime verification.");
  const marker = `verify-v22c-part2ba3b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({ data: { email: `${marker}@example.test`, name: marker, passwordHash: "not-a-login", role: UserRole.OWNER_VIEWER, active: true } });
  let ownerId: string | undefined, propertyId: string | undefined, groupId: string | undefined, snapshotId: string | undefined;
  const storage = new MemoryStorage();
  const frozen = { group: "Zmrazené české portfolio", property: "Dům Příčná", address: "Příčná 12, 110 00 Praha" };
  const validData = { source: "MANUAL_BASELINE", schemaVersion: 1, asOfDate: "2026-06-30", units: { total: 10, rentable: 8, occupied: 7, vacant: 1 }, rentRoll: { monthlyNetRentCents: 25000000 }, collections: { quarterExpectedCents: 75000000, quarterPaidCents: 73500000, collectionRateBps: 9800, overdueDebtCents: 1500000 } } as const;
  const validQuality = { issues: [{ code: "MISSING_UNIT_AREA", severity: "WARNING", message: "Chybí plocha jednotky." }] } as const;
  try {
    const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } }); ownerId = owner.id;
    const property = await prisma.property.create({ data: { name: "Živý původní název", address: "Původní 1", city: "Praha", postalCode: "100 00", ownerId: owner.id } }); propertyId = property.id;
    const group = await prisma.reportingGroup.create({ data: { name: "Živá původní skupina", members: { create: { userId: admin.id, permission: "ADMIN" } } } }); groupId = group.id;
    const snapshot = await prisma.quarterSnapshot.create({ data: { propertyId: property.id, asOfDate: new Date("2026-06-29T22:00:00.000Z"), year: 2026, quarter: 2, revision: 1, source: "MANUAL_BASELINE", schemaVersion: 1, calculatorVersion: "a3b-runtime", data: validData, quality: validQuality, createdById: admin.id } }); snapshotId = snapshot.id;
    const report = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: frozen.group, year: 2026, quarter: 2, revision: 1, status: "PUBLISHED", asOfDate: snapshot.asOfDate, executiveSummary: "Příjmy, nájemné, technický stav, rekonstrukce, čtvrtletí", createdById: admin.id, publishedById: admin.id, publishedAt: new Date("2026-07-10T10:00:00.000Z"), propertyReports: { create: { propertyId: property.id, propertyNameSnapshot: frozen.property, propertyAddressSnapshot: frozen.address, snapshotId: snapshot.id, propertyStatus: "RENOVATION", managementCommentary: "Probíhá rekonstrukce společných prostor.", technicalSections: [{ title: "Střecha", status: "WATCH", commentary: "Průběžně sledovat." }], valuationRows: [{ label: "Odhadovaná hodnota", amountCents: 125000000, note: "Interní ocenění" }] } } } });

    await prisma.reportingGroup.update({ where: { id: group.id }, data: { name: "MUTATED LIVE GROUP" } });
    await prisma.property.update({ where: { id: property.id }, data: { name: "MUTATED LIVE PROPERTY", address: "Mutated 999", city: "Brno", postalCode: "602 00" } });

    await check("DB: frozen loader ignores later mutable group/property identity", async () => {
      const loaded = await loadFrozenQuarterlyReportPdfData(report.id, group.id);
      assert.equal(loaded.reportingGroupName, frozen.group); assert.equal(loaded.properties[0].propertyName, frozen.property); assert.equal(loaded.properties[0].propertyAddress, frozen.address); assert.doesNotMatch(JSON.stringify(loaded), /MUTATED LIVE|Mutated 999|Brno/);
    });
    await check("DB: invalid snapshot.data is rejected through the real loader", async () => {
      await prisma.quarterSnapshot.update({ where: { id: snapshot.id }, data: { data: { invalid: true } } }); await assert.rejects(loadFrozenQuarterlyReportPdfData(report.id, group.id)); await prisma.quarterSnapshot.update({ where: { id: snapshot.id }, data: { data: validData } });
    });
    await check("DB: invalid snapshot.quality is rejected through the real loader", async () => {
      await prisma.quarterSnapshot.update({ where: { id: snapshot.id }, data: { quality: { issues: [{ severity: "UNKNOWN" }] } } }); await assert.rejects(loadFrozenQuarterlyReportPdfData(report.id, group.id)); await prisma.quarterSnapshot.update({ where: { id: snapshot.id }, data: { quality: validQuality } });
    });
    await check("DB: canonical generation executes loader and renderer into a real PDF FileAsset", async () => {
      const generated = await generatePublishedReportAsset(report.id, group.id, { id: admin.id, role: admin.role }, storage);
      const attached = await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id }, include: { publishedAsset: true } });
      assert.equal(generated.mimeType, "application/pdf"); assert.equal(generated.mimeType, REPORT_PDF_MIME_TYPE); assert.match(generated.originalName, /\.pdf$/); assert.ok(attached.publishedAsset); assert.match(attached.publishedAsset.storageKey, /\.pdf$/);
      const bytes = await storage.getObject(attached.publishedAsset.storageKey); assert.ok(bytes.byteLength > 5_000); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "REPORT_PUBLISHED_ASSET_GENERATED", entityId: report.id } }); assert.equal((audit.details as { rendererVersion?: string }).rendererVersion, REPORT_PDF_RENDERER_VERSION);
    });
    await check("DB: correction service copies frozen identity and preserves source asset", async () => {
      const sourceBefore = await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id }, select: { publishedAssetId: true } }); assert.ok(sourceBefore.publishedAssetId);
      const correction = await createCorrectionRevision(report.id, { id: admin.id, role: admin.role }); const loaded = await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: correction.id }, include: { propertyReports: true } });
      assert.equal(loaded.reportingGroupNameSnapshot, frozen.group); assert.equal(loaded.propertyReports[0].propertyNameSnapshot, frozen.property); assert.equal(loaded.propertyReports[0].propertyAddressSnapshot, frozen.address); assert.equal(loaded.status, "DRAFT"); assert.equal(loaded.publishedAssetId, null); assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).publishedAssetId, sourceBefore.publishedAssetId);
    });
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    if (groupId) await prisma.quarterlyReport.deleteMany({ where: { reportingGroupId: groupId } });
    await prisma.fileAsset.deleteMany({ where: { uploadedById: admin.id } });
    if (snapshotId) await prisma.quarterSnapshot.deleteMany({ where: { id: snapshotId } });
    if (groupId) { await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: groupId } }); await prisma.reportingGroup.deleteMany({ where: { id: groupId } }); }
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } }); if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } }); await prisma.user.delete({ where: { id: admin.id } });
  }
}

async function main() {
  const schema = read("prisma/schema.prisma"), migration = read("prisma/migrations/20260830210000_v22_c_part2ba3b_frozen_presentation_identity/migration.sql");
  const renderer = read("lib/reporting/pdf/quarterly-report-pdf.tsx"), loader = read("lib/reporting/pdf/quarterly-report-pdf-data.ts"), assetService = read("lib/reporting/report-asset-service.ts"), reportService = read("lib/reporting/quarterly-report-service.ts");
  const workspace = read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx"), download = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/assets/download/route.ts"), pkg = JSON.parse(read("package.json"));
  await check("runtime PDF assets exist locally before rendering", () => { assert.ok(fs.existsSync(REPORT_PDF_FONT_PATH), `Configured Noto Sans font is missing: ${REPORT_PDF_FONT_PATH}`); assert.ok(fs.statSync(REPORT_PDF_FONT_PATH).size > 0, `Configured Noto Sans font is empty: ${REPORT_PDF_FONT_PATH}`); assert.ok(fs.existsSync(REPORT_PDF_LOGO_PATH), `Configured FlatCloud logo is missing: ${REPORT_PDF_LOGO_PATH}`); assert.ok(fs.statSync(REPORT_PDF_LOGO_PATH).size > 0, `Configured FlatCloud logo is empty: ${REPORT_PDF_LOGO_PATH}`); });
  await check("@react-pdf and offline OFL font are configured", () => { assert.ok(pkg.dependencies["@react-pdf/renderer"]); assert.ok(pkg.dependencies["@fontsource/noto-sans"]); assert.match(renderer, /renderToBuffer/); assert.match(renderer, /Font\.register/); assert.match(read("node_modules/@fontsource/noto-sans/LICENSE"), /SIL OPEN FONT LICENSE Version 1\.1/); });
  await check("typed loader validates frozen snapshot and editorial JSON", () => { assert.match(loader, /export type FrozenQuarterlyReportPdfData/); assert.match(loader, /quarterSnapshotDataSchema\.parse/); assert.match(loader, /quarterSnapshotQualitySchema\.parse/); assert.match(loader, /quarterlyPropertyReportContentSchema\.parse/); assert.doesNotMatch(renderer, /prisma\./); });
  await check("PDF path forbids LIVE RENT reads and mutable identity relations", () => { assert.doesNotMatch(loader + renderer + assetService, /prisma\.(unit|lease|tenant|payment|charge|document)|DocumentAccess|documentAccessWhere/); assert.doesNotMatch(loader, /reportingGroup:\s*\{|property:\s*\{|prisma\.(property|reportingGroup)/); assert.match(loader, /reportingGroupNameSnapshot/); assert.match(loader, /propertyNameSnapshot/); assert.match(loader, /propertyAddressSnapshot/); });
  await check("schema/migration and creation/correction paths freeze identity", () => { for (const field of ["reportingGroupNameSnapshot", "propertyNameSnapshot", "propertyAddressSnapshot"]) { assert.match(schema, new RegExp(`${field}\\s+String`)); assert.match(migration, new RegExp(`ALTER COLUMN "${field}" SET NOT NULL`)); } assert.match(reportService, /reportingGroupNameSnapshot: group\.name/); assert.match(reportService, /propertyNameSnapshot: property\.name/); assert.match(reportService, /reportingGroupNameSnapshot: source\.reportingGroupNameSnapshot/); });
  await check("A3a auth, download, secrecy and race guards remain intact", () => { assert.match(assetService, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(permission\)/); assert.match(assetService, /permission === "NONE"/); assert.match(assetService, /publishedAsset\.deletedAt/); assert.match(download, /getPublishedReportAssetForDownload/); assert.doesNotMatch(workspace, /storageKey/); assert.match(assetService, /publishedAssetId: null/); assert.match(assetService, /attached\.count !== 1/); });
  await check("additive aggregation sums known values and preserves unknowns", () => { assert.equal(aggregateKnownReportValues([10, 20, 30]), 60); assert.equal(aggregateKnownReportValues([10, null, 30]), null); assert.equal(aggregateKnownReportValues([10, undefined, 30]), null); assert.doesNotMatch(renderer, /aggregateKnownReportValues\([^\n]*(collectionRateBps|weightedNetRentPerM2Cents)/); });
  await check("PDF contract and renderer version replace temporary A3a semantics", () => { assert.equal(REPORT_PDF_MIME_TYPE, "application/pdf"); assert.equal(REPORT_PDF_RENDERER_VERSION, "v22-c-a3b-1"); assert.match(assetService, /rendererVersion: REPORT_PDF_RENDERER_VERSION/); assert.doesNotMatch(assetService + workspace, /text\/plain|a3a-report-artifact|temporary A3a|Dočasný interní artefakt|nikoli finální/); assert.match(workspace, /Vygenerovat PDF/); assert.match(workspace, /Stáhnout PDF/); });
  await check("A3b follows A3a in CI", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2ba3a\n      - run: npm run verify:v22-c-part2ba3b\n")));
  await verifyDatabaseRuntime();
  console.log(`V22-C Part 2B-A3b verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
