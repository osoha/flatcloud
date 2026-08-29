import type { DocumentCategory, DocumentPhotoStage, Prisma } from "@prisma/client";
import { hasAllPropertyAccess } from "../auth";
import { prisma } from "../db";
import { createFileStorage } from "../storage";
import type { FileStorage } from "../storage/types";
import { documentEditAccessWhere } from "./access";
import { randomStorageKey, validateFile } from "./file-validation";
import { createImageVariants } from "./image-processing";

type Actor = { id: string; role: string; allProperties?: boolean };
export type DocumentContext = { propertyId: string; unitId?: string; leaseId?: string; taskId?: string; taskEntryId?: string; complianceRecordId?: string };
type ResolvedTask = { id: string; propertyId: string; unitId: string | null; leaseId: string | null; lease: { unitId: string } | null };
export type ResolvedDocumentContext = { unit?: { propertyId: string } | null; lease?: { unitId: string; unit: { propertyId: string } } | null; task?: ResolvedTask | null; entry?: { taskId: string; task: ResolvedTask } | null; record?: { complianceItem: { propertyId: string } } | null };
export type AuthoritativeDocumentScope = { mode: "PROPERTY"; propertyId: string } | { mode: "UNIT"; propertyId: string; unitId: string };

function taskScope(task: ResolvedTask): AuthoritativeDocumentScope { if (task.unitId && task.lease?.unitId && task.unitId !== task.lease.unitId) throw new Error("Document task has inconsistent unit and lease parents."); const unitId = task.unitId || task.lease?.unitId; return unitId ? { mode: "UNIT", propertyId: task.propertyId, unitId } : { mode: "PROPERTY", propertyId: task.propertyId }; }
function sameScope(a: AuthoritativeDocumentScope, b: AuthoritativeDocumentScope) { return a.mode === b.mode && a.propertyId === b.propertyId && (a.mode === "PROPERTY" || (b.mode === "UNIT" && a.unitId === b.unitId)); }

/** Parent priority is task entry, task, compliance record, lease, unit, then bare property. Every supplied parent must resolve to that same scope. */
export function resolveAuthoritativeDocumentScope(context: DocumentContext, resolved: ResolvedDocumentContext): AuthoritativeDocumentScope {
  if ((context.unitId && !resolved.unit) || (context.leaseId && !resolved.lease) || (context.taskId && !resolved.task) || (context.taskEntryId && !resolved.entry) || (context.complianceRecordId && !resolved.record)) throw new Error("Document context entity was not found.");
  const candidates: AuthoritativeDocumentScope[] = [];
  if (context.taskEntryId && resolved.entry) candidates.push(taskScope(resolved.entry.task));
  if (context.taskId && resolved.task) candidates.push(taskScope(resolved.task));
  if (context.complianceRecordId && resolved.record) candidates.push({ mode: "PROPERTY", propertyId: resolved.record.complianceItem.propertyId });
  if (context.leaseId && resolved.lease) candidates.push({ mode: "UNIT", propertyId: resolved.lease.unit.propertyId, unitId: resolved.lease.unitId });
  if (context.unitId && resolved.unit) candidates.push({ mode: "UNIT", propertyId: resolved.unit.propertyId, unitId: context.unitId });
  if (!candidates.length) candidates.push({ mode: "PROPERTY", propertyId: context.propertyId });
  const authoritative = candidates[0];
  if (authoritative.propertyId !== context.propertyId || candidates.some((candidate) => !sameScope(candidate, authoritative))) throw new Error("Document contextual parents do not describe the same authoritative scope.");
  if (context.taskId && resolved.entry && resolved.entry.taskId !== context.taskId) throw new Error("Document task entry does not belong to the selected task.");
  if (context.leaseId) for (const task of [resolved.task, resolved.entry?.task].filter(Boolean) as ResolvedTask[]) if (task.leaseId && task.leaseId !== context.leaseId) throw new Error("Document task does not belong to the selected lease.");
  return authoritative;
}
export function assertDocumentContextConsistency(context: DocumentContext, resolved: ResolvedDocumentContext) { resolveAuthoritativeDocumentScope(context, resolved); return context; }

async function resolveDocumentContext(context: DocumentContext): Promise<ResolvedDocumentContext> {
  const taskSelect = { id: true, propertyId: true, unitId: true, leaseId: true, lease: { select: { unitId: true } } } as const;
  const [unit, lease, task, entry, record] = await Promise.all([
    context.unitId ? prisma.unit.findUnique({ where: { id: context.unitId }, select: { propertyId: true } }) : null,
    context.leaseId ? prisma.lease.findUnique({ where: { id: context.leaseId }, select: { unitId: true, unit: { select: { propertyId: true } } } }) : null,
    context.taskId ? prisma.task.findUnique({ where: { id: context.taskId }, select: taskSelect }) : null,
    context.taskEntryId ? prisma.taskEntry.findUnique({ where: { id: context.taskEntryId }, select: { taskId: true, task: { select: taskSelect } } }) : null,
    context.complianceRecordId ? prisma.complianceRecord.findUnique({ where: { id: context.complianceRecordId }, select: { complianceItem: { select: { propertyId: true } } } }) : null,
  ]);
  return { unit, lease, task, entry, record };
}
export async function validateDocumentContext(context: DocumentContext) { const resolved = await resolveDocumentContext(context); resolveAuthoritativeDocumentScope(context, resolved); return context; }

export function authoritativeDocumentGrantWhere(actorId: string, scope: AuthoritativeDocumentScope): { property: Prisma.UserPropertyWhereInput; unit?: Prisma.UserUnitWhereInput } {
  return scope.mode === "PROPERTY"
    ? { property: { propertyId: scope.propertyId, userId: actorId, permission: { in: ["EDIT", "ADMIN"] } } }
    : { property: { propertyId: scope.propertyId, userId: actorId, permission: { in: ["EDIT", "ADMIN"] } }, unit: { unitId: scope.unitId, userId: actorId, permission: { in: ["EDIT", "ADMIN"] } } };
}
export function canEditAuthoritativeDocumentScope(scope: AuthoritativeDocumentScope, grants: { wholePropertyIds: string[]; unitIds: string[] }, allProperties = false) { return allProperties || grants.wholePropertyIds.includes(scope.propertyId) || (scope.mode === "UNIT" && grants.unitIds.includes(scope.unitId)); }
export async function requireDocumentCreateAccess(actor: Actor, scope: AuthoritativeDocumentScope, client: Prisma.TransactionClient | typeof prisma = prisma) {
  if (hasAllPropertyAccess(actor)) return;
  const grants = authoritativeDocumentGrantWhere(actor.id, scope);
  const [propertyGrant, unitGrant] = await Promise.all([client.userProperty.findFirst({ where: grants.property, select: { propertyId: true } }), scope.mode === "UNIT" ? client.userUnit.findFirst({ where: grants.unit, select: { unitId: true } }) : null]);
  if (canEditAuthoritativeDocumentScope(scope, { wholePropertyIds: propertyGrant ? [propertyGrant.propertyId] : [], unitIds: unitGrant ? [unitGrant.unitId] : [] })) return;
  throw new Error("Document edit access denied.");
}
export async function authorizeDocumentContext(actor: Actor, context: DocumentContext) { const resolved = await resolveDocumentContext(context); const scope = resolveAuthoritativeDocumentScope(context, resolved); await requireDocumentCreateAccess(actor, scope); return scope; }
function auditDetails(input: DocumentContext & { originalName: string }, document: { id: string; fileAssetId: string; category: DocumentCategory }): Prisma.InputJsonObject { return { propertyId: input.propertyId, documentId: document.id, fileAssetId: document.fileAssetId, category: document.category, originalName: input.originalName, ...(input.unitId ? { unitId: input.unitId } : {}), ...(input.leaseId ? { leaseId: input.leaseId } : {}), ...(input.taskId ? { taskId: input.taskId } : {}), ...(input.taskEntryId ? { taskEntryId: input.taskEntryId } : {}), ...(input.complianceRecordId ? { complianceRecordId: input.complianceRecordId } : {}) }; }

export async function createDocumentFromUpload(input: DocumentContext & { actor: Actor; bytes: Uint8Array; mimeType: string; originalName: string; category: DocumentCategory; photoStage?: DocumentPhotoStage; title: string; description?: string; documentDate?: Date }, storage: FileStorage = createFileStorage()) {
  const resolved = await resolveDocumentContext(input), scope = resolveAuthoritativeDocumentScope(input, resolved);
  await requireDocumentCreateAccess(input.actor, scope);
  const metadata = validateFile(input), key = randomStorageKey(), stored: string[] = [];
  try {
    await storage.putObject({ key, body: input.bytes, contentType: input.mimeType }); stored.push(key);
    let previewStorageKey: string | undefined, thumbnailStorageKey: string | undefined;
    if (input.mimeType.startsWith("image/")) { const variants = await createImageVariants(input.bytes); previewStorageKey = `${key}.preview.webp`; thumbnailStorageKey = `${key}.thumbnail.webp`; await storage.putObject({ key: previewStorageKey, body: variants.preview, contentType: "image/webp" }); stored.push(previewStorageKey); await storage.putObject({ key: thumbnailStorageKey, body: variants.thumbnail, contentType: "image/webp" }); stored.push(thumbnailStorageKey); }
    return await prisma.$transaction(async (tx) => {
      await requireDocumentCreateAccess(input.actor, scope, tx);
      const asset = await tx.fileAsset.create({ data: { storageKey: key, previewStorageKey, thumbnailStorageKey, uploadedById: input.actor.id, ...metadata } });
      const document = await tx.document.create({ data: { propertyId: input.propertyId, fileAssetId: asset.id, category: input.category, photoStage: input.photoStage, title: input.title, description: input.description, documentDate: input.documentDate, unitId: input.unitId, leaseId: input.leaseId, taskId: input.taskId, taskEntryId: input.taskEntryId, complianceRecordId: input.complianceRecordId, createdById: input.actor.id } });
      await tx.auditLog.create({ data: { userId: input.actor.id, propertyId: input.propertyId, action: "DOCUMENT_UPLOADED", entityType: "Document", entityId: document.id, details: auditDetails(input, document) } });
      return document;
    });
  } catch (error) { await Promise.allSettled(stored.map((storedKey) => storage.deleteObject(storedKey))); throw error; }
}

export async function softDeleteDocument(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({ where: { id, ...documentEditAccessWhere(actor) }, include: { fileAsset: true } });
    if (!document) throw new Error("Document edit access denied.");
    const deleted = await tx.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId: document.propertyId, action: "DOCUMENT_DELETED", entityType: "Document", entityId: document.id, details: auditDetails({ propertyId: document.propertyId, unitId: document.unitId || undefined, leaseId: document.leaseId || undefined, taskId: document.taskId || undefined, taskEntryId: document.taskEntryId || undefined, complianceRecordId: document.complianceRecordId || undefined, originalName: document.fileAsset.originalName }, document) } });
    return deleted;
  });
}
