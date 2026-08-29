import type { DocumentCategory, DocumentPhotoStage, Prisma } from "@prisma/client";
import type { DocumentContext, AuthoritativeDocumentScope } from "./service";
import { requireDocumentCreateAccess } from "./service";
import type { PreparedDocumentFile } from "./upload";
import { createFileStorage } from "../storage";
import type { FileStorage } from "../storage/types";
import { createImageVariants } from "./image-processing";
import { randomStorageKey, validateFile } from "./file-validation";

type Actor = { id: string; role: string; allProperties?: boolean };
export type PreparedDocumentInput = DocumentContext & PreparedDocumentFile & { category: DocumentCategory; photoStage?: DocumentPhotoStage; title: string; description?: string; documentDate?: Date };
export type PreparedDocumentBatch = { actor: Actor; documents: PreparedDocumentInput[]; scopes: AuthoritativeDocumentScope[] };
type StoredDocument = PreparedDocumentInput & { metadata: ReturnType<typeof validateFile>; storageKey: string; previewStorageKey?: string; thumbnailStorageKey?: string };
export type StoredDocumentBatch = { actor: Actor; documents: StoredDocument[]; storage: FileStorage; storedKeys: string[] };

export async function prepareDocumentBatch(actor: Actor, documents: PreparedDocumentInput[], scopes: AuthoritativeDocumentScope[]): Promise<PreparedDocumentBatch> {
  if (documents.length !== scopes.length) throw new Error("Document batch scope mismatch.");
  for (let index = 0; index < documents.length; index++) {
    const document = documents[index], scope = scopes[index];
    validateFile(document);
    if (document.propertyId !== scope.propertyId || (scope.mode === "UNIT" && document.unitId && document.unitId !== scope.unitId)) throw new Error("Document batch context does not match its authoritative scope.");
  }
  for (const scope of uniqueScopes(scopes)) await requireDocumentCreateAccess(actor, scope);
  return { actor, documents, scopes };
}

export async function storePreparedDocumentBatch(batch: PreparedDocumentBatch, storage: FileStorage = createFileStorage()): Promise<StoredDocumentBatch> {
  const storedKeys: string[] = [], documents: StoredDocument[] = [];
  try {
    for (const document of batch.documents) {
      const storageKey = randomStorageKey(), metadata = validateFile(document);
      await storage.putObject({ key: storageKey, body: document.bytes, contentType: document.mimeType }); storedKeys.push(storageKey);
      let previewStorageKey: string | undefined, thumbnailStorageKey: string | undefined;
      if (document.mimeType.startsWith("image/")) {
        const variants = await createImageVariants(document.bytes);
        previewStorageKey = `${storageKey}.preview.webp`; thumbnailStorageKey = `${storageKey}.thumbnail.webp`;
        await storage.putObject({ key: previewStorageKey, body: variants.preview, contentType: "image/webp" }); storedKeys.push(previewStorageKey);
        await storage.putObject({ key: thumbnailStorageKey, body: variants.thumbnail, contentType: "image/webp" }); storedKeys.push(thumbnailStorageKey);
      }
      documents.push({ ...document, metadata, storageKey, previewStorageKey, thumbnailStorageKey });
    }
    return { actor: batch.actor, documents, storage, storedKeys };
  } catch (error) { await Promise.allSettled(storedKeys.map((key) => storage.deleteObject(key))); throw error; }
}

export async function createStoredDocumentsInTransaction(tx: Prisma.TransactionClient, batch: StoredDocumentBatch) {
  const created = [];
  for (const input of batch.documents) {
    const asset = await tx.fileAsset.create({ data: { storageKey: input.storageKey, previewStorageKey: input.previewStorageKey, thumbnailStorageKey: input.thumbnailStorageKey, uploadedById: batch.actor.id, ...input.metadata } });
    const document = await tx.document.create({ data: { propertyId: input.propertyId, fileAssetId: asset.id, category: input.category, photoStage: input.photoStage, title: input.title, description: input.description, documentDate: input.documentDate, unitId: input.unitId, leaseId: input.leaseId, taskId: input.taskId, taskEntryId: input.taskEntryId, complianceRecordId: input.complianceRecordId, createdById: batch.actor.id } });
    await tx.auditLog.create({ data: { userId: batch.actor.id, propertyId: input.propertyId, action: "DOCUMENT_UPLOADED", entityType: "Document", entityId: document.id, details: { documentId: document.id, fileAssetId: asset.id, category: input.category, originalName: input.metadata.originalName, ...(input.unitId ? { unitId: input.unitId } : {}), ...(input.leaseId ? { leaseId: input.leaseId } : {}), ...(input.taskId ? { taskId: input.taskId } : {}), ...(input.taskEntryId ? { taskEntryId: input.taskEntryId } : {}), ...(input.complianceRecordId ? { complianceRecordId: input.complianceRecordId } : {}) } } });
    created.push(document);
  }
  return created;
}

export async function cleanupStoredDocumentBatch(batch: StoredDocumentBatch) { await Promise.allSettled(batch.storedKeys.map((key) => batch.storage.deleteObject(key))); }
function uniqueScopes(scopes: AuthoritativeDocumentScope[]) { const seen = new Set<string>(); return scopes.filter((scope) => { const key = scope.mode === "UNIT" ? `${scope.propertyId}:${scope.unitId}` : scope.propertyId; if (seen.has(key)) return false; seen.add(key); return true; }); }
