import { prisma } from "../db";
import { SandboxGoogleDriveFileStorage } from "./sandbox-google-drive";

export async function auditSandboxDriveReferences(storage: SandboxGoogleDriveFileStorage) {
  const [properties, assets] = await Promise.all([
    prisma.property.findMany({ where: { googleDriveFolderId: { not: null } }, select: { googleDriveFolderId: true } }),
    prisma.fileAsset.findMany({ select: { storageKey: true, previewStorageKey: true, thumbnailStorageKey: true } }),
  ]);
  for (const property of properties) await storage.validateFolder(property.googleDriveFolderId!);
  const keys = new Set(assets.flatMap(asset => [asset.storageKey, asset.previewStorageKey, asset.thumbnailStorageKey]).filter((key): key is string => Boolean(key)));
  for (const key of keys) await storage.getFile(key);
  return { propertyFolders: properties.length, assets: assets.length, fileKeys: keys.size };
}

export async function prepareSandboxDriveFolders(storage: SandboxGoogleDriveFileStorage, root: string) {
  await storage.validateFolder(root);
  const audit = await auditSandboxDriveReferences(storage);
  const names = {
    GOOGLE_DRIVE_PROPERTIES_FOLDER_ID: "01_Nemovitosti",
    GOOGLE_DRIVE_REPORTS_FOLDER_ID: "02_Reporty",
    GOOGLE_DRIVE_TEMPLATES_FOLDER_ID: "03_Šablony",
    GOOGLE_DRIVE_ARCHIVE_FOLDER_ID: "04_Archiv",
  };
  const folders: Record<string, string> = {};
  for (const [key, name] of Object.entries(names)) folders[key] = await storage.ensureFolder(name, root);
  return { audit, folders };
}
