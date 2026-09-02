import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DocumentCategory, Prisma } from "@prisma/client";
import { GoogleDriveFileStorage, GOOGLE_DRIVE_FOLDER_MIME, type DriveFile } from "../lib/storage/google-drive";
import { PROPERTY_FOLDER_TREE, propertyDriveFolderName } from "../lib/storage/drive-structure";
import { reconcileAllPropertyDriveStructures, reconcilePropertyDriveStructure, type DocumentAssetRecord, type PropertyRecord, type ReconciliationStore } from "../lib/storage/property-drive-reconciliation";

const read = (path: string) => readFileSync(path, "utf8");
const hash = (path: string) => createHash("sha256").update(read(path)).digest("hex");
let count = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) { await fn(); console.log(`✓ ${++count}. ${name}`); }

const environment = { GOOGLE_DRIVE_CLIENT_ID: "client", GOOGLE_DRIVE_CLIENT_SECRET: "secret", GOOGLE_DRIVE_REFRESH_TOKEN: "refresh" };
type MemoryFile = Required<Pick<DriveFile, "id" | "name" | "mimeType" | "parents">> & { trashed: boolean; bytes?: Uint8Array };

class MemoryDrive extends GoogleDriveFileStorage {
  files = new Map<string, MemoryFile>();
  operations: string[] = [];
  failRenameFor = new Set<string>();
  private serial = 0;
  constructor() { super(environment, async () => { throw new Error("unexpected HTTP request"); }); }
  seedFolder(id: string, name: string, parent?: string) { this.files.set(id, { id, name, mimeType: GOOGLE_DRIVE_FOLDER_MIME, parents: parent ? [parent] : [], trashed: false }); return id; }
  seedFile(id: string, name: string, parent: string, bytes = new Uint8Array([1, 2, 3])) { this.files.set(id, { id, name, mimeType: "application/pdf", parents: [parent], trashed: false, bytes }); return id; }
  override async getFile(key: string) { const file = this.files.get(key); return file ? { ...file, parents: [...file.parents] } : null; }
  override async listFoldersByName(name: string, parentId: string) { return [...this.files.values()].filter(file => !file.trashed && file.mimeType === GOOGLE_DRIVE_FOLDER_MIME && file.name === name && file.parents.includes(parentId)); }
  override async listFoldersByPrefix(prefix: string, parentId: string) { return [...this.files.values()].filter(file => !file.trashed && file.mimeType === GOOGLE_DRIVE_FOLDER_MIME && file.name.startsWith(prefix) && file.parents.includes(parentId)); }
  override async createFolder(name: string, parentId: string) { const id = `created-${++this.serial}`; this.seedFolder(id, name, parentId); this.operations.push(`create:${id}:${name}:${parentId}`); return id; }
  override async ensureFolderWithResult(name: string, parentId: string) { const existing = await this.listFoldersByName(name, parentId); return existing[0]?.id ? { id: existing[0].id, created: false } : { id: await this.createFolder(name, parentId), created: true }; }
  override async ensureFolder(name: string, parentId: string) { return (await this.ensureFolderWithResult(name, parentId)).id; }
  override async renameFile(key: string, name: string) { if (this.failRenameFor.has(key)) throw new Error("Drive unavailable"); const file = this.files.get(key); if (!file) throw new Error("missing"); file.name = name; this.operations.push(`rename:${key}:${name}`); return { ...file, parents: [...file.parents] }; }
  override async moveFile(key: string, parentId: string) { const file = this.files.get(key); if (!file) throw new Error("missing"); file.parents = [parentId]; this.operations.push(`move:${key}:${parentId}`); return { ...file, parents: [...file.parents] }; }
  override async deleteObject(key: string) { this.files.delete(key); this.operations.push(`delete:${key}`); }
}

class MemoryStore implements ReconciliationStore {
  properties = new Map<string, PropertyRecord>();
  assets = new Map<string, DocumentAssetRecord[]>();
  audits: Array<{ action: string; propertyId?: string; details: Prisma.InputJsonObject }> = [];
  async getProperty(propertyId: string) { const property = this.properties.get(propertyId); return property ? { ...property } : null; }
  async claimPropertyFolder(propertyId: string, folderId: string) { const property = this.properties.get(propertyId); if (!property) throw new Error("missing"); if (!property.googleDriveFolderId) property.googleDriveFolderId = folderId; return property.googleDriveFolderId; }
  async listPropertyIds() { return [...this.properties.values()].sort((a, b) => a.propertyCode.localeCompare(b.propertyCode)).map(property => property.id); }
  async listDocumentAssets(propertyId: string) { return this.assets.get(propertyId) || []; }
  async audit(input: { propertyId?: string; action: string; details: Prisma.InputJsonObject }) { this.audits.push(input); }
}

function property(id: string, propertyCode: string, name: string, active = true, googleDriveFolderId: string | null = null): PropertyRecord { return { id, propertyCode, name, active, googleDriveFolderId }; }
function asset(id: string, storageKey: string, documents: Array<{ propertyId: string; category: DocumentCategory }>, previewStorageKey: string | null = null): DocumentAssetRecord { return { id, storageKey, previewStorageKey, thumbnailStorageKey: null, documents }; }
function folderByName(drive: MemoryDrive, name: string, parentId: string) { return [...drive.files.values()].find(file => file.name === name && file.parents[0] === parentId); }

async function main() {
  const roots = { properties: "properties-root", archive: "archive-root" }, drive = new MemoryDrive(), store = new MemoryStore();
  drive.seedFolder(roots.properties, "Nemovitosti"); drive.seedFolder(roots.archive, "Archiv nemovitostí");

  await check("canonical property name uses P plus propertyCode", () => assert.equal(propertyDriveFolderName("1001", "Černice - Veská"), "P1001_Černice - Veská"));
  await check("canonical name preserves Czech diacritics and normalizes whitespace", () => assert.equal(propertyDriveFolderName("1001", "  Černice\n  –   Veská  "), "P1001_Černice – Veská"));

  store.properties.set("p1", property("p1", "1001", "Černice - Veská", true, "linked-folder"));
  drive.seedFolder("linked-folder", "Černice - Veská", roots.properties);
  drive.seedFolder("name-collision", "P1001_Černice - Veská", roots.properties);
  const linked = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots, actorUserId: "admin", reconcileDocuments: false });
  await check("linked folder is resolved by googleDriveFolderId instead of name", () => { assert.equal(linked.propertyFolderId, "linked-folder"); assert.equal(drive.files.get("name-collision")?.name, "P1001_Černice - Veská"); });
  await check("existing linked folder is renamed in place", () => assert.equal(drive.files.get("linked-folder")?.name, "P1001_Černice - Veská"));
  await check("rename preserves exact Drive folder ID", () => assert.equal(store.properties.get("p1")?.googleDriveFolderId, "linked-folder"));
  await check("standard property folder tree is created", () => { for (const name of Object.values(PROPERTY_FOLDER_TREE)) assert.ok([...drive.files.values()].some(file => file.name === name)); });
  const childArchive = folderByName(drive, PROPERTY_FOLDER_TREE.archive, "linked-folder")!;
  await check("per-property 99_Archiv remains inside property", () => assert.deepEqual(childArchive.parents, ["linked-folder"]));
  const idempotent = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots, reconcileDocuments: false });
  await check("second folder reconciliation is idempotent", () => assert.deepEqual({ renamed: idempotent.renamed, moved: idempotent.moved, created: idempotent.foldersCreated }, { renamed: false, moved: false, created: 0 }));

  store.properties.get("p1")!.name = "Veská 137";
  const renamed = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots, reconcileDocuments: false });
  await check("Property.name change renames same linked folder", () => { assert.ok(renamed.renamed); assert.equal(drive.files.get("linked-folder")?.name, "P1001_Veská 137"); assert.equal(store.properties.get("p1")?.googleDriveFolderId, "linked-folder"); });
  store.properties.get("p1")!.name = "Veská po výpadku"; drive.failRenameFor.add("linked-folder");
  await check("Drive rename failure does not mutate database name or folder ID", async () => { await assert.rejects(reconcilePropertyDriveStructure("p1", { storage: drive, store, roots, reconcileDocuments: false })); assert.equal(store.properties.get("p1")?.name, "Veská po výpadku"); assert.equal(store.properties.get("p1")?.googleDriveFolderId, "linked-folder"); });
  drive.failRenameFor.delete("linked-folder");
  await check("retry repairs failed rename", async () => { const result = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots, reconcileDocuments: false }); assert.ok(result.renamed); assert.equal(drive.files.get("linked-folder")?.name, "P1001_Veská po výpadku"); });

  store.properties.get("p1")!.active = false;
  const archived = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots, reconcileDocuments: false });
  await check("inactive property moves under global archive root", () => { assert.ok(archived.moved); assert.deepEqual(drive.files.get("linked-folder")?.parents, [roots.archive]); });
  await check("archive move preserves Drive ID and child archive", () => { assert.equal(store.properties.get("p1")?.googleDriveFolderId, "linked-folder"); assert.deepEqual(drive.files.get(childArchive.id)?.parents, ["linked-folder"]); assert.notEqual(childArchive.id, roots.archive); });
  store.properties.get("p1")!.active = true;
  const restored = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots, reconcileDocuments: false });
  await check("restore moves same folder back to properties root", () => { assert.ok(restored.moved); assert.deepEqual(drive.files.get("linked-folder")?.parents, [roots.properties]); assert.equal(restored.propertyFolderId, "linked-folder"); });

  store.properties.set("p2", property("p2", "1002", "Moskevská")); store.properties.set("p3", property("p3", "1054", "Moskevská"));
  const provisioned2 = await reconcilePropertyDriveStructure("p2", { storage: drive, store, roots, reconcileDocuments: false });
  const provisioned3 = await reconcilePropertyDriveStructure("p3", { storage: drive, store, roots, reconcileDocuments: false });
  await check("new provisioning uses canonical business-code name", () => assert.equal(drive.files.get(provisioned2.propertyFolderId)?.name, "P1002_Moskevská"));
  await check("duplicate property names provision distinct folders", () => { assert.equal(drive.files.get(provisioned3.propertyFolderId)?.name, "P1054_Moskevská"); assert.notEqual(provisioned2.propertyFolderId, provisioned3.propertyFolderId); });
  await check("old plain-name provisioning is not used", () => assert.equal([...drive.files.values()].filter(file => file.name === "Moskevská").length, 0));
  store.properties.set("p4", property("p4", "1004", "Nový název")); drive.seedFolder("orphan", "P1004_Starý název", roots.properties);
  await check("orphan folder with same business prefix fails closed", async () => { await assert.rejects(reconcilePropertyDriveStructure("p4", { storage: drive, store, roots, reconcileDocuments: false }), /ruční kontrolu/); assert.equal(store.properties.get("p4")?.googleDriveFolderId, null); });
  store.properties.set("p5", property("p5", "1005", "Neaktivní", false));
  const inactiveNew = await reconcilePropertyDriveStructure("p5", { storage: drive, store, roots, reconcileDocuments: false });
  await check("new inactive property provisions directly in global archive", () => assert.deepEqual(drive.files.get(inactiveNew.propertyFolderId)?.parents, [roots.archive]));

  const photos = linked.folders.photos;
  const contractFolder = linked.folders.contracts;
  drive.seedFile("contract-file", "Juriga.pdf", photos, new Uint8Array([7, 7]));
  drive.seedFile("addendum-file", "Juriga.pdf", photos, new Uint8Array([8, 8]));
  drive.seedFile("photo-file", "foto.jpg", photos, new Uint8Array([9]));
  drive.seedFolder("variants", "Náhledy"); drive.seedFile("preview-file", "Juriga – náhled.webp", "variants", new Uint8Array([4]));
  const contractAsset = asset("asset-contract", "contract-file", [{ propertyId: "p1", category: "CONTRACT" }], "preview-file");
  const addendumAsset = asset("asset-addendum", "addendum-file", [{ propertyId: "p1", category: "CONTRACT_ADDENDUM" }]);
  const photoAsset = asset("asset-photo", "photo-file", [{ propertyId: "p1", category: "PHOTO" }]);
  store.assets.set("p1", [contractAsset, addendumAsset, photoAsset]);
  const metadataBefore = structuredClone(store.assets.get("p1")), namesBefore = [drive.files.get("contract-file")?.name, drive.files.get("addendum-file")?.name], bytesBefore = [drive.files.get("contract-file")?.bytes, drive.files.get("addendum-file")?.bytes].map(bytes => [...(bytes || [])]);
  const documents = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots });
  await check("misplaced CONTRACT is moved to 01_Smlouvy", () => assert.deepEqual(drive.files.get("contract-file")?.parents, [contractFolder]));
  await check("misplaced CONTRACT_ADDENDUM is moved to 01_Smlouvy", () => assert.deepEqual(drive.files.get("addendum-file")?.parents, [contractFolder]));
  await check("PHOTO remains in 02_Fotografie", () => assert.deepEqual(drive.files.get("photo-file")?.parents, [photos]));
  await check("document moves preserve exact Drive IDs and storageKey metadata", () => { assert.equal(documents.documentsMoved, 2); assert.equal(contractAsset.storageKey, "contract-file"); assert.equal(addendumAsset.storageKey, "addendum-file"); });
  await check("Document and FileAsset records remain byte-for-byte unchanged", () => assert.deepEqual(store.assets.get("p1"), metadataBefore));
  await check("historical filenames and contents remain unchanged", () => { assert.deepEqual([drive.files.get("contract-file")?.name, drive.files.get("addendum-file")?.name], namesBefore); assert.deepEqual([drive.files.get("contract-file")?.bytes, drive.files.get("addendum-file")?.bytes].map(bytes => [...(bytes || [])]), bytesBefore); });
  await check("preview and thumbnail variants are not moved", () => assert.deepEqual(drive.files.get("preview-file")?.parents, ["variants"]));
  const fileCount = drive.files.size, repeatedDocuments = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots });
  await check("repeated document reconciliation creates no duplicate", () => { assert.equal(repeatedDocuments.documentsMoved, 0); assert.equal(drive.files.size, fileCount); });
  drive.seedFile("shared-conflict", "shared.pdf", photos);
  store.assets.set("p1", [...store.assets.get("p1")!, asset("asset-conflict", "shared-conflict", [{ propertyId: "p1", category: "CONTRACT" }, { propertyId: "p1", category: "PHOTO" }])]);
  const conflict = await reconcilePropertyDriveStructure("p1", { storage: drive, store, roots });
  await check("shared conflicting asset fails closed", () => { assert.deepEqual(drive.files.get("shared-conflict")?.parents, [photos]); assert.match(conflict.warnings.join(" "), /konfliktními/); });

  store.properties.set("p6", property("p6", "1006", "Rozbitá", true, "missing-folder"));
  store.properties.set("p7", property("p7", "1007", "Po chybě", true, null));
  const portfolio = await reconcileAllPropertyDriveStructures({ storage: drive, store, roots, actorUserId: "admin", reconcileDocuments: false });
  await check("one failed property does not abort portfolio reconciliation", () => { assert.ok(portfolio.errors >= 2); assert.ok(store.properties.get("p7")?.googleDriveFolderId); });
  await check("portfolio run emits one aggregate audit event", () => assert.equal(store.audits.filter(event => event.action === "GDRIVE_STRUCTURE_RECONCILIATION_RUN").length, 1));
  await check("property reconciliation uses aggregate audit rather than per-document events", () => assert.equal(store.audits.filter(event => event.action === "PROPERTY_DRIVE_FOLDER_RECONCILED").every(event => !String(event.details).includes("DOCUMENT_MOVED")), true));

  const calls: Array<{ url: string; init?: RequestInit }> = [], responses = [Response.json({ id: "folder/id", name: "P1001_Test", mimeType: GOOGLE_DRIVE_FOLDER_MIME, parents: ["old-root"] }), Response.json({ id: "folder/id", name: "P1001_Test", mimeType: GOOGLE_DRIVE_FOLDER_MIME, parents: ["new-root"] })];
  const httpDrive = new GoogleDriveFileStorage(environment, async (input, init) => { calls.push({ url: String(input), init }); return responses.shift()!; });
  (httpDrive as unknown as { auth: { getAccessToken(): Promise<string> } }).auth = { getAccessToken: async () => "access" };
  const renamedHttp = await httpDrive.renameFile("folder/id", "P1001_Test");
  await httpDrive.moveFile("folder/id", "new-root", ["old-root"]);
  await check("Google Drive rename uses files.update PATCH on exact ID", () => { assert.equal(renamedHttp.id, "folder/id"); assert.match(calls[0].url, /files\/folder%2Fid/); assert.equal(calls[0].init?.method, "PATCH"); assert.match(String(calls[0].init?.body), /P1001_Test/); });
  await check("Google Drive move uses addParents/removeParents without byte upload", () => { assert.match(calls[1].url, /addParents=new-root/); assert.match(calls[1].url, /removeParents=old-root/); assert.equal(calls[1].init?.method, "PATCH"); assert.ok(calls.every(call => !call.url.includes("upload") && !call.url.includes("copy"))); });

  const propertyRoute = read("app/api/properties/[id]/route.ts"), manualRoute = read("app/api/settings/storage/reconcile/route.ts"), service = read("lib/storage/property-drive-reconciliation.ts"), schema = read("prisma/schema.prisma");
  await check("property DB update precedes best-effort Drive reconciliation", () => { assert.match(propertyRoute, /prisma\.\$transaction[\s\S]*reconcilePropertyDriveStructure/); assert.match(propertyRoute, /catch \(error\)[\s\S]*Změna je uložena/); });
  await check("portfolio reconciliation is server-enforced SUPER_ADMIN only", () => { assert.match(manualRoute, /user\.role !== "SUPER_ADMIN"/); assert.match(read("app/nastaveni/page.tsx"), /Synchronizovat strukturu Google Drive/); });
  await check("document reconciliation moves originals only", () => { assert.match(service, /moveFile\(asset\.storageKey/); assert.doesNotMatch(service, /moveFile\(asset\.(previewStorageKey|thumbnailStorageKey)/); });
  await check("historical document names are never inferred from title", () => { assert.doesNotMatch(service, /Document\.title|document\.title/); assert.doesNotMatch(service, /renameFile\(asset\.storageKey/); });
  await check("FileAsset sharing is explicitly inspected", () => { assert.match(schema, /documents\s+Document\[\]/); assert.match(service, /destinations\.size !== 1/); });
  await check("identity schema is untouched and no migration is needed", () => assert.equal(hash("prisma/schema.prisma"), "11c543605f442ebd657fd8412b109f0513e3b000272f85ccdde16c0ddca5b16b"));
  await check("property and unit business identity implementation is read-only", () => assert.doesNotMatch(service, /BusinessCodeReservation|unitCode|data:\s*\{\s*propertyCode/));
  await check("variable-symbol implementation stays storage-independent", () => {
    const variableSymbol = read("lib/variable-symbol.ts");
    assert.match(variableSymbol, /property\.propertyCode/);
    assert.match(variableSymbol, /unit\.unitCode/);
    assert.doesNotMatch(variableSymbol, /storage|googleDrive|DriveFileStorage/i);
  });
  await check("MF rent implementation is untouched", () => assert.equal(hash("lib/reporting/mf-rent/service.ts"), "3f35b825f8b934bc45d75c6d7a7252f19a4df8a0ebadf790c5fcdbbecf708785"));
  await check("quarterly PDF renderers are untouched", () => { assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); });
  await check("production reconciliation contains no hardcoded property identity", () => assert.doesNotMatch(service, /Černice|Veská|Juriga|Moskevská/));
  console.log(`GDRIVE-STRUCTURE-2 verification passed: ${count} checks.`);
}

main().catch(error => { console.error(error); process.exit(1); });
