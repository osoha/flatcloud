import {randomUUID} from "node:crypto";
import {actualUser} from "@/lib/auth";
import {activeTenantLease} from "@/lib/tenant-portal-access";
import {prepareDocumentFiles} from "@/lib/documents/upload";
import {storeTaskAttachments,createTaskAttachmentsInTransaction,cleanupTaskAttachments} from "@/lib/task-attachments";
import {goWithMessage} from "@/lib/route-response";
import {resolveAutomaticTaskAssignee} from "@/lib/task-automation";
import {serializableTransaction} from "@/lib/serializable";

export async function POST(request:Request,{params}:{params:Promise<{tenantId:string}>}) {
  const {tenantId}=await params;let target=`/portal/najemnik/${tenantId}#zavady`;
  const user=await actualUser();
  if(!user||user.role==="SUPER_ADMIN")return goWithMessage(request,target,"error","Tato akce není dostupná v administrátorském náhledu.");
  try {
    const form=await request.formData();
    const leaseId=String(form.get("leaseId")||"");
    target=`/portal/najemnik/${tenantId}#zavady-${encodeURIComponent(leaseId)}-nove`;
    const lease=await activeTenantLease(user.id,tenantId,leaseId);
    if(!lease)throw new Error("K tomuto nájemnímu vztahu nemáte přístup.");
    const title=String(form.get("title")||"").trim(),description=String(form.get("description")||"").trim();
    const tenantVisitNote=String(form.get("tenantVisitNote")||"").trim();
    if(tenantVisitNote.length>500)throw new Error("Poznámka ke vstupu je příliš dlouhá.");
    const tenantEntryConsentAt=form.get("tenantEntryConsent")==="yes"?new Date():null;
    if(title.length<5||title.length>140||description.length<10||description.length>5000)throw new Error("Vyplňte stručný název a popis závady.");
    const attachments=form.getAll("files").filter((v):v is File=>v instanceof File&&v.size>0);
    if(attachments.length>3)throw new Error("Připojte nejvýše tři fotografie.");
    const files=attachments.length?await prepareDocumentFiles(form):[];
    if(files.some(file=>!["image/jpeg","image/png","image/webp"].includes(file.mimeType)))throw new Error("Přiložte pouze fotografie JPG, PNG nebo WebP.");
    const batch=files.length?await storeTaskAttachments(user,files):null;
    const taskId=randomUUID();
    try {
      await serializableTransaction(async tx=>{
        const current=await activeTenantLease(user.id,tenantId,leaseId,tx);
        if(!current||current.unitId!==lease.unitId||current.unit.propertyId!==lease.unit.propertyId)throw new Error("Přístup nebo údaje o bydlení se mezitím změnily. Obnovte stránku a zkuste to znovu.");
        await tx.task.create({data:{id:taskId,title,description,tenantPortalTitle:title,tenantPortalBody:description,category:"MAINTENANCE",status:"OPEN",tenantPortalRequest:true,tenantEntryConsentAt,tenantVisitNote:tenantVisitNote||null,propertyId:current.unit.propertyId,unitId:current.unitId,leaseId:current.id,tenantId,createdById:user.id,assigneeId:resolveAutomaticTaskAssignee({manager:current.unit.property.manager,propertyOwner:current.unit.property.owner,unitOwnerships:current.unit.ownerships})}});
        if(batch)await createTaskAttachmentsInTransaction(tx,batch,taskId);
        await tx.auditLog.create({data:{userId:user.id,propertyId:lease.unit.propertyId,action:"TENANT_DEFECT_REPORTED",entityType:"Task",entityId:taskId,details:{tenantId,leaseId,photoCount:files.length,entryConsent:Boolean(tenantEntryConsentAt)}}});
      });
    }catch(error){if(batch)await cleanupTaskAttachments(batch);throw error;}
    return goWithMessage(request,`/portal/najemnik/${tenantId}#zavady-${encodeURIComponent(leaseId)}-historie`,"ok","Závada byla předána správci.");
  }catch(error){return goWithMessage(request,target,"error",error instanceof Error?error.message:"Závadu se nepodařilo uložit.");}
}
