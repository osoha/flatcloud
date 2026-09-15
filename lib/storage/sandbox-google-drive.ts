import { GoogleDriveFileStorage, GOOGLE_DRIVE_FOLDER_MIME, type DriveFile } from "./google-drive";
import type { PutObjectInput } from "./types";

type Environment = Record<string, string | undefined>;
const sandboxHost = "flatcloud-ux-sandbox.onrender.com";
export class SandboxDriveScopeError extends Error {
  constructor() { super("Soubor nebo složka není v povoleném sandboxovém úložišti."); this.name = "SandboxDriveScopeError"; }
}
export function requiresSandboxDrive(environment: Environment) {
  let appHost = "";
  try { appHost = new URL(environment.APP_URL || "").hostname; } catch { /* not a URL */ }
  return Boolean(environment.GOOGLE_DRIVE_SANDBOX_ROOT_FOLDER_ID) || environment.RENDER_SERVICE_NAME === "flatcloud-ux-sandbox" || environment.RENDER_EXTERNAL_HOSTNAME === sandboxHost || appHost === sandboxHost;
}
export function createGoogleDriveStorage(environment: Environment = process.env) {
  return requiresSandboxDrive(environment) ? new SandboxGoogleDriveFileStorage(environment) : new GoogleDriveFileStorage(environment);
}

/** Shared OAuth, application-enforced containment. No permanent deletion, even during rollback. */
export class SandboxGoogleDriveFileStorage extends GoogleDriveFileStorage {
  private readonly sandboxRoot: string;
  constructor(environment: Environment = process.env, fetcher: typeof fetch = fetch) {
    const root = environment.GOOGLE_DRIVE_SANDBOX_ROOT_FOLDER_ID?.trim();
    if (!root || root !== environment.GOOGLE_DRIVE_ROOT_FOLDER_ID) throw new SandboxDriveScopeError();
    super(environment, fetcher);
    this.sandboxRoot = root;
  }
  private async contained(key: string, folder = false): Promise<DriveFile> {
    const original = await super.getFile(key);
    if (!original?.id || original.id !== key || original.trashed || original.mimeType === "application/vnd.google-apps.shortcut" || (folder && original.mimeType !== GOOGLE_DRIVE_FOLDER_MIME)) throw new SandboxDriveScopeError();
    let current = original;
    const visited = new Set<string>();
    for (let depth = 0; depth < 64; depth++) {
      if (!current.id || visited.has(current.id) || current.trashed) throw new SandboxDriveScopeError();
      visited.add(current.id);
      if (current.id === this.sandboxRoot) {
        if (current.mimeType !== GOOGLE_DRIVE_FOLDER_MIME) throw new SandboxDriveScopeError();
        return original;
      }
      if (current.parents?.length !== 1) throw new SandboxDriveScopeError();
      const parent = await super.getFile(current.parents[0]);
      if (!parent?.id || parent.id !== current.parents[0] || parent.mimeType !== GOOGLE_DRIVE_FOLDER_MIME) throw new SandboxDriveScopeError();
      current = parent;
    }
    throw new SandboxDriveScopeError();
  }
  override async getFile(key: string) { return this.contained(key); }
  override async getObject(key: string) { await this.contained(key); return super.getObject(key); }
  override async exists(key: string) { await this.contained(key); return true; }
  override async validateFolder(key: string) { await this.contained(key, true); return true; }
  override async putObject(input: PutObjectInput) {
    if (!input.folderId) throw new SandboxDriveScopeError();
    await this.contained(input.folderId, true);
    return super.putObject(input);
  }
  override async createFolder(name: string, parentId: string) { await this.contained(parentId, true); return super.createFolder(name, parentId); }
  override async listFoldersByName(name: string, parentId: string) { await this.contained(parentId, true); return super.listFoldersByName(name, parentId); }
  override async listFoldersByPrefix(prefix: string, parentId: string) { await this.contained(parentId, true); return super.listFoldersByPrefix(prefix, parentId); }
  override async renameFile(key: string, name: string) {
    if (key === this.sandboxRoot) throw new SandboxDriveScopeError();
    await this.contained(key);
    return super.renameFile(key, name);
  }
  override async moveFile(key: string, parentId: string, _currentParents?: string[]) {
    if (key === this.sandboxRoot) throw new SandboxDriveScopeError();
    const file = await this.contained(key);
    await this.contained(parentId, true);
    return super.moveFile(key, parentId, file.parents);
  }
  override async deleteObject(key: string) {
    await this.contained(key);
    // Keep an orphan after a failed write; never turn rollback into permanent Drive deletion.
    console.warn("Sandbox Drive cleanup retained a file for review.", { key });
  }
}
