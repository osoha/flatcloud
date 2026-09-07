import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { createFileStorage } from "../storage";
import { annualReportStoragePlacement } from "../storage/locations";
import { StorageDisabledError, type FileStorage } from "../storage/types";
import { backofficePermissionForGroup } from "./backoffice-access";
import { loadFrozenAnnualReportPdfData } from "./pdf/annual-report-pdf-data";
import { ANNUAL_REPORT_PDF_RENDERER_VERSION } from "./pdf/annual-report-pdf";

export type AnnualReportAssetActor = { id: string; role: string };
export const ANNUAL_REPORT_PDF_MIME_TYPE = "application/pdf";

export class AnnualReportAssetError extends Error {
  constructor(message: string, readonly status: 403 | 404 | 409 | 503 = 409) { super(message); this.name = "AnnualReportAssetError"; }
}

type ArtifactReport = { id: string; reportingGroupId: string; year: number; revision: number; status: string };
const filename = (report: ArtifactReport) => `flatcloud-vyrocni-${report.year}-revize-${report.revision}.pdf`;
const storageKey = (report: ArtifactReport) => `reporting-groups/${report.reportingGroupId}/annual-reports/${report.id}/revision-${report.revision}/${randomUUID()}.pdf`;

async function renderReport(report: ArtifactReport) {
  const data = await loadFrozenAnnualReportPdfData(report.id, report.reportingGroupId);
  const { renderAnnualReportPdf } = await import("./pdf/annual-report-pdf");
  return renderAnnualReportPdf(data);
}

function storageUnavailable(error: unknown) {
  if (error instanceof StorageDisabledError) return new AnnualReportAssetError("Trvalé úložiště souborů není nakonfigurováno. PDF lze stáhnout jako náhled.", 503);
  if (error instanceof Error && /^S3_[A-Z0-9_]+ is required for S3 storage\.$/.test(error.message)) return new AnnualReportAssetError("Konfigurace trvalého S3 úložiště není úplná.", 503);
  console.error("Persistent annual report storage failed.", error);
  return new AnnualReportAssetError("Trvalé úložiště souborů je dočasně nedostupné.", 503);
}

async function cleanup(storage: FileStorage, key: string) { try { await storage.deleteObject(key); } catch { /* Cleanup must not mask the original failure. */ } }

export async function renderAnnualReportPdfPreview(reportId: string, groupId: string, actor: AnnualReportAssetActor) {
  const permission = await backofficePermissionForGroup(actor, groupId);
  if (permission === "NONE") throw new AnnualReportAssetError("ReportingGroup VIEW permission is required.", 403);
  const report = await prisma.annualReport.findFirst({ where: { id: reportId, reportingGroupId: groupId }, select: { id: true, reportingGroupId: true, year: true, revision: true, status: true } });
  if (!report) throw new AnnualReportAssetError("Annual report was not found.", 404);
  return { bytes: await renderReport(report), mimeType: ANNUAL_REPORT_PDF_MIME_TYPE, originalName: filename(report) };
}

export async function generatePublishedAnnualReportAsset(reportId: string, groupId: string, actor: AnnualReportAssetActor, storage?: FileStorage) {
  const report = await prisma.annualReport.findFirst({ where: { id: reportId, reportingGroupId: groupId }, select: { id: true, reportingGroupId: true, year: true, revision: true, status: true, publishedAssetId: true } });
  if (!report) throw new AnnualReportAssetError("Annual report was not found.", 404);
  const permission = await backofficePermissionForGroup(actor, groupId);
  if (!["ADMIN", "SUPER_ADMIN"].includes(permission)) throw new AnnualReportAssetError("Reporting ADMIN permission is required.", 403);
  if (report.status !== "PUBLISHED") throw new AnnualReportAssetError("Published assets can only be generated for PUBLISHED annual reports.", 409);
  if (report.publishedAssetId) throw new AnnualReportAssetError("Published annual report asset already exists.", 409);
  let resolvedStorage: FileStorage;
  try { resolvedStorage = storage ?? createFileStorage(); } catch (error) { throw storageUnavailable(error); }
  const bytes = await renderReport(report);
  const key = storageKey(report);
  let providerKey: string | undefined;
  let storedBytes: Uint8Array;
  try {
    const placement = await annualReportStoragePlacement(resolvedStorage, report.year, filename(report));
    const result = await resolvedStorage.putObject({ key, body: bytes, contentType: ANNUAL_REPORT_PDF_MIME_TYPE, displayName: placement.displayName, folderId: placement.folderId });
    providerKey = result.key;
    storedBytes = await resolvedStorage.getObject(providerKey);
  } catch (error) {
    if (providerKey) await cleanup(resolvedStorage, providerKey);
    throw storageUnavailable(error);
  }
  const sha256 = createHash("sha256").update(storedBytes).digest("hex");
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.annualReport.findFirst({ where: { id: report.id, reportingGroupId: groupId }, select: { status: true, publishedAssetId: true } });
      if (!current) throw new AnnualReportAssetError("Annual report was not found.", 404);
      if (current.status !== "PUBLISHED") throw new AnnualReportAssetError("Published assets can only be generated for PUBLISHED annual reports.", 409);
      if (current.publishedAssetId) throw new AnnualReportAssetError("Published annual report asset already exists.", 409);
      const asset = await tx.fileAsset.create({ data: { storageKey: providerKey!, originalName: filename(report), mimeType: ANNUAL_REPORT_PDF_MIME_TYPE, sizeBytes: storedBytes.byteLength, sha256, uploadedById: actor.id } });
      const attached = await tx.annualReport.updateMany({ where: { id: report.id, reportingGroupId: groupId, status: "PUBLISHED", publishedAssetId: null }, data: { publishedAssetId: asset.id } });
      if (attached.count !== 1) throw new AnnualReportAssetError("Published annual report asset already exists.", 409);
      await tx.auditLog.create({ data: { userId: actor.id, action: "ANNUAL_REPORT_PUBLISHED_ASSET_GENERATED", entityType: "AnnualReport", entityId: report.id, details: { reportId: report.id, reportingGroupId: groupId, revision: report.revision, fileAssetId: asset.id, sha256, rendererVersion: ANNUAL_REPORT_PDF_RENDERER_VERSION } satisfies Prisma.InputJsonObject } });
      return { id: asset.id, originalName: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes };
    });
  } catch (error) {
    if (providerKey) await cleanup(resolvedStorage, providerKey);
    throw error;
  }
}

export async function getPublishedAnnualReportAssetForDownload(reportId: string, groupId: string, actor: AnnualReportAssetActor) {
  const permission = await backofficePermissionForGroup(actor, groupId);
  if (permission === "NONE") throw new AnnualReportAssetError("ReportingGroup VIEW permission is required.", 403);
  const report = await prisma.annualReport.findFirst({ where: { id: reportId, reportingGroupId: groupId, status: "PUBLISHED" }, select: { publishedAsset: { select: { storageKey: true, originalName: true, mimeType: true, sizeBytes: true, deletedAt: true } } } });
  if (!report?.publishedAsset || report.publishedAsset.deletedAt) throw new AnnualReportAssetError("Published annual report asset was not found.", 404);
  return report.publishedAsset;
}
