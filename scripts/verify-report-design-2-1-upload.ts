import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MAX_FILE_BYTES } from "../lib/documents/file-validation";
import { storePreparedDocumentBatch } from "../lib/documents/batch-service";
import { DEFAULT_S3_CONNECTION_TIMEOUT_MS, DEFAULT_S3_MAX_ATTEMPTS, DEFAULT_S3_REQUEST_TIMEOUT_MS, S3FileStorage, s3RequestConfiguration } from "../lib/storage/s3";
import { StorageTimeoutError, type FileStorage, type PutObjectInput } from "../lib/storage/types";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file: string) => createHash("sha256").update(read(file)).digest("hex");
let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }

class StageStorage implements FileStorage {
  objects = new Map<string, Uint8Array>(); deleted: string[] = []; puts = 0;
  constructor(private failPut?: number) {}
  async putObject(input: PutObjectInput) { this.puts += 1; if (this.puts === this.failPut) throw new Error("simulated storage failure"); this.objects.set(input.key, input.body); }
  async deleteObject(key: string) { this.deleted.push(key); this.objects.delete(key); }
  async getObject() { return new Uint8Array(); }
  async getSignedDownloadUrl() { return ""; }
  async exists() { return false; }
}

const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const corruptPng = new Uint8Array([...png.subarray(0, 8), 1, 2, 3]);
function batch(bytes: Uint8Array, mimeType = "image/png") { return { actor: { id: "verify", role: "OWNER_VIEWER" }, scopes: [{ mode: "PROPERTY" as const, propertyId: "property" }], documents: [{ propertyId: "property", bytes, mimeType, originalName: "photo.png", category: "PHOTO" as const, photoStage: "GENERAL" as const, title: "Photo" }] }; }

async function main() {
  const s3 = read("lib/storage/s3.ts"), workspace = read("components/quarterly-report-workspace/QuarterlyReportPrimaryPhoto.tsx"), route = read("app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/media/primary/upload/route.ts"), mediaService = read("lib/reporting/quarterly-report-media-service.ts");
  await check("2.4 MB and 5 MB remain below the default 25 MB validation limit", () => { assert.equal(DEFAULT_MAX_FILE_BYTES, 25 * 1024 * 1024); assert.ok(2.4 * 1024 * 1024 < DEFAULT_MAX_FILE_BYTES); assert.ok(5 * 1024 * 1024 < DEFAULT_MAX_FILE_BYTES); });
  await check("upload UI immediately prevents duplicate submit and shows progress text", () => { assert.match(workspace, /uploadSubmitting\.current/); assert.match(workspace, /disabled=\{uploading\}/); assert.match(workspace, /Nahrávám fotografii…/); assert.match(workspace, /setUploading\(true\)/); });
  await check("S3 defaults have bounded connection request socket behavior and limited retries", () => { assert.deepEqual(s3RequestConfiguration({}), { connectionTimeout: DEFAULT_S3_CONNECTION_TIMEOUT_MS, requestTimeout: DEFAULT_S3_REQUEST_TIMEOUT_MS, maxAttempts: DEFAULT_S3_MAX_ATTEMPTS }); assert.equal(DEFAULT_S3_CONNECTION_TIMEOUT_MS, 5_000); assert.equal(DEFAULT_S3_REQUEST_TIMEOUT_MS, 20_000); assert.equal(DEFAULT_S3_MAX_ATTEMPTS, 2); for (const token of ["connectionTimeout:", "requestTimeout:", "socketTimeout:", "throwOnRequestTimeout: true", "maxAttempts:"]) assert.ok(s3.includes(token)); assert.doesNotMatch(s3, /Promise\.race/); });
  await check("S3 timeout values are configurable within safe bounds", () => { assert.deepEqual(s3RequestConfiguration({ S3_CONNECTION_TIMEOUT_MS: "8000", S3_REQUEST_TIMEOUT_MS: "45000", S3_MAX_ATTEMPTS: "3" }), { connectionTimeout: 8_000, requestTimeout: 45_000, maxAttempts: 3 }); assert.throws(() => s3RequestConfiguration({ S3_REQUEST_TIMEOUT_MS: "0" }), /between/); assert.throws(() => s3RequestConfiguration({ S3_MAX_ATTEMPTS: "20" }), /between/); });
  await check("AWS timeout errors become a safe explicit StorageTimeoutError", async () => { const storage = new S3FileStorage({ S3_BUCKET: "test", S3_REGION: "eu-test-1", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_MAX_ATTEMPTS: "1" }); (storage as unknown as { client: { send(): Promise<never> } }).client = { send: async () => { const error = new Error("socket timed out"); error.name = "TimeoutError"; throw error; } }; await assert.rejects(storage.putObject({ key: "hidden", body: new Uint8Array([1]), contentType: "image/png" }), (error: unknown) => error instanceof StorageTimeoutError && !error.message.includes("hidden") && !error.message.includes("test")); });
  await check("timeout and validation failures map to visible safe redirects", () => { const mapper = read("lib/reporting/quarterly-workflow-route.ts"); assert.match(mapper, /StorageTimeoutError/); assert.match(mapper, /Fotografie je prázdná nebo překračuje/); assert.match(mapper, /podporovaný obrázek JPEG, PNG nebo WEBP/); assert.match(route, /goWithMessage\(request, workspace, "error"/); assert.doesNotMatch(route, /storageKey|S3_ENDPOINT|S3_BUCKET|credentials/); });
  await check("failure before storage persists nothing", async () => { const storage = new StageStorage(); await assert.rejects(storePreparedDocumentBatch(batch(new Uint8Array([1, 2, 3]), "image/png"), storage), /does not match/); assert.equal(storage.puts, 0); assert.equal(storage.objects.size, 0); });
  await check("variant processing failure cleans the stored original", async () => { const storage = new StageStorage(); await assert.rejects(storePreparedDocumentBatch(batch(corruptPng), storage), /Obrázek se nepodařilo zpracovat/); assert.equal(storage.puts, 1); assert.equal(storage.objects.size, 0); assert.equal(storage.deleted.length, 1); });
  await check("preview upload failure cleans the stored original", async () => { const storage = new StageStorage(2); await assert.rejects(storePreparedDocumentBatch(batch(png), storage), /simulated/); assert.equal(storage.objects.size, 0); assert.equal(storage.deleted.length, 1); });
  await check("thumbnail upload failure cleans original and preview", async () => { const storage = new StageStorage(3); await assert.rejects(storePreparedDocumentBatch(batch(png), storage), /simulated/); assert.equal(storage.objects.size, 0); assert.equal(storage.deleted.length, 2); });
  await check("DB failure cleanup and success semantics remain covered by DESIGN-2.1", () => { const verifier = read("scripts/verify-report-design-2-1.ts"); assert.match(verifier, /failed DB transaction rolls back rows and cleans newly stored objects/); assert.match(verifier, /uploaded FileAsset is PRIMARY with Document provenance/); assert.match(verifier, /normal FileAsset has checksum and preview\/thumbnail variants/); assert.match(mediaService, /cleanupStoredDocumentBatch\(stored\)/); });
  await check("permissions lifecycle and atomic Document media audits are unchanged", () => { assert.match(mediaService, /editablePropertyReport\(tx, input, actor\)/); assert.match(mediaService, /status !== "DRAFT"/); assert.match(mediaService, /createStoredDocumentsInTransaction\(tx, stored\)[\s\S]*quarterlyPropertyReportMedia/); assert.match(mediaService, /REPORT_PROPERTY_MEDIA_(?:UPDATED|SELECTED)/); assert.match(read("lib/documents/batch-service.ts"), /DOCUMENT_UPLOADED/); });
  await check("upload diagnostics expose stages and safe metadata only", () => { for (const token of ["request_accepted", "image_prepared", "storage_completed", "db_completed", "storage_failed", "db_failed", "elapsedMs", "sizeBytes", "mimeType"]) assert.ok((route + mediaService).includes(token)); assert.doesNotMatch(route + mediaService.slice(mediaService.indexOf("uploadQuarterlyPropertyPrimaryPhoto"), mediaService.indexOf("removeQuarterlyPropertyPrimaryPhoto")), /console\.(?:info|warn)\([^\n]*(?:storageKey|bytes:|bucket|credentials)/); });
  await check("preview and thumbnail share one Sharp input pipeline", () => { const image = read("lib/documents/image-processing.ts"); assert.match(image, /const image=sharp\(bytes\)\.rotate\(\)/); assert.equal((image.match(/sharp\(bytes\)/g) || []).length, 1); assert.equal((image.match(/image\.clone\(\)/g) || []).length, 2); });
  await check("PDF and reporting contracts remain byte-for-byte unchanged", () => { assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf.tsx"), "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff"); assert.equal(hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"), "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b"); assert.equal(hash("lib/reporting/editorial-schema.ts"), "ab6e54e8bee77cfc29a7db197a0dcfd379e6884d656202f97dfd255b7c6f2591"); assert.equal(hash("lib/reporting/snapshot-schema.ts"), "560cc086ddd3bc22d464c968ab598cf01b10e669d0df3a1869fd3e9917bf0c00"); assert.equal(hash("lib/reporting/quarterly-quality-gate.ts"), "bee943a48d16afe527c3f9340947821022d98794066134ff7783dea3d2f4fcf1"); });
  await check("focused verifier is after DESIGN-2.1 and before build", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:report-design-2-1\n      - run: npm run verify:report-design-2-1-upload\n      - run: npm run build")));
  console.log(`REPORT-DESIGN-2.1 upload hotfix verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
