import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/db";
import { createCorrectionRevision } from "../lib/reporting/quarterly-report-service";
import { generatePublishedReportAsset, getPublishedReportAssetForDownload } from "../lib/reporting/report-asset-service";
import type { FileStorage, PutObjectInput, SignedDownloadOptions } from "../lib/storage/types";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");

class MemoryStorage implements FileStorage {
  objects = new Map<string, Uint8Array>();
  async putObject(input: PutObjectInput) { this.objects.set(input.key, input.body.slice()); }
  async deleteObject(key: string) { this.objects.delete(key); }
  async getObject(key: string) { const value = this.objects.get(key); if (!value) throw new Error("missing object"); return value.slice(); }
  async getSignedDownloadUrl(_key: string, _expires?: number, _options?: SignedDownloadOptions) { return "https://example.test/signed"; }
  async exists(key: string) { return this.objects.has(key); }
}

async function databaseBehavior() {
  const marker = `verify-v22c-part2ba3a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [editor, admin, viewer] = await Promise.all(["editor", "admin", "viewer"].map((label) => prisma.user.create({ data: { email: `${marker}-${label}@example.test`, name: label, passwordHash: "not-a-login", role: UserRole.OWNER_VIEWER, active: true } })));
  const superAdmin = await prisma.user.create({ data: { email: `${marker}-super@example.test`, name: "super", passwordHash: "not-a-login", role: UserRole.SUPER_ADMIN, active: true } });
  let groupId: string | undefined;
  try {
    const group = await prisma.reportingGroup.create({ data: { name: marker, members: { create: [{ userId: editor.id, permission: "EDIT" }, { userId: admin.id, permission: "ADMIN" }, { userId: viewer.id, permission: "VIEW" }] } } }); groupId = group.id;
    const report = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: group.name, year: 2026, quarter: 2, revision: 1, status: "PUBLISHED", asOfDate: new Date("2026-06-29T22:00:00.000Z"), createdById: editor.id, publishedById: editor.id, publishedAt: new Date() } });
    const storage = new MemoryStorage();
    await check("DB: EDIT cannot generate the canonical published asset", async () => {
      await assert.rejects(generatePublishedReportAsset(report.id, group.id, { id: editor.id, role: editor.role }, storage), /ADMIN permission/);
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).publishedAssetId, null);
    });
    const actor = { id: admin.id, role: admin.role };
    const created = await generatePublishedReportAsset(report.id, group.id, actor, storage);
    const attached = await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id }, include: { publishedAsset: true } });

    await check("DB: generated stored bytes determine immutable FileAsset metadata", async () => {
      assert.equal(attached.publishedAssetId, created.id); assert.ok(attached.publishedAsset);
      const bytes = await storage.getObject(attached.publishedAsset.storageKey);
      assert.equal(attached.publishedAsset.sha256, createHash("sha256").update(bytes).digest("hex"));
      assert.equal(attached.publishedAsset.sizeBytes, bytes.byteLength); assert.ok(attached.publishedAsset.mimeType); assert.ok(attached.publishedAsset.originalName);
      assert.match(attached.publishedAsset.storageKey, new RegExp(`${group.id}/quarterly-reports/${report.id}/revision-1/`));
    });
    await check("DB: an attached published asset is never silently replaced", async () => {
      await assert.rejects(generatePublishedReportAsset(report.id, group.id, actor, storage), /already exists/);
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).publishedAssetId, created.id);
      assert.equal(await prisma.fileAsset.count({ where: { publishedReports: { some: { id: report.id } } } }), 1);
    });
    await check("DB: SUPER_ADMIN can generate without group membership", async () => {
      const superReport = await prisma.quarterlyReport.create({ data: { reportingGroupId: group.id, reportingGroupNameSnapshot: group.name, year: 2026, quarter: 3, revision: 1, status: "PUBLISHED", asOfDate: new Date("2026-09-29T22:00:00.000Z"), createdById: superAdmin.id, publishedById: superAdmin.id, publishedAt: new Date() } });
      const result = await generatePublishedReportAsset(superReport.id, group.id, { id: superAdmin.id, role: superAdmin.role }, storage);
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: superReport.id } })).publishedAssetId, result.id);
    });
    await check("DB: ReportingGroup VIEW without RENT grants resolves download", async () => {
      assert.equal(await prisma.userProperty.count({ where: { userId: viewer.id } }), 0); assert.equal(await prisma.userUnit.count({ where: { userId: viewer.id } }), 0);
      const download = await getPublishedReportAssetForDownload(report.id, group.id, { id: viewer.id, role: viewer.role });
      assert.equal(download.originalName, attached.publishedAsset!.originalName);
    });
    await check("DB: deleted asset is invalid for published download", async () => {
      await prisma.fileAsset.update({ where: { id: created.id }, data: { deletedAt: new Date() } });
      await assert.rejects(getPublishedReportAssetForDownload(report.id, group.id, { id: viewer.id, role: viewer.role }), /not found/);
      await prisma.fileAsset.update({ where: { id: created.id }, data: { deletedAt: null } });
    });
    await check("DB: correction leaves source publishedAssetId unchanged and starts unattached", async () => {
      const before = (await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).publishedAssetId;
      const correction = await createCorrectionRevision(report.id, actor);
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: report.id } })).publishedAssetId, before);
      assert.equal((await prisma.quarterlyReport.findUniqueOrThrow({ where: { id: correction.id } })).publishedAssetId, null);
    });
    await check("DB: generation audit records report, group, revision, asset and checksum provenance", async () => {
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "REPORT_PUBLISHED_ASSET_GENERATED", entityId: report.id } });
      const value = JSON.stringify(audit.details); for (const expected of [report.id, group.id, created.id, attached.publishedAsset!.sha256, '"revision":1']) assert.match(value, new RegExp(expected));
    });
  } finally {
    const ids = [editor.id, admin.id, viewer.id, superAdmin.id];
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    if (groupId) await prisma.quarterlyReport.deleteMany({ where: { reportingGroupId: groupId } });
    await prisma.fileAsset.deleteMany({ where: { uploadedById: { in: [admin.id, superAdmin.id] } } });
    if (groupId) { await prisma.reportingGroupMember.deleteMany({ where: { reportingGroupId: groupId } }); await prisma.reportingGroup.deleteMany({ where: { id: groupId } }); }
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  const schema = read("prisma/schema.prisma"), migration = read("prisma/migrations/20260830180000_v22_c_part2ba3a_published_report_asset/migration.sql");
  const service = read("lib/reporting/report-asset-service.ts"), correction = read("lib/reporting/quarterly-report-service.ts");
  const generation = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/assets/generate/route.ts");
  const download = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/assets/download/route.ts");
  const workspace = read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx") + read("components/quarterly-report-workspace/QuarterlyReportReviewExport.tsx");
  await check("schema has named report asset relation, index and restrictive FK migration", () => { assert.match(schema, /publishedAsset\s+FileAsset\?\s+@relation\("QuarterlyReportPublishedAsset"/); assert.match(schema, /@@index\(\[publishedAssetId\]\)/); assert.match(migration, /ON DELETE RESTRICT/); });
  await check("report assets are ReportingGroup-authorized and never RENT-authorized", () => { assert.match(service, /backofficePermissionForGroup/); assert.doesNotMatch(service + generation + download, /DocumentAccess|documentAccessWhere|userProperty|userUnit|property grant|lease grant|RENT/); });
  await check("generation is ADMIN/SUPER_ADMIN and PUBLISHED-only with conditional attachment", () => { assert.match(service, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(permission\)/); assert.doesNotMatch(service, /\["EDIT", "ADMIN", "SUPER_ADMIN"\]\.includes\(permission\)/); assert.match(service, /status !== "PUBLISHED"/); assert.match(service, /publishedAssetId: null/); assert.match(service, /attached\.count !== 1/); });
  await check("checksum and metadata derive from exact bytes read after storage", () => { assert.match(service, /storedBytes = await resolvedStorage\.getObject\(key\)/); assert.match(service, /createHash\("sha256"\)\.update\(storedBytes\)/); assert.match(service, /sizeBytes: storedBytes\.byteLength/); });
  await check("storageKey is confined to service and download transport", () => { assert.doesNotMatch(workspace + generation, /storageKey/); assert.doesNotMatch(service, /return \{[^}]*storageKey/); });
  await check("correction creation does not copy or mutate publishedAssetId", () => { const body = correction.slice(correction.indexOf("export async function createCorrectionRevision")); assert.doesNotMatch(body, /publishedAssetId/); });
  await check("download accepts VIEW membership and excludes deleted assets", () => { assert.match(service, /permission === "NONE"/); assert.match(service, /publishedAsset\.deletedAt/); });
  await check("only PUBLISHED UI exposes asset controls and only configured ADMIN/SUPER_ADMIN sees generation", () => { assert.match(workspace, /status === "PUBLISHED"[\s\S]*assets\/download/); assert.doesNotMatch(workspace, /status === "(DRAFT|REVIEW)"[\s\S]{0,300}assets\/download/); assert.match(workspace, /publishedAssetId \?[^:]+assets\/download/); assert.match(workspace, /admin && persistentStorageAvailable \?[^:]+assets\/generate/); });
  await check("A3a follows A2 in CI", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2ba2\n      - run: npm run verify:v22-c-part2ba3a\n")));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for A3a database behavior verification.");
  await databaseBehavior();
  console.log(`V22-C Part 2B-A3a verification passed: ${count} checks.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
