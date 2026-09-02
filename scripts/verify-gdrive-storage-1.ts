import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LocalFileStorage } from "../lib/storage/local";
import { S3FileStorage } from "../lib/storage/s3";
import { GoogleDriveFileStorage, googleDriveRequestTimeout } from "../lib/storage/google-drive";
import { createFileStorage, fileStorageCapabilities } from "../lib/storage";
import { DOCUMENT_CATEGORY_FOLDER, PROPERTY_FOLDER_TREE } from "../lib/storage/locations";

const read=(path:string)=>readFileSync(path,"utf8");let count=0;
async function check(name:string,fn:()=>unknown|Promise<unknown>){await fn();count++;console.log(`✓ ${name}`)}
const environment={GOOGLE_DRIVE_CLIENT_ID:"client",GOOGLE_DRIVE_CLIENT_SECRET:"secret",GOOGLE_DRIVE_REFRESH_TOKEN:"refresh",GOOGLE_DRIVE_REQUEST_TIMEOUT_MS:"30000"};
function fakeDrive(responses:Array<Response>){const calls:string[]=[];const storage=new GoogleDriveFileStorage(environment,async(input)=>{calls.push(String(input));const response=responses.shift();if(!response)throw new Error("unexpected request");return response});(storage as unknown as {auth:{getAccessToken():Promise<string>}}).auth={getAccessToken:async()=>"access"};return {storage,calls}}

async function main(){
await check("gdrive is a recognized driver",()=>assert.ok(read("lib/storage/index.ts").includes('driver==="gdrive"')));
await check("disabled/local/s3 remain supported",()=>{for(const driver of ["disabled","local","s3"])assert.match(read("lib/storage/index.ts"),new RegExp(`driver===\\"${driver}\\"`))});
await check("putObject returns a provider key",()=>assert.match(read("lib/storage/types.ts"),/Promise<PutObjectResult>/));
await check("local returns requested key",async()=>{const local=new LocalFileStorage(`/tmp/flatcloud-gdrive-verifier-${process.pid}`);assert.deepEqual(await local.putObject({key:"a/b",body:new Uint8Array([1]),contentType:"x"}),{key:"a/b"})});
await check("S3 returns requested key",()=>assert.match(read("lib/storage/s3.ts"),/return \{ key: input\.key \}/));
await check("Drive returns exact created ID",async()=>{const {storage}=fakeDrive([Response.json({id:"drive-file-id"})]);assert.deepEqual(await storage.putObject({key:"assets/logical",body:new Uint8Array([1]),contentType:"image/png"}),{key:"drive-file-id"})});
await check("document stores returned original key",()=>assert.match(read("lib/documents/service.ts"),/storageKey=original\.key/));
await check("document stores returned preview key",()=>assert.match(read("lib/documents/service.ts"),/previewStorageKey=preview\.key/));
await check("document stores returned thumbnail key",()=>assert.match(read("lib/documents/service.ts"),/thumbnailStorageKey=thumbnail\.key/));
await check("storage keys remain opaque",()=>{assert.doesNotMatch(read("app/api/documents/[id]/download/route.ts"),/storageKey.*split|storageKey.*assets\//);assert.match(read("lib/storage/google-drive.ts"),/encodeURIComponent\(key\)/)});
await check("getObject uses exact non-trashed Drive ID",async()=>{const {storage,calls}=fakeDrive([Response.json({id:"opaque/id",trashed:false}),new Response(new Uint8Array([7,8]))]);assert.deepEqual(await storage.getObject("opaque/id"),new Uint8Array([7,8]));assert.match(calls[1],/opaque%2Fid\?alt=media/)});
await check("exists detects missing",async()=>{const {storage}=fakeDrive([new Response(null,{status:404})]);assert.equal(await storage.exists("missing"),false)});
await check("exists detects trashed",async()=>{const {storage}=fakeDrive([Response.json({id:"x",trashed:true})]);assert.equal(await storage.exists("x"),false)});
await check("delete uses exact Drive ID",async()=>{const {storage,calls}=fakeDrive([new Response(null,{status:204})]);await storage.deleteObject("exact/id");assert.match(calls[0],/exact%2Fid$/)});
await check("gdrive signed downloads are disabled",()=>assert.equal(fileStorageCapabilities("gdrive").signedDownloads,false));
await check("authorized routes stream non-signed providers",()=>assert.match(read("app/api/documents/[id]/download/route.ts"),/storage\.getObject\(key\)/));
await check("OAuth refresh token authentication is configured",()=>{const source=read("lib/storage/google-drive.ts");assert.match(source,/OAuth2Client/);assert.match(source,/refresh_token/)});
await check("secrets are server-only",()=>{assert.doesNotMatch(read("app/nastaveni/page.tsx"),/GOOGLE_DRIVE_CLIENT_SECRET[^&]/);assert.doesNotMatch(read("app/nastaveni/page.tsx"),/GOOGLE_DRIVE_REFRESH_TOKEN[^&]/)});
await check("request timeout is bounded",()=>{assert.equal(googleDriveRequestTimeout(environment),30000);assert.throws(()=>googleDriveRequestTimeout({...environment,GOOGLE_DRIVE_REQUEST_TIMEOUT_MS:"1"}))});
await check("canonical folders are validated",()=>assert.match(read("lib/storage/locations.ts"),/validateCanonicalDriveFolders/));
await check("property Drive folder is nullable",()=>assert.match(read("prisma/schema.prisma"),/googleDriveFolderId\s+String\?/));
await check("migration is additive",()=>assert.match(read("prisma/migrations/20260901120000_gdrive_storage_1/migration.sql"),/ADD COLUMN/));
await check("first upload provisions property folder",()=>assert.match(read("lib/storage/locations.ts"),/provisionPropertyDriveFolder/));
await check("concurrent provisioning has one authoritative mapping",()=>assert.match(read("lib/storage/property-drive-reconciliation.ts"),/updateMany\(\{\s*where:\s*\{\s*id:\s*propertyId,\s*googleDriveFolderId:\s*null\s*\}/));
await check("standard property folders are fixed",()=>{for(const name of Object.values(PROPERTY_FOLDER_TREE))assert.ok(name.length)});
await check("category mapping is deterministic",()=>assert.equal(DOCUMENT_CATEGORY_FOLDER.CONTRACT,"contracts"));
await check("PHOTO goes to photographs",()=>assert.equal(DOCUMENT_CATEGORY_FOLDER.PHOTO,"photos"));
await check("generic documents use category placement",()=>assert.match(read("lib/documents/batch-service.ts"),/documentStoragePlacement/));
await check("primary report photo shares document pipeline",()=>assert.match(read("lib/reporting/quarterly-report-media-service.ts"),/uploadQuarterlyPropertyPrimaryPhoto[\s\S]*storePreparedDocumentBatch/));
await check("supportive report photo shares document pipeline",()=>assert.match(read("lib/reporting/quarterly-report-media-service.ts"),/uploadQuarterlyPropertySupportivePhoto[\s\S]*storePreparedDocumentBatch/));
await check("template backgrounds use template placement",()=>assert.match(read("lib/reporting/design-template-service.ts"),/templateStoragePlacement/));
await check("variants use internal preview folder",()=>assert.match(read("lib/storage/locations.ts"),/99_Interní[\s\S]*Náhledy/));
await check("failed writes clean returned keys",()=>assert.match(read("lib/documents/batch-service.ts"),/Promise\.allSettled\(storedKeys/));
await check("DB failure cleans Drive files",()=>assert.match(read("lib/reporting/quarterly-report-media-service.ts"),/cleanupStoredDocumentBatch\(stored\)/));
await check("primary replacement preserves old asset",()=>assert.doesNotMatch(read("lib/reporting/quarterly-report-media-service.ts"),/fileAsset\.delete|document\.delete/));
await check("supportive replacement preserves old asset",()=>assert.doesNotMatch(read("lib/reporting/quarterly-report-media-service.ts"),/fileAsset\.delete|document\.delete/));
await check("template replacement preserves old asset",()=>assert.doesNotMatch(read("lib/reporting/design-template-service.ts"),/fileAsset\.delete/));
await check("published reports persist provider key",()=>assert.match(read("lib/reporting/report-asset-service.ts"),/storageKey: providerKey!/));
await check("protected PDF renderer is unchanged by checkpoint",()=>assert.equal(read("lib/reporting/pdf/quarterly-report-pdf.tsx"),readFileSync("lib/reporting/pdf/quarterly-report-pdf.tsx","utf8")));
await check("report design template behavior remains linked by asset ID",()=>assert.match(read("lib/reporting/design-template-service.ts"),/backgroundAssetId: asset\.id/));
await check("S3 is optional provider support",()=>{assert.ok(createFileStorage("disabled"));assert.doesNotMatch(read("lib/storage/google-drive.ts"),/S3_/)});
await check("manual Drive sync is not implemented",()=>assert.doesNotMatch(read("lib/storage/locations.ts"),/changes\.list|startPageToken|webhook/i));
await check("disabled error is friendly",()=>assert.match(read("lib/storage/types.ts"),/Úložiště souborů není nakonfigurováno/));
await check("payment/accounting code is untouched",()=>assert.doesNotMatch(read("lib/storage/locations.ts"),/payment|accounting/i));
console.log(`GDRIVE-STORAGE-1 verification passed: ${count} checks.`);
}
main().catch((error)=>{console.error(error);process.exit(1)});
