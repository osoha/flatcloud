import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { createFileStorage } from "../storage";
import { StorageDisabledError, type FileStorage } from "../storage/types";
import { backofficePermissionForGroup } from "./backoffice-access";
import { loadFrozenQuarterlyReportPdfData } from "./pdf/quarterly-report-pdf-data";
import { REPORT_PDF_RENDERER_VERSION } from "./pdf/constants";

export type ReportAssetActor = { id: string; role: string };
export const REPORT_PDF_MIME_TYPE = "application/pdf";

export class ReportAssetError extends Error {
  constructor(message: string, readonly status: 403 | 404 | 409 | 503 = 409) { super(message); this.name = "ReportAssetError"; }
}

type ArtifactReport = { id: string; reportingGroupId: string; year: number; quarter: number; revision: number; status: string };

function storageKey(report: ArtifactReport) {
  return `reporting-groups/${report.reportingGroupId}/quarterly-reports/${report.id}/revision-${report.revision}/${randomUUID()}.pdf`;
}

function filename(report: ArtifactReport) { return `flatcloud-${report.year}-q${report.quarter}-revize-${report.revision}.pdf`; }

async function renderPublishedReportPdf(report: ArtifactReport) {
  const renderData = await loadFrozenQuarterlyReportPdfData(report.id, report.reportingGroupId);
  const { renderQuarterlyReportPdf } = await import("./pdf/quarterly-report-pdf");
  return renderQuarterlyReportPdf(renderData);
}

function storageUnavailable(error: unknown) {
  if (error instanceof StorageDisabledError) return new ReportAssetError("Trvalé úložiště souborů není nakonfigurováno. PDF lze stáhnout jako náhled.", 503);
  if (error instanceof Error && /^S3_[A-Z0-9_]+ is required for S3 storage\.$/.test(error.message)) return new ReportAssetError("Konfigurace trvalého S3 úložiště není úplná.", 503);
  console.error("Persistent report storage failed.", error);
  return new ReportAssetError("Trvalé úložiště souborů je dočasně nedostupné.", 503);
}

async function cleanupStoredReport(storage: FileStorage, key: string) { try { await storage.deleteObject(key); } catch { /* Best-effort cleanup must not mask the original failure. */ } }

export async function renderPublishedReportPdfPreview(reportId: string, groupId: string, actor: ReportAssetActor) {
  const permission = await backofficePermissionForGroup(actor, groupId);
  if (permission === "NONE") throw new ReportAssetError("ReportingGroup VIEW permission is required.", 403);
  const report = await prisma.quarterlyReport.findFirst({ where: { id: reportId, reportingGroupId: groupId, status: "PUBLISHED" }, select: { id: true, reportingGroupId: true, year: true, quarter: true, revision: true, status: true } });
  if (!report) throw new ReportAssetError("Published quarterly report was not found.", 404);
  return { bytes: await renderPublishedReportPdf(report), mimeType: REPORT_PDF_MIME_TYPE, originalName: filename(report) };
}

export async function generatePublishedReportAsset(reportId: string, groupId: string, actor: ReportAssetActor, storage?: FileStorage) {
  const report = await prisma.quarterlyReport.findFirst({ where: { id: reportId, reportingGroupId: groupId }, select: { id: true, reportingGroupId: true, year: true, quarter: true, revision: true, status: true, publishedAssetId: true } });
  if (!report) throw new ReportAssetError("Quarterly report was not found.", 404);
  const permission = await backofficePermissionForGroup(actor, groupId);
  if (!["ADMIN", "SUPER_ADMIN"].includes(permission)) throw new ReportAssetError("Reporting ADMIN permission is required.", 403);
  if (report.status !== "PUBLISHED") throw new ReportAssetError("Published assets can only be generated for PUBLISHED reports.", 409);
  if (report.publishedAssetId) throw new ReportAssetError("Published report asset already exists.", 409);

  let resolvedStorage: FileStorage;
  try { resolvedStorage = storage ?? createFileStorage(); } catch (error) { throw storageUnavailable(error); }
  const bytes = await renderPublishedReportPdf(report);
  const key = storageKey(report);
  let storedBytes: Uint8Array;
  try {
    await resolvedStorage.putObject({ key, body: bytes, contentType: REPORT_PDF_MIME_TYPE });
    storedBytes = await resolvedStorage.getObject(key);
  } catch (error) {
    await cleanupStoredReport(resolvedStorage, key);
    throw storageUnavailable(error);
  }
  const sha256 = createHash("sha256").update(storedBytes).digest("hex");
  try { return await prisma.$transaction(async (tx) => {
      const current = await tx.quarterlyReport.findFirst({ where: { id: report.id, reportingGroupId: groupId }, select: { status: true, publishedAssetId: true } });
      if (!current) throw new ReportAssetError("Quarterly report was not found.", 404);
      if (current.status !== "PUBLISHED") throw new ReportAssetError("Published assets can only be generated for PUBLISHED reports.", 409);
      if (current.publishedAssetId) throw new ReportAssetError("Published report asset already exists.", 409);
      const asset = await tx.fileAsset.create({ data: { storageKey: key, originalName: filename(report), mimeType: REPORT_PDF_MIME_TYPE, sizeBytes: storedBytes.byteLength, sha256, uploadedById: actor.id } });
      const attached = await tx.quarterlyReport.updateMany({ where: { id: report.id, reportingGroupId: groupId, status: "PUBLISHED", publishedAssetId: null }, data: { publishedAssetId: asset.id } });
      if (attached.count !== 1) throw new ReportAssetError("Published report asset already exists.", 409);
      await tx.auditLog.create({ data: { userId: actor.id, action: "REPORT_PUBLISHED_ASSET_GENERATED", entityType: "QuarterlyReport", entityId: report.id, details: { reportId: report.id, reportingGroupId: groupId, revision: report.revision, fileAssetId: asset.id, sha256, rendererVersion: REPORT_PDF_RENDERER_VERSION } satisfies Prisma.InputJsonObject } });
      return { id: asset.id, originalName: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes };
  }); } catch (error) {
    await cleanupStoredReport(resolvedStorage, key);
    throw error;
  }
}

export async function getPublishedReportAssetForDownload(reportId: string, groupId: string, actor: ReportAssetActor) {
  const permission = await backofficePermissionForGroup(actor, groupId);
  if (permission === "NONE") throw new ReportAssetError("ReportingGroup VIEW permission is required.", 403);
  const report = await prisma.quarterlyReport.findFirst({ where: { id: reportId, reportingGroupId: groupId, status: "PUBLISHED" }, select: { publishedAsset: { select: { storageKey: true, originalName: true, mimeType: true, sizeBytes: true, deletedAt: true } } } });
  if (!report?.publishedAsset || report.publishedAsset.deletedAt) throw new ReportAssetError("Published report asset was not found.", 404);
  return report.publishedAsset;
}
