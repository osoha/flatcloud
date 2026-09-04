import { currentUser } from "@/lib/auth";
import { authorizeDocumentContext, type DocumentContext } from "@/lib/documents/service";
import { cleanupStoredDocumentBatch, createStoredDocumentsInTransaction, prepareDocumentBatch, storePreparedDocumentBatch } from "@/lib/documents/batch-service";
import { documentCategory, documentPhotoStage, prepareDocumentFiles } from "@/lib/documents/upload";
import { fileStorageCapabilities } from "@/lib/storage";
import { goWithMessage, safeInternalReturnPath } from "@/lib/route-response";
import { prisma } from "@/lib/db";

function value(form: FormData, key: string) { const raw=form.get(key); return typeof raw==="string"&&raw.trim()?raw.trim():undefined; }
export async function POST(request: Request) {
  const user=await currentUser();
  if(!user)return new Response("Unauthorized",{status:401});
  const form=await request.formData();
  const returnTo=safeInternalReturnPath(form.get("returnTo"),"/dokumenty");
  try {
    if(!fileStorageCapabilities().upload)throw new Error("Úložiště souborů není nakonfigurováno.");
    const context:DocumentContext={propertyId:value(form,"propertyId")||"",unitId:value(form,"unitId"),leaseId:value(form,"leaseId"),taskId:value(form,"taskId"),taskEntryId:value(form,"taskEntryId"),complianceRecordId:value(form,"complianceRecordId"),propertyCostId:value(form,"propertyCostId")};
    if(!context.propertyId)throw new Error("Chybí kontext nemovitosti.");
    const files=await prepareDocumentFiles(form),scope=await authorizeDocumentContext(user,context);
    const prepared=await prepareDocumentBatch(user,files.map(file=>({...context,...file,category:documentCategory(form.get("category"),file),photoStage:documentPhotoStage(form.get("photoStage")),title:value(form,"title")||file.originalName,description:value(form,"description"),documentDate:value(form,"documentDate")?new Date(`${value(form,"documentDate")}T12:00:00`):undefined})),files.map(()=>scope));
    const stored=await storePreparedDocumentBatch(prepared);
    try{await prisma.$transaction(tx=>createStoredDocumentsInTransaction(tx,stored));}catch(error){await cleanupStoredDocumentBatch(stored);throw error;}
    return goWithMessage(request,returnTo,"ok",files.length===1?"Dokument byl nahrán.":`Nahráno ${files.length} dokumentů.`);
  } catch(error){return goWithMessage(request,returnTo,"error",error instanceof Error?error.message:"Dokumenty se nepodařilo nahrát.");}
}
