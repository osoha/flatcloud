import { DocumentCategory, DocumentPhotoStage, Prisma, QuarterlyReportMediaRole } from "@prisma/client";
import { prisma } from "../db";
import { cleanupStoredDocumentBatch, createStoredDocumentsInTransaction, storePreparedDocumentBatch } from "../documents/batch-service";
import type { PreparedDocumentFile } from "../documents/upload";
import { serializableTransaction } from "../serializable";
import { createFileStorage } from "../storage";
import type { FileStorage } from "../storage/types";
import { backofficePermissionForGroup } from "./backoffice-access";

export type QuarterlyReportMediaActor = { id: string; role: string };
type Tx = Prisma.TransactionClient;

async function requireMediaEdit(tx: Tx, actor: QuarterlyReportMediaActor, reportingGroupId: string) {
  const [user, membership] = await Promise.all([
    tx.user.findUnique({ where: { id: actor.id }, select: { role: true, active: true } }),
    tx.reportingGroupMember.findUnique({ where: { reportingGroupId_userId: { reportingGroupId, userId: actor.id } }, select: { permission: true } }),
  ]);
  const permission = user?.active ? user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : membership?.permission || "NONE" : "NONE";
  if (!["EDIT", "ADMIN", "SUPER_ADMIN"].includes(permission)) throw new Error("Reporting EDIT permission is required.");
}

async function editablePropertyReport(tx: Tx, input: { reportId: string; reportingGroupId: string; propertyId: string }, actor: QuarterlyReportMediaActor) {
  const propertyReport = await tx.quarterlyPropertyReport.findFirst({
    where: { quarterlyReportId: input.reportId, propertyId: input.propertyId, quarterlyReport: { reportingGroupId: input.reportingGroupId } },
    select: { id: true, propertyId: true, quarterlyReport: { select: { id: true, reportingGroupId: true, year: true, quarter: true, revision: true, status: true } } },
  });
  if (!propertyReport) throw new Error("Property report was not found.");
  await requireMediaEdit(tx, actor, propertyReport.quarterlyReport.reportingGroupId);
  if (propertyReport.quarterlyReport.status !== "DRAFT") throw new Error("Report media can only change in DRAFT.");
  return propertyReport;
}

function captionValue(value: string | null | undefined) {
  const caption = value?.trim() || null;
  if (caption && caption.length > 500) throw new Error("Photo caption is too long.");
  return caption;
}

function auditDetails(propertyReport: { id: string; propertyId: string; quarterlyReport: { id: string; reportingGroupId: string; year: number; quarter: number; revision: number } }, media: { fileAssetId: string; sourceDocumentId: string | null; role: QuarterlyReportMediaRole }) {
  return { quarterlyReportId: propertyReport.quarterlyReport.id, quarterlyPropertyReportId: propertyReport.id, reportingGroupId: propertyReport.quarterlyReport.reportingGroupId, propertyId: propertyReport.propertyId, year: propertyReport.quarterlyReport.year, quarter: propertyReport.quarterlyReport.quarter, revision: propertyReport.quarterlyReport.revision, fileAssetId: media.fileAssetId, ...(media.sourceDocumentId ? { sourceDocumentId: media.sourceDocumentId } : {}), role: media.role } satisfies Prisma.InputJsonObject;
}

export async function selectQuarterlyPropertyPrimaryPhoto(input: { reportId: string; reportingGroupId: string; propertyId: string; sourceDocumentId: string; caption?: string | null }, actor: QuarterlyReportMediaActor) {
  return serializableTransaction(async (tx) => {
    const propertyReport = await editablePropertyReport(tx, input, actor);
    const document = await tx.document.findFirst({
      where: { id: input.sourceDocumentId, propertyId: propertyReport.propertyId, category: "PHOTO", deletedAt: null, fileAsset: { deletedAt: null, mimeType: { startsWith: "image/" } } },
      select: { id: true, fileAssetId: true },
    });
    if (!document) throw new Error("Selected property photo is not available.");
    const existing = await tx.quarterlyPropertyReportMedia.findFirst({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } });
    const data = { role: QuarterlyReportMediaRole.PRIMARY, sortOrder: 0, fileAssetId: document.fileAssetId, sourceDocumentId: document.id, caption: captionValue(input.caption) };
    const media = existing
      ? await tx.quarterlyPropertyReportMedia.update({ where: { id: existing.id }, data })
      : await tx.quarterlyPropertyReportMedia.create({ data: { quarterlyPropertyReportId: propertyReport.id, createdById: actor.id, ...data } });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: propertyReport.propertyId, action: existing ? "REPORT_PROPERTY_MEDIA_UPDATED" : "REPORT_PROPERTY_MEDIA_SELECTED", entityType: "QuarterlyPropertyReportMedia", entityId: media.id, details: auditDetails(propertyReport, media) } });
    return media;
  });
}

export async function uploadQuarterlyPropertyPrimaryPhoto(input: { reportId: string; reportingGroupId: string; propertyId: string; file: PreparedDocumentFile; caption?: string | null }, actor: QuarterlyReportMediaActor, storage: FileStorage = createFileStorage()) {
  if (!input.file.mimeType.startsWith("image/")) throw new Error("Quarterly report photo must be an image.");
  const authorized = await prisma.$transaction((tx) => editablePropertyReport(tx, input, actor));
  const stored = await storePreparedDocumentBatch({
    actor,
    scopes: [{ mode: "PROPERTY", propertyId: authorized.propertyId }],
    documents: [{
      propertyId: authorized.propertyId,
      bytes: input.file.bytes,
      mimeType: input.file.mimeType,
      originalName: input.file.originalName,
      category: DocumentCategory.PHOTO,
      photoStage: DocumentPhotoStage.GENERAL,
      title: "Fotografie pro kvartální report",
    }],
  }, storage);
  try {
    return await serializableTransaction(async (tx) => {
      const propertyReport = await editablePropertyReport(tx, input, actor);
      if (propertyReport.id !== authorized.id) throw new Error("Property report changed during photo upload.");
      const [document] = await createStoredDocumentsInTransaction(tx, stored);
      const existing = await tx.quarterlyPropertyReportMedia.findFirst({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } });
      const data = { role: QuarterlyReportMediaRole.PRIMARY, sortOrder: 0, fileAssetId: document.fileAssetId, sourceDocumentId: document.id, caption: captionValue(input.caption) };
      const media = existing
        ? await tx.quarterlyPropertyReportMedia.update({ where: { id: existing.id }, data })
        : await tx.quarterlyPropertyReportMedia.create({ data: { quarterlyPropertyReportId: propertyReport.id, createdById: actor.id, ...data } });
      await tx.auditLog.create({ data: { userId: actor.id, propertyId: propertyReport.propertyId, action: existing ? "REPORT_PROPERTY_MEDIA_UPDATED" : "REPORT_PROPERTY_MEDIA_SELECTED", entityType: "QuarterlyPropertyReportMedia", entityId: media.id, details: auditDetails(propertyReport, media) } });
      return { document, media };
    });
  } catch (error) {
    await cleanupStoredDocumentBatch(stored);
    throw error;
  }
}

export async function removeQuarterlyPropertyPrimaryPhoto(input: { reportId: string; reportingGroupId: string; propertyId: string }, actor: QuarterlyReportMediaActor) {
  return serializableTransaction(async (tx) => {
    const propertyReport = await editablePropertyReport(tx, input, actor);
    const media = await tx.quarterlyPropertyReportMedia.findFirst({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } });
    if (!media) return null;
    await tx.quarterlyPropertyReportMedia.delete({ where: { id: media.id } });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: propertyReport.propertyId, action: "REPORT_PROPERTY_MEDIA_REMOVED", entityType: "QuarterlyPropertyReportMedia", entityId: media.id, details: auditDetails(propertyReport, media) } });
    return media;
  });
}

export async function updateQuarterlyPropertyPrimaryPhotoCaption(input: { reportId: string; reportingGroupId: string; propertyId: string; caption?: string | null }, actor: QuarterlyReportMediaActor) {
  return serializableTransaction(async (tx) => {
    const propertyReport = await editablePropertyReport(tx, input, actor);
    const existing = await tx.quarterlyPropertyReportMedia.findFirst({ where: { quarterlyPropertyReportId: propertyReport.id, role: "PRIMARY" } });
    if (!existing) throw new Error("Primary report photo was not found.");
    const media = await tx.quarterlyPropertyReportMedia.update({ where: { id: existing.id }, data: { caption: captionValue(input.caption) } });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: propertyReport.propertyId, action: "REPORT_PROPERTY_MEDIA_UPDATED", entityType: "QuarterlyPropertyReportMedia", entityId: media.id, details: auditDetails(propertyReport, media) } });
    return media;
  });
}

async function readablePropertyReport(input: { reportId: string; reportingGroupId: string; propertyId: string }, actor: QuarterlyReportMediaActor) {
  const permission = await backofficePermissionForGroup(actor, input.reportingGroupId);
  if (!["EDIT", "ADMIN", "SUPER_ADMIN"].includes(permission)) throw new Error("Reporting access is required.");
  const propertyReport = await prisma.quarterlyPropertyReport.findFirst({ where: { quarterlyReportId: input.reportId, propertyId: input.propertyId, quarterlyReport: { reportingGroupId: input.reportingGroupId } }, select: { id: true, propertyId: true } });
  if (!propertyReport) throw new Error("Property report was not found.");
  return propertyReport;
}

export async function listQuarterlyPropertyPhotoCandidates(input: { reportId: string; reportingGroupId: string; propertyId: string }, actor: QuarterlyReportMediaActor) {
  const propertyReport = await readablePropertyReport(input, actor);
  return prisma.document.findMany({
    where: { propertyId: propertyReport.propertyId, category: "PHOTO", deletedAt: null, fileAsset: { deletedAt: null, mimeType: { startsWith: "image/" } } },
    select: { id: true, title: true, description: true, photoStage: true, documentDate: true, createdAt: true, fileAsset: { select: { id: true, mimeType: true, sizeBytes: true } } },
    orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  });
}

export async function resolveQuarterlyPropertyCandidateImage(input: { reportId: string; reportingGroupId: string; propertyId: string; documentId: string }, actor: QuarterlyReportMediaActor) {
  const propertyReport = await readablePropertyReport(input, actor);
  const document = await prisma.document.findFirst({ where: { id: input.documentId, propertyId: propertyReport.propertyId, category: "PHOTO", deletedAt: null, fileAsset: { deletedAt: null, mimeType: { startsWith: "image/" } } }, select: { fileAsset: true } });
  if (!document) throw new Error("Property photo was not found.");
  return document.fileAsset;
}

export async function resolveQuarterlyPropertyReportMediaImage(input: { reportId: string; reportingGroupId: string; propertyId: string; mediaId: string }, actor: QuarterlyReportMediaActor) {
  const propertyReport = await readablePropertyReport(input, actor);
  const media = await prisma.quarterlyPropertyReportMedia.findFirst({ where: { id: input.mediaId, quarterlyPropertyReportId: propertyReport.id }, select: { fileAsset: true } });
  if (!media || !media.fileAsset.mimeType.startsWith("image/")) throw new Error("Report photo was not found.");
  return media.fileAsset;
}
