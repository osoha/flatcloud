import type { DocumentCategory } from "@prisma/client";
import type { FileStorage } from "./types";
import { GoogleDriveFileStorage } from "./google-drive";
import { reconcilePropertyDriveStructure } from "./property-drive-reconciliation";
import { DOCUMENT_CATEGORY_FOLDER } from "./drive-structure";

export { DOCUMENT_CATEGORY_FOLDER, PROPERTY_FOLDER_TREE, propertyDriveFolderName } from "./drive-structure";

export type StoragePlacement = { folderId?: string; displayName: string; variantFolderId?: string };

function envFolder(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Google Drive storage.`);
  return value;
}

export async function validateCanonicalDriveFolders(storage: GoogleDriveFileStorage) {
  const configured = ["GOOGLE_DRIVE_ROOT_FOLDER_ID", "GOOGLE_DRIVE_PROPERTIES_FOLDER_ID", "GOOGLE_DRIVE_REPORTS_FOLDER_ID", "GOOGLE_DRIVE_TEMPLATES_FOLDER_ID", "GOOGLE_DRIVE_ARCHIVE_FOLDER_ID"];
  const results = await Promise.all(configured.map(async name => ({ name, valid: await storage.validateFolder(envFolder(name)) })));
  const invalid = results.find(result => !result.valid);
  if (invalid) throw new Error(`${invalid.name} is not an accessible Google Drive folder.`);
  return true;
}

export async function provisionPropertyDriveFolder(propertyId: string, storage: GoogleDriveFileStorage) {
  const result = await reconcilePropertyDriveStructure(propertyId, { storage, reconcileDocuments: false });
  return { propertyFolderId: result.propertyFolderId, folders: result.folders };
}

async function variantsFolder(storage: GoogleDriveFileStorage) {
  const internal = await storage.ensureFolder("99_Interní", envFolder("GOOGLE_DRIVE_ROOT_FOLDER_ID"));
  return storage.ensureFolder("Náhledy", internal);
}

export async function documentStoragePlacement(storage: FileStorage, propertyId: string, category: DocumentCategory, originalName: string): Promise<StoragePlacement> {
  if (!(storage instanceof GoogleDriveFileStorage)) return { displayName: originalName };
  await validateCanonicalDriveFolders(storage);
  const provisioned = await provisionPropertyDriveFolder(propertyId, storage);
  return { folderId: provisioned.folders[DOCUMENT_CATEGORY_FOLDER[category]], displayName: originalName, variantFolderId: await variantsFolder(storage) };
}

export async function templateStoragePlacement(storage: FileStorage, version: number, role: string, originalName: string): Promise<StoragePlacement> {
  if (!(storage instanceof GoogleDriveFileStorage)) return { displayName: originalName };
  await validateCanonicalDriveFolders(storage);
  const quarterly = await storage.ensureFolder("Kvartální reporty", envFolder("GOOGLE_DRIVE_TEMPLATES_FOLDER_ID"));
  const template = await storage.ensureFolder("FLATCLOUD_QUARTERLY_2026", quarterly);
  return { folderId: await storage.ensureFolder(`v${version}`, template), displayName: role.toLowerCase() + (/png$/i.test(originalName) ? ".png" : ".jpg"), variantFolderId: await variantsFolder(storage) };
}

export async function reportStoragePlacement(storage: FileStorage, year: number, quarter: number, displayName: string): Promise<StoragePlacement> {
  if (!(storage instanceof GoogleDriveFileStorage)) return { displayName };
  await validateCanonicalDriveFolders(storage);
  const legacy = await storage.ensureFolder("Legacy", envFolder("GOOGLE_DRIVE_REPORTS_FOLDER_ID"));
  const yearFolder = await storage.ensureFolder(String(year), legacy);
  return { folderId: await storage.ensureFolder(`Q${quarter}`, yearFolder), displayName };
}
