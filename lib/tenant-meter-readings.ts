import {Prisma} from "@prisma/client";
import sharp from "sharp";
import {prisma} from "./db";
import {businessDateKey} from "./calendar";
import {leaseStatusAt} from "./lease-lifecycle-core";
import {tenantPortalContactMatches} from "./tenant-portal-access";
import {readingDate,validateReadingPosition} from "./meter-reading-rules";
import {serializableTransaction} from "./serializable";
import {validateFile} from "./documents/file-validation";
import type {PreparedDocumentFile} from "./documents/upload";
import {cleanupStoredDocumentBatch,createStoredDocumentsInTransaction,storePreparedDocumentBatch,type StoredDocumentBatch} from "./documents/batch-service";
import type {FileStorage} from "./storage/types";

export const TENANT_METER_PHOTO_MAX_BYTES=8*1024*1024;
const PHOTO_MIME_TYPES=new Set(["image/jpeg","image/png","image/webp"]);
type Actor={id:string;role:string};
type ReadingInput={tenantId:string;leaseId:string;meterId:string;readAt:string;value:number;photo?:PreparedDocumentFile|null};

export function tenantMeterValue(value:FormDataEntryValue|null) {
  const raw=typeof value==="string"?value.trim():"";
  if(!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw))throw new Error("Zadejte platný nezáporný stav měřidla, například 123,45.");
  const parsed=Number(raw.replace(",","."));
  if(!Number.isFinite(parsed))throw new Error("Zadejte platný stav měřidla.");
  return parsed;
}

export async function prepareTenantMeterPhoto(form:FormData):Promise<PreparedDocumentFile|null> {
  const entries=form.getAll("photo");
  if(entries.some(entry=>typeof entry==="string"&&entry!==""))throw new Error("Vyberte fotografii měřidla ve formátu JPG, PNG nebo WebP.");
  const photos=entries.filter((entry):entry is File=>entry instanceof File&&(entry.size>0||entry.name!==""));
  if(photos.length>1)throw new Error("K jednomu odečtu připojte nejvýše jednu fotografii.");
  const photo=photos[0];
  if(!photo)return null;
  if(!photo.size||photo.size>TENANT_METER_PHOTO_MAX_BYTES)throw new Error("Fotografie musí mít velikost od 1 bajtu do 8 MB.");
  if(!PHOTO_MIME_TYPES.has(photo.type))throw new Error("Přiložte fotografii ve formátu JPG, PNG nebo WebP.");
  const prepared={bytes:new Uint8Array(await photo.arrayBuffer()),mimeType:photo.type,originalName:photo.name};
  await validateTenantMeterPhoto(prepared);
  return prepared;
}

async function validateTenantMeterPhoto(photo:PreparedDocumentFile) {
  if(!PHOTO_MIME_TYPES.has(photo.mimeType))throw new Error("Přiložte fotografii ve formátu JPG, PNG nebo WebP.");
  if(!photo.bytes.length||photo.bytes.length>TENANT_METER_PHOTO_MAX_BYTES)throw new Error("Fotografie musí mít velikost od 1 bajtu do 8 MB.");
  try {
    validateFile(photo,TENANT_METER_PHOTO_MAX_BYTES);
    // Decode before any storage write; a renamed file or damaged image is not evidence.
    await sharp(photo.bytes,{limitInputPixels:40_000_000,failOn:"warning"}).rotate().resize({width:1920,height:1920,fit:"inside",withoutEnlargement:true}).webp().toBuffer();
  }catch{throw new Error("Fotografii se nepodařilo přečíst. Vyberte nepoškozený obrázek JPG, PNG nebo WebP.");}
}

async function readingContext(client:Prisma.TransactionClient|typeof prisma,actor:Actor,input:ReadingInput,readAt:Date) {
  if(actor.role==="SUPER_ADMIN")throw new Error("Odečet nelze odeslat z náhledu správce.");
  const [user,access]=await Promise.all([
    client.user.findFirst({where:{id:actor.id,active:true},select:{email:true,role:true}}),
    client.tenantPortalAccess.findUnique({where:{userId_tenantId:{userId:actor.id,tenantId:input.tenantId}},select:{tenant:{select:{email:true,communicationEmail:true}}}}),
  ]);
  if(!user||user.role==="SUPER_ADMIN"||!access||!tenantPortalContactMatches(user.email,access.tenant))throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
  const lease=await client.lease.findFirst({where:{id:input.leaseId,OR:[{tenantId:input.tenantId},{parties:{some:{tenantId:input.tenantId,role:"CONTRACTING_PARTY"}}}]},include:{unit:{select:{propertyId:true}}}});
  if(!lease||leaseStatusAt(lease)!=="ACTIVE")throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
  if(businessDateKey(readAt)<businessDateKey(lease.startDate))throw new Error("Datum odečtu nemůže být před začátkem vašeho nájmu.");
  const meter=await client.meter.findFirst({where:{id:input.meterId,unitId:lease.unitId,propertyId:lease.unit.propertyId,active:true},include:{readings:true}});
  if(!meter)throw new Error("Měřidlo není dostupné pro vaše bydlení. Obraťte se na správce.");
  if(meter.installedAt&&businessDateKey(readAt)<businessDateKey(meter.installedAt))throw new Error("Datum odečtu nemůže být před instalací měřidla.");
  if(meter.removedAt&&businessDateKey(readAt)>businessDateKey(meter.removedAt))throw new Error("Datum odečtu je po vyřazení měřidla. Obraťte se na správce.");
  try{validateReadingPosition(meter.readings,readAt,input.value);}
  catch(error){
    if(error instanceof Error&&error.message.includes("Pro tento den"))throw new Error("Pro tento den už je odečet uložen. Pokud je potřeba jej opravit, obraťte se na správce.");
    if(error instanceof Error&&error.message.includes("Stav nenavazuje"))throw new Error("Stav nenavazuje na předchozí nebo následující odečet. Při výměně měřidla nebo opravě údaje se obraťte na správce.");
    throw error;
  }
  return {lease,meter};
}

/** A tenant can add evidence only to their own active tenancy's meter, never arbitrary documents. */
export async function recordTenantMeterReading(actor:Actor,input:ReadingInput,storage?:FileStorage) {
  const readAt=readingDate(input.readAt);
  const context=await readingContext(prisma,actor,input,readAt);
  if(input.photo)await validateTenantMeterPhoto(input.photo);
  let batch:StoredDocumentBatch|null=null;
  try {
    if(input.photo){
      // Tenant access above replaces manager document-edit rights for this single exact context.
      batch=await storePreparedDocumentBatch({actor,scopes:[{mode:"UNIT",propertyId:context.lease.unit.propertyId,unitId:context.lease.unitId}],documents:[{
        ...input.photo,propertyId:context.lease.unit.propertyId,unitId:context.lease.unitId,leaseId:context.lease.id,
        category:"PHOTO",title:`Fotografie odečtu · ${context.meter.label||context.meter.serialNumber||"měřidlo"} · ${input.readAt}`,documentDate:readAt,
      }]},storage);
    }
    return await serializableTransaction(async tx=>{
      // Re-check access, active meter and reading order after storage and on transaction retries.
      const {lease,meter}=await readingContext(tx,actor,input,readAt);
      if(lease.unitId!==context.lease.unitId||lease.unit.propertyId!==context.lease.unit.propertyId)throw new Error("Údaje o bydlení se mezitím změnily. Obnovte stránku a odečet odešlete znovu.");
      const document=batch?(await createStoredDocumentsInTransaction(tx,batch))[0]:null;
      if(document)await tx.document.update({where:{id:document.id},data:{tenantVisible:true}});
      const file=batch?.documents[0];
      const reading=await tx.meterReading.create({data:{meterId:meter.id,readAt,value:input.value,method:"PERSONAL",unitOfMeasure:meter.unitOfMeasure,leaseId:lease.id,createdById:actor.id,note:"Zadal nájemník v portálu.",evidenceDocumentId:document?.id||null,evidenceSnapshot:document&&file?{documentId:document.id,title:document.title,fileAssetId:document.fileAssetId,sha256:file.metadata.sha256,mimeType:file.metadata.mimeType}:Prisma.DbNull}});
      await tx.auditLog.create({data:{userId:actor.id,propertyId:lease.unit.propertyId,action:"TENANT_METER_READING_CREATED",entityType:"MeterReading",entityId:reading.id,details:{tenantId:input.tenantId,leaseId:lease.id,meterId:meter.id,evidenceDocumentId:document?.id||null}}});
      return reading;
    });
  }catch(error){if(batch)await cleanupStoredDocumentBatch(batch);throw error;}
}
