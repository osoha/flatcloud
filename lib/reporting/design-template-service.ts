import { Prisma, ReportDesignBackgroundMode, ReportDesignPageRole } from "@prisma/client";
import { prisma } from "../db";
import { createImageVariants } from "../documents/image-processing";
import { randomStorageKey, validateFile } from "../documents/file-validation";
import type { PreparedDocumentFile } from "../documents/upload";
import { serializableTransaction } from "../serializable";
import { createFileStorage } from "../storage";
import type { FileStorage } from "../storage/types";
import { REPORT_DESIGN_PAGE_ROLES, reportDesignTemplateConfigSchema } from "./design-template-schema";
import { templateStoragePlacement } from "../storage/locations";

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;

async function requireSuperAdmin(tx: Tx, actor: Actor) {
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { active: true, role: true } });
  if (!user?.active || user.role !== "SUPER_ADMIN") throw new Error("Global report template management requires SUPER_ADMIN.");
}

async function editableVersion(tx: Tx, versionId: string, actor: Actor) {
  await requireSuperAdmin(tx, actor);
  const version = await tx.reportDesignTemplateVersion.findUnique({ where: { id: versionId }, include: { template: true, pages: true } });
  if (!version) throw new Error("Report design template version was not found.");
  if (version.status !== "DRAFT") throw new Error("Only DRAFT template versions are editable.");
  reportDesignTemplateConfigSchema.parse(version.config);
  return version;
}

function safeDetails(version: { id: string; templateId: string; version: number }, extra: Prisma.InputJsonObject = {}) {
  return { templateId: version.templateId, templateVersionId: version.id, version: version.version, ...extra } satisfies Prisma.InputJsonObject;
}

async function audit(tx: Tx, actorId: string, action: string, version: { id: string; templateId: string; version: number }, extra?: Prisma.InputJsonObject) {
  await tx.auditLog.create({ data: { userId: actorId, action, entityType: "ReportDesignTemplateVersion", entityId: version.id, details: safeDetails(version, extra) } });
}

export async function cloneReportDesignTemplateVersion(versionId: string, actor: Actor) {
  return serializableTransaction(async (tx) => {
    await requireSuperAdmin(tx, actor);
    const source = await tx.reportDesignTemplateVersion.findUnique({ where: { id: versionId }, include: { pages: true } });
    if (!source) throw new Error("Report design template version was not found.");
    if (source.status === "DRAFT") throw new Error("Clone only ACTIVE or RETIRED template versions.");
    const existingDraft = await tx.reportDesignTemplateVersion.findFirst({ where: { templateId: source.templateId, status: "DRAFT" } });
    if (existingDraft) throw new Error("This template already has a DRAFT version.");
    const latest = await tx.reportDesignTemplateVersion.aggregate({ where: { templateId: source.templateId }, _max: { version: true } });
    const version = await tx.reportDesignTemplateVersion.create({ data: { templateId: source.templateId, version: (latest._max.version || 0) + 1, status: "DRAFT", config: reportDesignTemplateConfigSchema.parse(source.config), pages: { create: source.pages.map((page) => ({ role: page.role, backgroundMode: page.backgroundMode, backgroundAssetId: page.backgroundAssetId, config: page.config === null ? Prisma.JsonNull : page.config })) } } });
    await audit(tx, actor.id, "REPORT_DESIGN_TEMPLATE_VERSION_CREATED", version, { sourceTemplateVersionId: source.id });
    return version;
  });
}

export async function activateReportDesignTemplateVersion(versionId: string, actor: Actor) {
  return serializableTransaction(async (tx) => {
    const version = await editableVersion(tx, versionId, actor);
    if (version.pages.length !== REPORT_DESIGN_PAGE_ROLES.length || REPORT_DESIGN_PAGE_ROLES.some((role) => !version.pages.some((page) => page.role === role))) throw new Error("Template version must contain all five page roles.");
    for (const page of version.pages) {
      if (page.backgroundMode === "GENERATED" && page.backgroundAssetId) throw new Error("Generated page backgrounds cannot reference an asset.");
      if (page.backgroundMode === "ASSET") {
        if (!page.backgroundAssetId) throw new Error("Asset page backgrounds require an image asset.");
        const asset = await tx.fileAsset.findFirst({ where: { id: page.backgroundAssetId, deletedAt: null, mimeType: { startsWith: "image/" } }, select: { id: true } });
        if (!asset) throw new Error("Template background image is unavailable.");
      }
    }
    const activatedAt = new Date();
    await tx.reportDesignTemplateVersion.updateMany({ where: { templateId: version.templateId, status: "ACTIVE" }, data: { status: "RETIRED" } });
    const active = await tx.reportDesignTemplateVersion.update({ where: { id: version.id }, data: { status: "ACTIVE", activatedAt } });
    await audit(tx, actor.id, "REPORT_DESIGN_TEMPLATE_VERSION_ACTIVATED", active);
    return active;
  });
}

export async function setGeneratedTemplateBackground(versionId: string, role: ReportDesignPageRole, actor: Actor) {
  return serializableTransaction(async (tx) => {
    const version = await editableVersion(tx, versionId, actor);
    await tx.reportDesignTemplatePage.update({ where: { templateVersionId_role: { templateVersionId: version.id, role } }, data: { backgroundMode: "GENERATED", backgroundAssetId: null } });
    await audit(tx, actor.id, "REPORT_DESIGN_TEMPLATE_BACKGROUND_REMOVED", version, { pageRole: role });
  });
}

export async function applyTemplateBackgroundToContentPages(versionId: string, sourceRole: ReportDesignPageRole, actor: Actor) {
  return serializableTransaction(async (tx) => {
    const version = await editableVersion(tx, versionId, actor);
    const source = version.pages.find((page) => page.role === sourceRole);
    if (!source || source.backgroundMode !== "ASSET" || !source.backgroundAssetId) throw new Error("Select an uploaded background first.");
    await tx.reportDesignTemplatePage.updateMany({ where: { templateVersionId: version.id, role: { in: ["OVERVIEW", "TECHNICAL", "VALUATION", "TRENDS"] } }, data: { backgroundMode: "ASSET", backgroundAssetId: source.backgroundAssetId } });
    await audit(tx, actor.id, "REPORT_DESIGN_TEMPLATE_BACKGROUND_SET", version, { pageRole: sourceRole, fileAssetId: source.backgroundAssetId, appliedToContentPages: true });
  });
}

export async function uploadTemplateBackground(versionId: string, role: ReportDesignPageRole, file: PreparedDocumentFile, actor: Actor, storage: FileStorage = createFileStorage()) {
  if (!["image/png", "image/jpeg"].includes(file.mimeType)) throw new Error("Template background must be PNG or JPEG.");
  const metadata = validateFile(file), key = randomStorageKey(), storedKeys: string[] = [];
  await prisma.$transaction((tx) => editableVersion(tx, versionId, actor));
  try {
    const editable=await prisma.reportDesignTemplateVersion.findUnique({where:{id:versionId},select:{version:true}});if(!editable)throw new Error("Report design template version was not found.");const placement=await templateStoragePlacement(storage,editable.version,role,file.originalName);
    const original=await storage.putObject({ key, body: file.bytes, contentType: file.mimeType,displayName:placement.displayName,folderId:placement.folderId });const storageKey=original.key;storedKeys.push(storageKey);
    const variants = await createImageVariants(file.bytes), previewStorageKey = `${key}.preview.webp`, thumbnailStorageKey = `${key}.thumbnail.webp`;
    const preview=await storage.putObject({ key: previewStorageKey, body: variants.preview, contentType: "image/webp",displayName:`${role.toLowerCase()}-preview.webp`,folderId:placement.variantFolderId });storedKeys.push(preview.key);
    const thumbnail=await storage.putObject({ key: thumbnailStorageKey, body: variants.thumbnail, contentType: "image/webp",displayName:`${role.toLowerCase()}-thumbnail.webp`,folderId:placement.variantFolderId });storedKeys.push(thumbnail.key);
    return await serializableTransaction(async (tx) => {
      const version = await editableVersion(tx, versionId, actor);
      const asset = await tx.fileAsset.create({ data: { ...metadata, storageKey, previewStorageKey:preview.key, thumbnailStorageKey:thumbnail.key, uploadedById: actor.id } });
      await tx.reportDesignTemplatePage.update({ where: { templateVersionId_role: { templateVersionId: version.id, role } }, data: { backgroundMode: ReportDesignBackgroundMode.ASSET, backgroundAssetId: asset.id } });
      await audit(tx, actor.id, "REPORT_DESIGN_TEMPLATE_BACKGROUND_SET", version, { pageRole: role, fileAssetId: asset.id });
      return asset;
    });
  } catch (error) {
    await Promise.allSettled(storedKeys.map((storedKey) => storage.deleteObject(storedKey)));
    throw error;
  }
}

export async function resolveTemplateBackground(versionId: string, role: ReportDesignPageRole, actor: Actor) {
  await prisma.$transaction((tx) => requireSuperAdmin(tx, actor));
  const page = await prisma.reportDesignTemplatePage.findUnique({ where: { templateVersionId_role: { templateVersionId: versionId, role } }, select: { backgroundMode: true, backgroundAsset: true } });
  if (!page || page.backgroundMode !== "ASSET" || !page.backgroundAsset || page.backgroundAsset.deletedAt || !page.backgroundAsset.mimeType.startsWith("image/")) throw new Error("Template background was not found.");
  return page.backgroundAsset;
}
