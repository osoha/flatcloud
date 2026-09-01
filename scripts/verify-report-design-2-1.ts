import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { listQuarterlyPropertyPhotoCandidates, uploadQuarterlyPropertyPrimaryPhoto } from "../lib/reporting/quarterly-report-media-service";
import type { FileStorage, PutObjectInput, SignedDownloadOptions } from "../lib/storage/types";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file: string) => createHash("sha256").update(read(file)).digest("hex");
let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }

class MemoryStorage implements FileStorage {
  objects = new Map<string, Uint8Array>();
  deleted: string[] = [];
  async putObject(input: PutObjectInput) { this.objects.set(input.key, input.body); return { key: input.key }; }
  async deleteObject(key: string) { this.deleted.push(key); this.objects.delete(key); }
  async getObject(key: string) { const value = this.objects.get(key); if (!value) throw new Error("missing"); return value; }
  async getSignedDownloadUrl(key: string, _expires?: number, _options?: SignedDownloadOptions) { return `https://example.test/${key}`; }
  async exists(key: string) { return this.objects.has(key); }
}

const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const file = (name: string) => ({ bytes: png, mimeType: "image/png", originalName: name });

async function runtimeChecks() {
  const marker = `report-design-2-1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const users = await Promise.all([
    ["editor", "OWNER_VIEWER"], ["admin", "OWNER_VIEWER"], ["viewer", "OWNER_VIEWER"], ["super", "SUPER_ADMIN"],
  ].map(([label, role]) => prisma.user.create({ data: { name: `${marker}-${label}`, email: `${marker}-${label}@example.test`, passwordHash: "test", role: role as "OWNER_VIEWER" | "SUPER_ADMIN" } })));
  const [editor, admin, viewer, superAdmin] = users;
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } });
  const [property, foreignProperty] = await Promise.all([
    prisma.property.create({ data: { name: `${marker}-property`, address: "Report 1", city: "Praha", ownerId: owner.id } }),
    prisma.property.create({ data: { name: `${marker}-foreign`, address: "Foreign 2", city: "Praha", ownerId: owner.id } }),
  ]);
  const group = await prisma.reportingGroup.create({ data: { name: `${marker}-group`, members: { create: [{ userId: editor.id, permission: "EDIT" }, { userId: admin.id, permission: "ADMIN" }, { userId: viewer.id, permission: "VIEW" }] } } });
  const asOfDate = new Date("2026-09-30T22:00:00.000Z");
  const snapshot = await prisma.quarterSnapshot.create({ data: { propertyId: property.id, asOfDate, year: 2026, quarter: 3, revision: 1, source: "MANUAL_BASELINE", schemaVersion: 1, calculatorVersion: "verify-report-design-2-1", data: { source: "MANUAL_BASELINE", schemaVersion: 1, asOfDate: "2026-09-30" }, quality: { issues: [] }, createdById: editor.id } });
  const report = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: group.name, year: 2026, quarter: 3, revision: 1, status: "DRAFT", asOfDate, createdById: editor.id, propertyReports: { create: { propertyId: property.id, propertyNameSnapshot: property.name, propertyAddressSnapshot: "Report 1, Praha", snapshotId: snapshot.id, propertyStatus: "STABILIZED" } } }, include: { propertyReports: true } });
  const propertyReport = report.propertyReports[0];
  const input = { reportId: report.id, reportingGroupId: group.id, propertyId: property.id };
  const storage = new MemoryStorage();
  try {
    await check("DB: reporting VIEW cannot upload and stores nothing", async () => { await assert.rejects(uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: file("view.png") }, viewer, storage), /Reporting EDIT/); assert.equal(storage.objects.size, 0); });
    await check("DB: cross-property route identity cannot resolve a property report", async () => assert.rejects(uploadQuarterlyPropertyPrimaryPhoto({ ...input, propertyId: foreignProperty.id, file: file("foreign.png") }, editor, storage), /not found/));
    await check("DB: non-image upload is rejected before persistence", async () => assert.rejects(uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), mimeType: "application/pdf", originalName: "bad.pdf" } }, editor, storage), /must be an image/));
    const first = await uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: file("first.png"), caption: "První" }, editor, storage);
    await check("DB: EDIT without generic property grant creates strict PHOTO/GENERAL Document", async () => { assert.equal(await prisma.userProperty.count({ where: { userId: editor.id } }), 0); const document = await prisma.document.findUniqueOrThrow({ where: { id: first.document.id } }); assert.equal(document.propertyId, property.id); assert.equal(document.category, "PHOTO"); assert.equal(document.photoStage, "GENERAL"); assert.equal(document.title, "Fotografie pro kvartální report"); assert.equal(document.unitId, null); assert.equal(document.leaseId, null); assert.equal(document.taskId, null); assert.equal(document.taskEntryId, null); assert.equal(document.complianceRecordId, null); });
    await check("DB: normal FileAsset has checksum and preview/thumbnail variants", async () => { const asset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: first.document.fileAssetId } }); assert.equal(asset.sha256, createHash("sha256").update(png).digest("hex")); assert.ok(asset.previewStorageKey); assert.ok(asset.thumbnailStorageKey); assert.equal(storage.objects.size, 3); });
    await check("DB: uploaded FileAsset is PRIMARY with Document provenance", () => { assert.equal(first.media.quarterlyPropertyReportId, propertyReport.id); assert.equal(first.media.fileAssetId, first.document.fileAssetId); assert.equal(first.media.sourceDocumentId, first.document.id); assert.equal(first.media.role, "PRIMARY"); assert.equal(first.media.sortOrder, 0); });
    await check("DB: uploaded Document becomes a normal future candidate", async () => assert.ok((await listQuarterlyPropertyPhotoCandidates(input, editor)).some((candidate) => candidate.id === first.document.id)));
    const second = await uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: file("second.png") }, admin, storage);
    await check("DB: ADMIN replacement keeps old Document and FileAsset", async () => { assert.ok(await prisma.document.findUnique({ where: { id: first.document.id } })); assert.ok(await prisma.fileAsset.findUnique({ where: { id: first.document.fileAssetId } })); const media = await prisma.quarterlyPropertyReportMedia.findFirstOrThrow({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } }); assert.equal(media.fileAssetId, second.document.fileAssetId); assert.equal(media.sourceDocumentId, second.document.id); });
    const third = await uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: file("super.png") }, superAdmin, storage);
    await check("DB: SUPER_ADMIN uploads without reporting membership", () => assert.equal(third.media.fileAssetId, third.document.fileAssetId));
    const beforeFailure = { documents: await prisma.document.count({ where: { propertyId: property.id } }), assets: await prisma.fileAsset.count({ where: { uploadedById: editor.id } }), stored: storage.objects.size };
    await check("DB: failed DB transaction rolls back rows and cleans newly stored objects", async () => { await assert.rejects(uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: file("cleanup.png"), caption: "x".repeat(501) }, editor, storage), /too long/); assert.equal(await prisma.document.count({ where: { propertyId: property.id } }), beforeFailure.documents); assert.equal(await prisma.fileAsset.count({ where: { uploadedById: editor.id } }), beforeFailure.assets); assert.equal(storage.objects.size, beforeFailure.stored); assert.ok(storage.deleted.length >= 3); });
    await check("DB: both normal Document and report-media audits identify the operation safely", async () => { const audits = await prisma.auditLog.findMany({ where: { propertyId: property.id, action: { in: ["DOCUMENT_UPLOADED", "REPORT_PROPERTY_MEDIA_SELECTED", "REPORT_PROPERTY_MEDIA_UPDATED"] } } }); assert.ok(audits.some((row) => row.action === "DOCUMENT_UPLOADED" && row.entityId === first.document.id)); assert.ok(audits.some((row) => row.action === "REPORT_PROPERTY_MEDIA_SELECTED")); assert.ok(audits.some((row) => row.action === "REPORT_PROPERTY_MEDIA_UPDATED")); const serialized = JSON.stringify(audits.map((row) => row.details)); assert.match(serialized, new RegExp(first.document.id)); assert.match(serialized, new RegExp(first.document.fileAssetId)); assert.doesNotMatch(serialized, /storageKey|previewStorageKey|thumbnailStorageKey/); });
    await prisma.quarterlyReport.update({ where: { id: report.id }, data: { status: "REVIEW" } });
    await check("DB: REVIEW rejects upload server-side before storage", async () => { const size = storage.objects.size; await assert.rejects(uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: file("review.png") }, editor, storage), /only change in DRAFT/); assert.equal(storage.objects.size, size); });
    await prisma.quarterlyReport.update({ where: { id: report.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: admin.id } });
    await check("DB: PUBLISHED rejects upload server-side before storage", async () => { const size = storage.objects.size; await assert.rejects(uploadQuarterlyPropertyPrimaryPhoto({ ...input, file: file("published.png") }, superAdmin, storage), /only change in DRAFT/); assert.equal(storage.objects.size, size); });
  } finally {
    await prisma.quarterlyReport.deleteMany({ where: { reportingGroupId: group.id } });
    await prisma.document.deleteMany({ where: { propertyId: { in: [property.id, foreignProperty.id] } } });
    await prisma.fileAsset.deleteMany({ where: { uploadedById: { in: users.map((user) => user.id) } } });
    await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: group.id } });
    await prisma.reportingGroup.delete({ where: { id: group.id } });
    await prisma.quarterSnapshot.deleteMany({ where: { propertyId: property.id } });
    await prisma.property.deleteMany({ where: { id: { in: [property.id, foreignProperty.id] } } });
    await prisma.owner.delete({ where: { id: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  }
}

async function main() {
  const service = read("lib/reporting/quarterly-report-media-service.ts");
  const route = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/media/primary/upload/route.ts");
  const workspace = read("components/quarterly-report-workspace/QuarterlyReportPrimaryPhoto.tsx");
  await check("DESIGN-2.1 added no dedicated Prisma schema or migration", () => { assert.match(read("prisma/schema.prisma"), /model QuarterlyPropertyReportMedia/); assert.equal(fs.readdirSync(path.join(root, "prisma/migrations")).filter((name) => /report.design.2.1|direct.*photo/i.test(name)).length, 0); });
  await check("upload is DRAFT-only with EDIT ADMIN SUPER_ADMIN semantics", () => { assert.match(service, /editablePropertyReport\(tx, input, actor\)/); assert.match(service, /status !== "DRAFT"/); assert.match(service, /\["EDIT", "ADMIN", "SUPER_ADMIN"\]/); });
  await check("generic document permissions and deletion remain unchanged while storage uses returned keys", () => { assert.equal(hash("lib/documents/service.ts"), "414d72d5088ba43b0c9a84875f3b93ee4cd205048add64a0117b65e84be8e531"); assert.equal(hash("lib/documents/access.ts"), "935798dfbe0a1963c228b88133ee6558c3182f0afa4f86f7e93b1b25bf98a5ef"); });
  await check("route accepts no property/category/asset/storage/context form authority", () => { assert.doesNotMatch(route, /text\(form, "(?:propertyId|category|photoStage|fileAssetId|storageKey|unitId|leaseId|taskId|taskEntryId|complianceRecordId)"/); assert.match(route, /propertyId }, actor/); });
  await check("service hardcodes property-only PHOTO GENERAL metadata", () => { assert.match(service, /propertyId: authorized\.propertyId/); assert.match(service, /category: DocumentCategory\.PHOTO/); assert.match(service, /photoStage: DocumentPhotoStage\.GENERAL/); assert.doesNotMatch(service.slice(service.indexOf("uploadQuarterlyPropertyPrimaryPhoto")), /input\.(category|photoStage|fileAssetId|storageKey|unitId|leaseId|taskId|taskEntryId|complianceRecordId)/); });
  await check("existing validation storage and image pipeline are reused with provider-returned keys", () => { assert.match(route, /prepareDocumentFiles\(form\)/); assert.match(service, /storePreparedDocumentBatch/); assert.match(service, /createStoredDocumentsInTransaction/); assert.match(service, /cleanupStoredDocumentBatch/); assert.equal(hash("lib/documents/batch-service.ts"), "50d443290b74ab854280e658be6fb791c0cfe88b729d75d22cc81e7a25496595"); });
  await check("Document and PRIMARY selection share one DB transaction and both audits", () => { assert.match(service, /createStoredDocumentsInTransaction\(tx, stored\)[\s\S]*quarterlyPropertyReportMedia/); assert.match(service, /REPORT_PROPERTY_MEDIA_(?:UPDATED|SELECTED)/); assert.match(read("lib/documents/batch-service.ts"), /DOCUMENT_UPLOADED/); });
  await check("compact upload UI remains available without candidates only in editable state", () => { assert.match(workspace, /Nahrát novou fotografii/); assert.match(workspace, /Nahrát a použít/); assert.match(workspace, /multipart\/form-data/); assert.match(workspace, /editable && <></); assert.ok(workspace.indexOf("quarterly-photo-upload") > workspace.indexOf("candidates.length")); });
  await check("upload participates in editorial dirty-state protection without autosave", () => { const editor = read("components/QuarterlyPropertyEditorialEditor.tsx"); assert.match(workspace, /protectUnsavedEditorialChanges/); assert.match(workspace, /quarterly-report-external-submit/); assert.match(editor, /quarterlyEditorialDirty/); assert.match(editor, /quarterly-report-external-submit/); assert.doesNotMatch(workspace, /fetch\(|useEffect|autosave/i); });
  await check("selected-image secure delivery remains unchanged", () => { assert.equal(hash("lib/reporting/quarterly-report-media-image.ts"), "0fd4b0a1d5d7ae282d9f0cf47d843f1db4d9a51c963945347a70ebff7e416c81"); assert.equal(hash("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/media/[mediaId]/image/route.ts"), "325fa1e25d12e10a7e73f5714a29783cc044bed9867bcc1143e5e401b1d67f91"); });
  await check("PDF editorial snapshot and quality contracts are unchanged", () => { assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); assert.equal(hash("lib/reporting/editorial-schema.ts"), "1e79b34172eddba838e2bf2beb6ca2867f17ce8803b6f5e67a764294333c609c"); assert.equal(hash("lib/reporting/snapshot-schema.ts"), "560cc086ddd3bc22d464c968ab598cf01b10e669d0df3a1869fd3e9917bf0c00"); assert.equal(hash("lib/reporting/quarterly-quality-gate.ts"), "bee943a48d16afe527c3f9340947821022d98794066134ff7783dea3d2f4fcf1"); });
  await check("checkpoint adds no trends templates Drive MF annual fields or blocker", () => { const sources = service + route + workspace; assert.doesNotMatch(sources, /Google Drive|MF benchmark|trend calculation|report template|annual report|publication blocker|investmentThesis|nextSteps/i); });
  await check("CI orders DESIGN-2.1 after DESIGN-2 and before its upload hotfix", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:report-design-2\n      - run: npm run verify:report-design-2-1\n      - run: npm run verify:report-design-2-1-upload\n      - run: npm run verify:report-design-3a\n      - run: npm run verify:report-design-3b\n      - run: npm run verify:report-design-3b1\n      - run: npm run verify:report-design-3b2\n      - run: npm run verify:report-design-3b3\n      - run: npm run verify:report-design-3b4\n      - run: npm run build")));
  await runtimeChecks();
  console.log(`REPORT-DESIGN-2.1 verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
