import assert from "node:assert/strict";
import fs from "node:fs";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/db";
import { generatePublishedReportAsset, renderPublishedReportPdfPreview, ReportAssetError } from "../lib/reporting/report-asset-service";
import { fileStorageCapabilities } from "../lib/storage";
import type { FileStorage } from "../lib/storage/types";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");

async function runtimeChecks() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for A3b.0 runtime verification.");
  const marker = `verify-v22c-part2ba3b0-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [admin, viewer] = await Promise.all(["admin", "viewer"].map((label) => prisma.user.create({ data: { email: `${marker}-${label}@example.test`, name: label, passwordHash: "not-a-login", role: UserRole.OWNER_VIEWER, active: true } })));
  let ownerId: string | undefined, propertyId: string | undefined, groupId: string | undefined, snapshotId: string | undefined;
  const previousDriver = process.env.FILE_STORAGE_DRIVER;
  try {
    const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } }); ownerId = owner.id;
    const property = await prisma.property.create({ data: { name: `${marker}-property`, address: "Příčná 12", city: "Praha", postalCode: "110 00", ownerId: owner.id } }); propertyId = property.id;
    const group = await prisma.reportingGroup.create({ data: { name: `${marker}-group`, members: { create: [{ userId: admin.id, permission: "ADMIN" }, { userId: viewer.id, permission: "VIEW" }] } } }); groupId = group.id;
    const snapshot = await prisma.quarterSnapshot.create({ data: { propertyId: property.id, asOfDate: new Date("2026-06-29T22:00:00.000Z"), year: 2026, quarter: 2, revision: 1, source: "MANUAL_BASELINE", schemaVersion: 1, calculatorVersion: "a3b0-runtime", data: { source: "MANUAL_BASELINE", schemaVersion: 1, asOfDate: "2026-06-30", units: { total: 4 } }, quality: { issues: [] }, createdById: admin.id } }); snapshotId = snapshot.id;
    const report = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: "Zmrazené portfolio", year: 2026, quarter: 2, revision: 1, status: "PUBLISHED", asOfDate: snapshot.asOfDate, executiveSummary: "Příjmy, nájemné, technický stav, rekonstrukce, čtvrtletí", createdById: admin.id, publishedById: admin.id, publishedAt: new Date(), propertyReports: { create: { propertyId: property.id, propertyNameSnapshot: "Dům Příčná", propertyAddressSnapshot: "Příčná 12, 110 00 Praha", snapshotId: snapshot.id, propertyStatus: "STABILIZED", technicalSections: [], valuationRows: [] } } } });
    const draft = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: "Zmrazené portfolio", year: 2026, quarter: 3, revision: 1, status: "DRAFT", asOfDate: new Date("2026-09-29T22:00:00.000Z"), createdById: admin.id } });

    process.env.FILE_STORAGE_DRIVER = "disabled";
    await check("DB: partial MANUAL_BASELINE preview renders with disabled persistent storage", async () => {
      const preview = await renderPublishedReportPdfPreview(report.id, group.id, { id: viewer.id, role: viewer.role });
      assert.equal(preview.mimeType, "application/pdf"); assert.match(preview.originalName, /\.pdf$/); assert.ok(preview.bytes.byteLength > 5_000); assert.equal(Buffer.from(preview.bytes.subarray(0, 5)).toString(), "%PDF-");
      assert.equal(await prisma.fileAsset.count({ where: { publishedReports: { some: { id: report.id } } } }), 0);
    });
    await check("DB: preview rejects non-PUBLISHED reports", async () => { await assert.rejects(renderPublishedReportPdfPreview(draft.id, group.id, { id: viewer.id, role: viewer.role }), (error: unknown) => error instanceof ReportAssetError && error.status === 404); });
    await check("DB: disabled permanent storage is a controlled 503 without attachment", async () => {
      await assert.rejects(generatePublishedReportAsset(report.id, group.id, { id: admin.id, role: admin.role }), (error: unknown) => error instanceof ReportAssetError && error.status === 503 && /úložiště/.test(error.message));
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).publishedAssetId, null); assert.equal(await prisma.fileAsset.count({ where: { uploadedById: admin.id } }), 0);
    });
    await check("DB: missing S3 configuration is a sanitized controlled 503", async () => {
      process.env.FILE_STORAGE_DRIVER = "s3";
      const saved = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].map((name) => [name, process.env[name]] as const); for (const [name] of saved) delete process.env[name];
      try { await assert.rejects(generatePublishedReportAsset(report.id, group.id, { id: admin.id, role: admin.role }), (error: unknown) => error instanceof ReportAssetError && error.status === 503 && error.message === "Konfigurace trvalého S3 úložiště není úplná." && !/S3_BUCKET/.test(error.message)); } finally { for (const [name, value] of saved) if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    });
    await check("DB: unexpected storage details are logged but hidden from the client error", async () => {
      const failure = "AWS credential secret must never reach the client"; const logged: unknown[][] = []; const originalConsoleError = console.error; console.error = (...args: unknown[]) => { logged.push(args); };
      const failingStorage: FileStorage = { putObject: async () => { throw new Error(failure); }, deleteObject: async () => undefined, getObject: async () => new Uint8Array(), getSignedDownloadUrl: async () => "", exists: async () => false };
      try { await assert.rejects(generatePublishedReportAsset(report.id, group.id, { id: admin.id, role: admin.role }, failingStorage), (error: unknown) => error instanceof ReportAssetError && error.status === 503 && error.message === "Trvalé úložiště souborů je dočasně nedostupné." && !error.message.includes(failure)); } finally { console.error = originalConsoleError; }
      assert.ok(logged.some((entry) => entry.some((value) => value instanceof Error && value.message === failure)));
    });
  } finally {
    if (previousDriver === undefined) delete process.env.FILE_STORAGE_DRIVER; else process.env.FILE_STORAGE_DRIVER = previousDriver;
    const userIds = [admin.id, viewer.id]; await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } }); if (groupId) await prisma.quarterlyReport.deleteMany({ where: { reportingGroupId: groupId } }); if (snapshotId) await prisma.quarterSnapshot.deleteMany({ where: { id: snapshotId } }); if (groupId) { await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: groupId } }); await prisma.reportingGroup.deleteMany({ where: { id: groupId } }); } if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } }); if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function main() {
  const service = read("lib/reporting/report-asset-service.ts"), previewRoute = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/assets/preview/route.ts"), workspace = read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx");
  await check("preview route streams an authorized private PDF without storage", () => { assert.match(previewRoute, /currentUser/); assert.match(previewRoute, /renderPublishedReportPdfPreview/); assert.match(previewRoute, /private, no-store/); assert.match(previewRoute, /attachment/); assert.doesNotMatch(previewRoute, /createFileStorage|fileAsset/); assert.match(service, /permission === "NONE"/); assert.match(service, /status: "PUBLISHED"/); });
  await check("workspace offers preview and only shows generation for runtime-usable storage", () => { assert.match(workspace, /Stáhnout náhled PDF/); assert.match(workspace, /fileStorageCapabilities\(\)\.persistentWrites/); assert.equal(fileStorageCapabilities("disabled", false).persistentWrites, false); assert.equal(fileStorageCapabilities("local", false).persistentWrites, true); assert.equal(fileStorageCapabilities("local", true).persistentWrites, false); assert.equal(fileStorageCapabilities("s3", true).persistentWrites, true); assert.match(workspace, /admin && persistentStorageAvailable/); });
  await check("storage failures become sanitized controlled 503 errors", () => { assert.match(service, /StorageDisabledError/); assert.match(service, /Konfigurace trvalého S3 úložiště není úplná/); assert.match(service, /Persistent report storage failed/); assert.match(service, /dočasně nedostupné/); assert.doesNotMatch(service, /`Trvalé úložiště[^`]*\$\{detail\}/); });
  await check("A3b.0 follows A3b in CI and precedes later A3b checkpoints", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2ba3b\n      - run: npm run verify:v22-c-part2ba3b0\n      - run: npm run verify:v22-c-part2ba3b1\n      - run: npm run verify:v22-c-part2ba3b2\n      - run: npm run verify:v22-c-part2ba3b3\n      - run: npm run build")));
  await runtimeChecks();
  console.log(`V22-C Part 2B-A3b.0 verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
