import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { createCorrectionRevision, submitQuarterlyReportForReview } from "../lib/reporting/quarterly-report-service";
import { listQuarterlyPropertyPhotoCandidates, removeQuarterlyPropertyPrimaryPhoto, resolveQuarterlyPropertyReportMediaImage, selectQuarterlyPropertyPrimaryPhoto, updateQuarterlyPropertyPrimaryPhotoCaption } from "../lib/reporting/quarterly-report-media-service";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file: string) => createHash("sha256").update(read(file)).digest("hex");
let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260831120000_report_design_2_property_media/migration.sql");
const service = read("lib/reporting/quarterly-report-media-service.ts");
const reportService = read("lib/reporting/quarterly-report-service.ts");
const workspace = read("components/quarterly-report-workspace/QuarterlyReportPrimaryPhoto.tsx") + read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx");
const imageRoutes = read("lib/reporting/quarterly-report-media-image.ts") + read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/media/[mediaId]/image/route.ts") + read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/media/candidates/[documentId]/image/route.ts");

async function runtimeChecks() {
  const marker = `report-design-2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const users = await Promise.all(["editor", "outsider", "super"].map((label) => prisma.user.create({ data: { name: `${marker}-${label}`, email: `${marker}-${label}@example.test`, passwordHash: "test", role: label === "super" ? "SUPER_ADMIN" : "OWNER_VIEWER" } })));
  const [editor, outsider, superAdmin] = users;
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } });
  const [property, foreignProperty] = await Promise.all([
    prisma.property.create({ data: { name: `${marker}-property`, address: "Report 1", city: "Praha", ownerId: owner.id } }),
    prisma.property.create({ data: { name: `${marker}-foreign`, address: "Foreign 2", city: "Praha", ownerId: owner.id } }),
  ]);
  const group = await prisma.reportingGroup.create({ data: { name: `${marker}-group`, members: { create: { userId: editor.id, permission: "EDIT" } } } });
  const asOfDate = new Date("2026-06-30T22:00:00.000Z");
  const snapshot = await prisma.quarterSnapshot.create({ data: { propertyId: property.id, asOfDate, year: 2026, quarter: 2, revision: 1, source: "MANUAL_BASELINE", schemaVersion: 1, calculatorVersion: "verify-report-design-2", data: { source: "MANUAL_BASELINE", schemaVersion: 1, asOfDate: "2026-06-30" }, quality: { issues: [] }, createdById: editor.id } });
  const report = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: group.name, year: 2026, quarter: 2, revision: 1, status: "DRAFT", asOfDate, createdById: editor.id, propertyReports: { create: { propertyId: property.id, propertyNameSnapshot: property.name, propertyAddressSnapshot: "Report 1, Praha", snapshotId: snapshot.id, propertyStatus: "STABILIZED" } } }, include: { propertyReports: true } });
  const propertyReport = report.propertyReports[0];
  const assets = await Promise.all(["one", "two", "foreign", "deleted", "not-photo"].map((label) => prisma.fileAsset.create({ data: { storageKey: `${marker}/${label}.jpg`, originalName: `${label}.jpg`, mimeType: "image/jpeg", sizeBytes: 100, sha256: createHash("sha256").update(label).digest("hex"), uploadedById: editor.id } })));
  const [assetOne, assetTwo, foreignAsset, deletedAsset, notPhotoAsset] = assets;
  const documents = await Promise.all([
    prisma.document.create({ data: { propertyId: property.id, fileAssetId: assetOne.id, category: "PHOTO", title: "Photo one", createdById: editor.id } }),
    prisma.document.create({ data: { propertyId: property.id, fileAssetId: assetTwo.id, category: "PHOTO", title: "Photo two", createdById: editor.id } }),
    prisma.document.create({ data: { propertyId: foreignProperty.id, fileAssetId: foreignAsset.id, category: "PHOTO", title: "Foreign photo", createdById: editor.id } }),
    prisma.document.create({ data: { propertyId: property.id, fileAssetId: deletedAsset.id, category: "PHOTO", title: "Deleted photo", deletedAt: new Date(), createdById: editor.id } }),
    prisma.document.create({ data: { propertyId: property.id, fileAssetId: notPhotoAsset.id, category: "OTHER", title: "Not a photo", createdById: editor.id } }),
  ]);
  const [documentOne, documentTwo, foreignDocument, deletedDocument, notPhotoDocument] = documents;

  try {
    await check("DB: legacy property reports remain valid with zero media", async () => assert.equal(await prisma.quarterlyPropertyReportMedia.count({ where: { quarterlyPropertyReportId: propertyReport.id } }), 0));
    await check("DB: missing primary image does not block existing REVIEW transition", async () => { await submitQuarterlyReportForReview(report.id, editor); assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).status, "REVIEW"); await prisma.quarterlyReport.update({ where: { id: report.id }, data: { status: "DRAFT" } }); });
    await check("DB: reporting outsider cannot mutate report media", async () => assert.rejects(selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: documentOne.id }, outsider), /Reporting EDIT/));
    await check("DB: PHOTO from another property is rejected", async () => assert.rejects(selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: foreignDocument.id }, editor), /not available/));
    await check("DB: deleted Document is rejected", async () => assert.rejects(selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: deletedDocument.id }, editor), /not available/));
    await check("DB: non-PHOTO Document is rejected", async () => assert.rejects(selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: notPhotoDocument.id }, editor), /not available/));
    await prisma.fileAsset.update({ where: { id: assetOne.id }, data: { deletedAt: new Date() } });
    await check("DB: deleted FileAsset is rejected", async () => assert.rejects(selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: documentOne.id }, editor), /not available/));
    await prisma.fileAsset.update({ where: { id: assetOne.id }, data: { deletedAt: null } });
    const selected = await selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: documentOne.id, caption: "První popisek" }, editor);
    await check("DB: selected media references the exact Document FileAsset", () => { assert.equal(selected.fileAssetId, documentOne.fileAssetId); assert.equal(selected.sourceDocumentId, documentOne.id); assert.equal(selected.role, "PRIMARY"); assert.equal(selected.sortOrder, 0); });
    await check("DB: partial unique index rejects a second PRIMARY row", async () => assert.rejects(prisma.quarterlyPropertyReportMedia.create({ data: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY", sortOrder: 0, fileAssetId: assetTwo.id, sourceDocumentId: documentTwo.id, createdById: editor.id } })));
    await removeQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id }, editor);
    await check("DB: explicit remove leaves no media and no publication side effect", async () => { assert.equal(await prisma.quarterlyPropertyReportMedia.count({ where: { quarterlyPropertyReportId: propertyReport.id } }), 0); assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).status, "DRAFT"); });
    await selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: documentTwo.id, caption: "Druhý popisek" }, editor);
    await updateQuarterlyPropertyPrimaryPhotoCaption({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, caption: "Aktualizovaný popisek" }, editor);
    await check("DB: caption update preserves the exact binary reference", async () => { const media = await prisma.quarterlyPropertyReportMedia.findFirstOrThrow({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } }); assert.equal(media.fileAssetId, assetTwo.id); assert.equal(media.caption, "Aktualizovaný popisek"); });
    await prisma.document.update({ where: { id: documentTwo.id }, data: { deletedAt: new Date() } });
    await check("DB: source Document soft-delete removes candidate but not selected image", async () => { const candidates = await listQuarterlyPropertyPhotoCandidates({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id }, editor); assert.ok(!candidates.some((row) => row.id === documentTwo.id)); const media = await prisma.quarterlyPropertyReportMedia.findFirstOrThrow({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } }); assert.equal((await resolveQuarterlyPropertyReportMediaImage({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, mediaId: media.id }, editor)).id, assetTwo.id); });
    await check("DB: referenced FileAsset cannot be hard-deleted", async () => assert.rejects(prisma.fileAsset.delete({ where: { id: assetTwo.id } })));
    await prisma.quarterlyReport.update({ where: { id: report.id }, data: { status: "REVIEW" } });
    await check("DB: REVIEW media is read-only", async () => { await assert.rejects(updateQuarterlyPropertyPrimaryPhotoCaption({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, caption: "Review" }, editor), /only change in DRAFT/); await assert.rejects(removeQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id }, editor), /only change in DRAFT/); });
    await prisma.quarterlyReport.update({ where: { id: report.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: editor.id } });
    await check("DB: PUBLISHED media is immutable", async () => assert.rejects(selectQuarterlyPropertyPrimaryPhoto({ reportId: report.id, reportingGroupId: group.id, propertyId: property.id, sourceDocumentId: documentOne.id }, editor), /only change in DRAFT/));
    const sourceBefore = await prisma.quarterlyPropertyReportMedia.findFirstOrThrow({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } });
    const correction = await createCorrectionRevision(report.id, editor);
    const correctionProperty = await prisma.quarterlyPropertyReport.findFirstOrThrow({ where: { quarterlyReportId: correction.id, propertyId: property.id }, include: { media: true } });
    await check("DB: correction clones media metadata and same immutable FileAsset", () => { assert.equal(correctionProperty.media.length, 1); assert.equal(correctionProperty.media[0].fileAssetId, sourceBefore.fileAssetId); assert.equal(correctionProperty.media[0].sourceDocumentId, sourceBefore.sourceDocumentId); assert.equal(correctionProperty.media[0].caption, sourceBefore.caption); assert.equal(correctionProperty.media[0].role, sourceBefore.role); assert.equal(correctionProperty.media[0].sortOrder, sourceBefore.sortOrder); });
    await check("DB: source published media remains unchanged after correction", async () => assert.deepEqual(await prisma.quarterlyPropertyReportMedia.findUniqueOrThrow({ where: { id: sourceBefore.id } }), sourceBefore));
    await check("DB: media audit actions exclude storage internals", async () => { const audits = await prisma.auditLog.findMany({ where: { entityType: "QuarterlyPropertyReportMedia", propertyId: property.id } }); assert.ok(audits.some((row) => row.action === "REPORT_PROPERTY_MEDIA_SELECTED")); assert.ok(audits.some((row) => row.action === "REPORT_PROPERTY_MEDIA_REMOVED")); assert.ok(audits.some((row) => row.action === "REPORT_PROPERTY_MEDIA_UPDATED")); assert.doesNotMatch(JSON.stringify(audits.map((row) => row.details)), /storageKey|sha256|previewStorageKey|thumbnailStorageKey/); });
    await check("DB: SUPER_ADMIN retains report-media access without membership", async () => { await updateQuarterlyPropertyPrimaryPhotoCaption({ reportId: correction.id, reportingGroupId: group.id, propertyId: property.id, caption: "Oprava administrátorem" }, superAdmin); assert.equal((await prisma.quarterlyPropertyReportMedia.findFirstOrThrow({ where: { quarterlyPropertyReportId: correctionProperty.id, role: "PRIMARY" } })).caption, "Oprava administrátorem"); });
    await check("DB: correction DRAFT can independently remove cloned media", async () => { await removeQuarterlyPropertyPrimaryPhoto({ reportId: correction.id, reportingGroupId: group.id, propertyId: property.id }, editor); assert.equal(await prisma.quarterlyPropertyReportMedia.count({ where: { quarterlyPropertyReportId: correctionProperty.id } }), 0); assert.equal(await prisma.quarterlyPropertyReportMedia.count({ where: { quarterlyPropertyReportId: propertyReport.id } }), 1); });
  } finally {
    await prisma.quarterlyReport.deleteMany({ where: { reportingGroupId: group.id } });
    await prisma.document.deleteMany({ where: { propertyId: { in: [property.id, foreignProperty.id] } } });
    await prisma.fileAsset.deleteMany({ where: { uploadedById: editor.id } });
    await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: group.id } });
    await prisma.reportingGroup.delete({ where: { id: group.id } });
    await prisma.quarterSnapshot.deleteMany({ where: { propertyId: property.id } });
    await prisma.property.deleteMany({ where: { id: { in: [property.id, foreignProperty.id] } } });
    await prisma.owner.delete({ where: { id: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((row) => row.id) } } });
  }
}

async function main() {
  await check("additive media schema and optional relation exist", () => { assert.match(schema, /enum QuarterlyReportMediaRole/); assert.match(schema, /media\s+QuarterlyPropertyReportMedia\[\]/); assert.doesNotMatch(schema, /media\s+QuarterlyPropertyReportMedia\s+@relation/); });
  await check("PRIMARY uniqueness is database- and service-enforced", () => { assert.match(migration, /CREATE UNIQUE INDEX "QuarterlyPropertyReportMedia_primary_key"[\s\S]*WHERE "role" = 'PRIMARY'/); assert.match(service, /role: "PRIMARY"/); assert.match(service, /sortOrder: 0/); });
  await check("media freezes exact FileAsset and source Document is nullable provenance", () => { assert.match(schema, /fileAsset\s+FileAsset[\s\S]*onDelete: Restrict/); assert.match(schema, /sourceDocument\s+Document\?[\s\S]*onDelete: SetNull/); assert.match(migration, /sourceDocumentId_fkey[\s\S]*ON DELETE SET NULL/); });
  await check("candidate query is property-scoped active PHOTO image data", () => { for (const token of ['category: "PHOTO"', "propertyId: propertyReport.propertyId", "deletedAt: null", 'mimeType: { startsWith: "image/" }']) assert.ok(service.includes(token)); });
  await check("request cannot supply arbitrary FileAsset identity", () => { const route = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/media/primary/route.ts"); assert.doesNotMatch(route, /fileAssetId/); assert.match(service, /fileAssetId: document\.fileAssetId/); });
  await check("report media mutation remains DRAFT and existing reporting permissions", () => { assert.match(service, /\["EDIT", "ADMIN", "SUPER_ADMIN"\]/); assert.match(service, /status !== "DRAFT"/); assert.doesNotMatch(service, /UserProperty|UserUnit|documentEditAccessWhere/); });
  await check("publication has no new image requirement or blocker", () => { const publish = reportService.slice(reportService.indexOf("export async function publishQuarterlyReport"), reportService.indexOf("export async function createCorrectionRevision")); assert.doesNotMatch(publish, /media|photo|image/i); });
  await check("correction clones media metadata without copying bytes", () => { assert.match(reportService, /propertyReports: \{ include: \{ media: true \} \}/); assert.match(reportService, /fileAssetId: item\.fileAssetId/); assert.doesNotMatch(reportService, /copyObject|putObject|storageKey/); });
  await check("DRAFT and read-only primary-photo workspace states exist", () => { assert.match(workspace, /Hlavní fotografie/); assert.match(workspace, /editable \?/); assert.match(workspace, /Odebrat z reportu/); assert.match(workspace, /Bez popisku/); assert.match(workspace, /Pro tuto nemovitost nejsou v dokumentech dostupné fotografie/); });
  await check("secure image delivery prefers derived variants without exposing keys", () => { assert.match(imageRoutes, /thumbnailStorageKey/); assert.match(imageRoutes, /previewStorageKey/); assert.match(imageRoutes, /private, no-store/); assert.doesNotMatch(imageRoutes, /NextResponse\.json|JSON\.stringify/); });
  await check("media mutation audit actions and safe details exist", () => { for (const action of ["REPORT_PROPERTY_MEDIA_SELECTED", "REPORT_PROPERTY_MEDIA_REMOVED", "REPORT_PROPERTY_MEDIA_UPDATED"]) assert.ok(service.includes(action)); assert.doesNotMatch(service.slice(service.indexOf("function auditDetails"), service.indexOf("export async function select")), /storageKey|sha256|mimeType/); });
  await check("PDF renderer and PDF data contract are byte-for-byte unchanged", () => { assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); });
  await check("no trend, MF benchmark, or new narrative model was added", () => { const sources = schema + service + workspace; assert.doesNotMatch(sources, /MF benchmark|nextSteps|investmentThesis|customKpi|CAPEX commentary|shareholder return|trend calculation/i); assert.equal(hash("lib/reporting/editorial-schema.ts"), "ab6e54e8bee77cfc29a7db197a0dcfd379e6884d656202f97dfd255b7c6f2591"); });
  await check("REPORT-DESIGN-2 is ordered after DESIGN-1 and before later design checkpoints", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:report-design-1\n      - run: npm run verify:report-design-2\n      - run: npm run verify:report-design-2-1\n      - run: npm run verify:report-design-2-1-upload\n      - run: npm run verify:report-design-3a\n      - run: npm run verify:report-design-3b\n      - run: npm run verify:report-design-3b1\n      - run: npm run verify:report-design-3b2\n      - run: npm run verify:report-design-3b3\n      - run: npm run verify:report-design-3b4\n      - run: npm run build")));
  await runtimeChecks();
  console.log(`REPORT-DESIGN-2 verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
