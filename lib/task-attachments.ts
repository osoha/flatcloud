import type { Prisma } from "@prisma/client";
import type { PreparedDocumentFile } from "./documents/upload";
import { createFileStorage } from "./storage";
import type { FileStorage } from "./storage/types";
import { createImageVariants } from "./documents/image-processing";
import { randomStorageKey, validateFile } from "./documents/file-validation";
import { taskAttachmentStoragePlacement } from "./storage/locations";

type Actor = { id: string };
type StoredFile = PreparedDocumentFile & { metadata: ReturnType<typeof validateFile>; storageKey: string; previewStorageKey?: string; thumbnailStorageKey?: string };
export type StoredTaskAttachments = { actor: Actor; files: StoredFile[]; storage: FileStorage; storedKeys: string[] };

export async function storeTaskAttachments(actor: Actor, files: PreparedDocumentFile[], storage: FileStorage = createFileStorage()): Promise<StoredTaskAttachments> {
  const storedKeys: string[] = [], storedFiles: StoredFile[] = [];
  try {
    for (const file of files) {
      const requestedKey = randomStorageKey(), metadata = validateFile(file), placement = await taskAttachmentStoragePlacement(storage, file.originalName);
      const original = await storage.putObject({ key: requestedKey, body: file.bytes, contentType: file.mimeType, displayName: placement.displayName, folderId: placement.folderId });
      storedKeys.push(original.key);
      let previewStorageKey: string | undefined, thumbnailStorageKey: string | undefined;
      if (file.mimeType.startsWith("image/")) {
        const variants = await createImageVariants(file.bytes);
        const preview = await storage.putObject({ key: `${requestedKey}.preview.webp`, body: variants.preview, contentType: "image/webp", displayName: `${file.originalName} – náhled.webp`, folderId: placement.variantFolderId });
        const thumbnail = await storage.putObject({ key: `${requestedKey}.thumbnail.webp`, body: variants.thumbnail, contentType: "image/webp", displayName: `${file.originalName} – miniatura.webp`, folderId: placement.variantFolderId });
        previewStorageKey = preview.key; thumbnailStorageKey = thumbnail.key;
        storedKeys.push(preview.key, thumbnail.key);
      }
      storedFiles.push({ ...file, metadata, storageKey: original.key, previewStorageKey, thumbnailStorageKey });
    }
    return { actor, files: storedFiles, storage, storedKeys };
  } catch (error) {
    await Promise.allSettled(storedKeys.map(key => storage.deleteObject(key)));
    throw error;
  }
}

export async function createTaskAttachmentsInTransaction(tx: Prisma.TransactionClient, batch: StoredTaskAttachments, taskId: string, taskEntryId?: string) {
  const created = [];
  for (const file of batch.files) {
    const asset = await tx.fileAsset.create({ data: { storageKey: file.storageKey, previewStorageKey: file.previewStorageKey, thumbnailStorageKey: file.thumbnailStorageKey, uploadedById: batch.actor.id, ...file.metadata } });
    created.push(await tx.taskAttachment.create({ data: { taskId, taskEntryId, fileAssetId: asset.id, uploadedById: batch.actor.id } }));
  }
  return created;
}

export async function cleanupTaskAttachments(batch: StoredTaskAttachments) {
  await Promise.allSettled(batch.storedKeys.map(key => batch.storage.deleteObject(key)));
}
