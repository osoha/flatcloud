import type { DocumentCategory, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { createFileStorage } from "./index";
import { GoogleDriveFileStorage, GOOGLE_DRIVE_FOLDER_MIME } from "./google-drive";
import { DOCUMENT_CATEGORY_FOLDER, PROPERTY_FOLDER_TREE, propertyDriveFolderName } from "./drive-structure";

export type PropertyRecord = {
  id: string;
  propertyCode: string;
  name: string;
  active: boolean;
  googleDriveFolderId: string | null;
};

export type DocumentAssetRecord = {
  id: string;
  storageKey: string;
  previewStorageKey: string | null;
  thumbnailStorageKey: string | null;
  documents: Array<{ propertyId: string; category: DocumentCategory }>;
};

export type PropertyDriveFolders = Record<keyof typeof PROPERTY_FOLDER_TREE, string>;

export type PropertyDriveReconciliationResult = {
  propertyId: string;
  propertyCode: string;
  propertyFolderId: string;
  expectedName: string;
  previousName?: string;
  expectedParent: string;
  previousParent?: string;
  renamed: boolean;
  moved: boolean;
  foldersCreated: number;
  documentsMoved: number;
  skipped: boolean;
  warnings: string[];
  folders: PropertyDriveFolders;
};

export type PortfolioDriveReconciliationResult = {
  properties: number;
  renamed: number;
  moved: number;
  foldersCreated: number;
  documentsMoved: number;
  unchanged: number;
  errors: number;
  warnings: number;
  failures: Array<{ propertyId: string; error: string }>;
};

export type ReconciliationStore = {
  getProperty(propertyId: string): Promise<PropertyRecord | null>;
  claimPropertyFolder(propertyId: string, folderId: string): Promise<string>;
  listPropertyIds(): Promise<string[]>;
  listDocumentAssets(propertyId: string): Promise<DocumentAssetRecord[]>;
  audit(input: { userId: string | null; propertyId?: string; action: string; entityType: string; entityId?: string; details: Prisma.InputJsonObject }): Promise<void>;
};

type DriveRoots = { properties: string; archive: string };
type ReconciliationOptions = {
  storage?: GoogleDriveFileStorage;
  store?: ReconciliationStore;
  roots?: DriveRoots;
  actorUserId?: string | null;
  reconcileDocuments?: boolean;
};

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Google Drive storage.`);
  return value;
}

function configuredRoots(): DriveRoots {
  return {
    properties: requiredEnvironment("GOOGLE_DRIVE_PROPERTIES_FOLDER_ID"),
    archive: requiredEnvironment("GOOGLE_DRIVE_ARCHIVE_FOLDER_ID"),
  };
}

function googleDriveStorage() {
  const storage = createFileStorage();
  if (!(storage instanceof GoogleDriveFileStorage)) throw new Error("Google Drive není nastaven jako aktivní úložiště.");
  return storage;
}

async function ensureStandardPropertyFolders(storage: GoogleDriveFileStorage, propertyFolderId: string) {
  let created = 0;
  const ensure = async (name: string, parentId: string) => {
    const result = await storage.ensureFolderWithResult(name, parentId);
    if (result.created) created += 1;
    return result.id;
  };
  const documents = await ensure(PROPERTY_FOLDER_TREE.documents, propertyFolderId);
  const folders = {
    documents,
    contracts: await ensure(PROPERTY_FOLDER_TREE.contracts, documents),
    protocols: await ensure(PROPERTY_FOLDER_TREE.protocols, documents),
    technical: await ensure(PROPERTY_FOLDER_TREE.technical, documents),
    invoices: await ensure(PROPERTY_FOLDER_TREE.invoices, documents),
    energy: await ensure(PROPERTY_FOLDER_TREE.energy, documents),
    legal: await ensure(PROPERTY_FOLDER_TREE.legal, documents),
    other: await ensure(PROPERTY_FOLDER_TREE.other, documents),
    photos: await ensure(PROPERTY_FOLDER_TREE.photos, propertyFolderId),
    reports: await ensure(PROPERTY_FOLDER_TREE.reports, propertyFolderId),
    archive: await ensure(PROPERTY_FOLDER_TREE.archive, propertyFolderId),
  } satisfies PropertyDriveFolders;
  return { folders, created };
}

async function provisionUnlinkedPropertyFolder(property: PropertyRecord, expectedName: string, expectedParent: string, roots: DriveRoots, storage: GoogleDriveFileStorage, store: ReconciliationStore) {
  const prefix = `P${property.propertyCode}_`;
  const [activeMatches, archiveMatches] = await Promise.all([
    storage.listFoldersByPrefix(prefix, roots.properties),
    storage.listFoldersByPrefix(prefix, roots.archive),
  ]);
  if (activeMatches.length || archiveMatches.length) throw new Error(`Drive již obsahuje nepřiřazenou složku s prefixem ${prefix}; vyžaduje ruční kontrolu.`);
  const created = await storage.createFolder(expectedName, expectedParent);
  try {
    const authoritative = await store.claimPropertyFolder(property.id, created);
    if (authoritative !== created) await storage.deleteObject(created).catch(() => undefined);
    return { propertyFolderId: authoritative, created: authoritative === created };
  } catch (error) {
    await storage.deleteObject(created).catch(() => undefined);
    throw error;
  }
}

function documentDestination(asset: DocumentAssetRecord, propertyId: string) {
  const destinations = new Set(asset.documents.map(document => `${document.propertyId}:${DOCUMENT_CATEGORY_FOLDER[document.category]}`));
  if (destinations.size !== 1) return null;
  const [destination] = destinations;
  const [authoritativePropertyId, folderKey] = destination.split(":") as [string, keyof typeof PROPERTY_FOLDER_TREE];
  return authoritativePropertyId === propertyId ? folderKey : null;
}

async function reconcileDocumentPlacements(propertyId: string, folders: PropertyDriveFolders, storage: GoogleDriveFileStorage, store: ReconciliationStore, warnings: string[]) {
  const assets = await store.listDocumentAssets(propertyId);
  let moved = 0;
  for (const asset of assets) {
    const folderKey = documentDestination(asset, propertyId);
    if (!folderKey) {
      warnings.push(`Soubor ${asset.id} je sdílen mezi konfliktními dokumentovými kontexty a nebyl přesunut.`);
      continue;
    }
    try {
      const file = await storage.getFile(asset.storageKey);
      if (!file?.id || file.trashed || file.mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
        warnings.push(`Originál dokumentu ${asset.id} na Google Drive nebyl nalezen jako platný soubor.`);
        continue;
      }
      const expectedParent = folders[folderKey];
      if (file.parents?.length === 1 && file.parents[0] === expectedParent) continue;
      await storage.moveFile(asset.storageKey, expectedParent, file.parents);
      moved += 1;
    } catch (error) {
      warnings.push(`Originál dokumentu ${asset.id} se nepodařilo přesunout (${error instanceof Error ? error.name : "UnknownError"}).`);
    }
  }
  return moved;
}

function auditDetails(result: PropertyDriveReconciliationResult): Prisma.InputJsonObject {
  return {
    propertyCode: result.propertyCode,
    expectedName: result.expectedName,
    ...(result.previousName ? { previousName: result.previousName } : {}),
    renamed: result.renamed,
    moved: result.moved,
    ...(result.previousParent ? { previousParent: result.previousParent } : {}),
    expectedParent: result.expectedParent,
    foldersCreated: result.foldersCreated,
    documentsMoved: result.documentsMoved,
    warnings: result.warnings,
  };
}

export async function reconcilePropertyDriveStructure(propertyId: string, options: ReconciliationOptions = {}): Promise<PropertyDriveReconciliationResult> {
  const storage = options.storage || googleDriveStorage(), store = options.store || prismaReconciliationStore, roots = options.roots || configuredRoots();
  const property = await store.getProperty(propertyId);
  if (!property) throw new Error("Property was not found.");
  const expectedName = propertyDriveFolderName(property.propertyCode, property.name), expectedParent = property.active ? roots.properties : roots.archive;
  let propertyFolderId = property.googleDriveFolderId, rootCreated = false;
  if (!propertyFolderId) {
    const provisioned = await provisionUnlinkedPropertyFolder(property, expectedName, expectedParent, roots, storage, store);
    propertyFolderId = provisioned.propertyFolderId;
    rootCreated = provisioned.created;
  }
  let file = await storage.getFile(propertyFolderId);
  if (!file?.id || file.trashed || file.mimeType !== GOOGLE_DRIVE_FOLDER_MIME) throw new Error("Přiřazená Google Drive složka nemovitosti neexistuje nebo není složkou.");
  const previousName = file.name, previousParents = file.parents || [], previousParent = previousParents.join(",") || undefined;
  let renamed = false, moved = false;
  if (file.name !== expectedName) {
    file = await storage.renameFile(propertyFolderId, expectedName);
    renamed = true;
  }
  const currentParents = file.parents || previousParents;
  if (currentParents.length !== 1 || currentParents[0] !== expectedParent) {
    file = await storage.moveFile(propertyFolderId, expectedParent, currentParents);
    moved = true;
  }
  if (file.id && file.id !== propertyFolderId) throw new Error("Google Drive změnil autoritativní ID složky.");
  const standard = await ensureStandardPropertyFolders(storage, propertyFolderId), warnings: string[] = [];
  const documentsMoved = options.reconcileDocuments === false ? 0 : await reconcileDocumentPlacements(property.id, standard.folders, storage, store, warnings);
  const foldersCreated = standard.created + (rootCreated ? 1 : 0);
  const result: PropertyDriveReconciliationResult = {
    propertyId: property.id,
    propertyCode: property.propertyCode,
    propertyFolderId,
    expectedName,
    ...(previousName ? { previousName } : {}),
    expectedParent,
    ...(previousParent ? { previousParent } : {}),
    renamed,
    moved,
    foldersCreated,
    documentsMoved,
    skipped: !renamed && !moved && foldersCreated === 0 && documentsMoved === 0,
    warnings,
    folders: standard.folders,
  };
  if (options.actorUserId !== undefined && (renamed || moved || foldersCreated || documentsMoved || warnings.length)) await store.audit({ userId: options.actorUserId, propertyId: property.id, action: "PROPERTY_DRIVE_FOLDER_RECONCILED", entityType: "Property", entityId: property.id, details: auditDetails(result) });
  return result;
}

export async function reconcileAllPropertyDriveStructures(options: ReconciliationOptions = {}): Promise<PortfolioDriveReconciliationResult> {
  const storage = options.storage || googleDriveStorage(), store = options.store || prismaReconciliationStore, roots = options.roots || configuredRoots(), propertyIds = await store.listPropertyIds();
  const summary: PortfolioDriveReconciliationResult = { properties: propertyIds.length, renamed: 0, moved: 0, foldersCreated: 0, documentsMoved: 0, unchanged: 0, errors: 0, warnings: 0, failures: [] };
  for (const propertyId of propertyIds) {
    try {
      const result = await reconcilePropertyDriveStructure(propertyId, { storage, store, roots, actorUserId: options.actorUserId, reconcileDocuments: options.reconcileDocuments });
      summary.renamed += Number(result.renamed);
      summary.moved += Number(result.moved);
      summary.foldersCreated += result.foldersCreated;
      summary.documentsMoved += result.documentsMoved;
      summary.warnings += result.warnings.length;
      summary.unchanged += Number(result.skipped && result.warnings.length === 0);
    } catch (error) {
      summary.errors += 1;
      summary.failures.push({ propertyId, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  await store.audit({ userId: options.actorUserId ?? null, action: "GDRIVE_STRUCTURE_RECONCILIATION_RUN", entityType: "GoogleDrive", details: { properties: summary.properties, renamed: summary.renamed, moved: summary.moved, foldersCreated: summary.foldersCreated, documentsMoved: summary.documentsMoved, unchanged: summary.unchanged, errors: summary.errors, warnings: summary.warnings, failedPropertyIds: summary.failures.map(failure => failure.propertyId) } });
  return summary;
}

const prismaReconciliationStore: ReconciliationStore = {
  getProperty: propertyId => prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, propertyCode: true, name: true, active: true, googleDriveFolderId: true } }),
  async claimPropertyFolder(propertyId, folderId) {
    const claimed = await prisma.property.updateMany({ where: { id: propertyId, googleDriveFolderId: null }, data: { googleDriveFolderId: folderId } });
    if (claimed.count) return folderId;
    const winner = await prisma.property.findUnique({ where: { id: propertyId }, select: { googleDriveFolderId: true } });
    if (!winner?.googleDriveFolderId) throw new Error("Property Drive folder provisioning failed.");
    return winner.googleDriveFolderId;
  },
  async listPropertyIds() {
    return (await prisma.property.findMany({ select: { id: true }, orderBy: [{ propertyCode: "asc" }, { id: "asc" }] })).map(property => property.id);
  },
  async listDocumentAssets(propertyId) {
    const documents = await prisma.document.findMany({ where: { propertyId, deletedAt: null }, select: { fileAsset: { select: { id: true, storageKey: true, previewStorageKey: true, thumbnailStorageKey: true, documents: { select: { propertyId: true, category: true } } } } } });
    return Array.from(new Map(documents.map(document => [document.fileAsset.id, document.fileAsset])).values());
  },
  audit: input => prisma.auditLog.create({ data: input }).then(() => undefined),
};
