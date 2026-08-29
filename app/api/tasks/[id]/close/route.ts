import { DocumentPhotoStage } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { goWithMessage } from "@/lib/route-response";
import { cleanupStoredDocumentBatch, createStoredDocumentsInTransaction, prepareDocumentBatch, storePreparedDocumentBatch } from "@/lib/documents/batch-service";
import { authoritativeTaskUnitId, canEditTask } from "@/lib/task-access";
import { serializableTransaction } from "@/lib/serializable";
import { randomUUID } from "node:crypto";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return new Response("Unauthorized",{status:401});
  const{id}=await params;
  const task=await prisma.task.findUnique({where:{id},select:{id:true,propertyId:true,unitId:true,leaseId:true,lease:{select:{unitId:true}},category:true,status:true}});
  if(!task)return goWithMessage(request,"/ukoly","error","Úkol nebyl nalezen.");
  try{
    const canEdit=await canEditTask(user,task);
    if(!canEdit)throw new Error("Nemáte oprávnění uzavřít případ.");
    if(task.status==="DONE"||task.status==="CANCELLED")throw new Error("Případ už je uzavřen.");
    const form=await request.formData(),body=String(form.get("body")||"").trim();if(!body)throw new Error("Závěrečný komentář je povinný.");
    const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0),files=hasFiles?await prepareDocumentFiles(form):[];
    const entryId=randomUUID(),unitId=authoritativeTaskUnitId(task);
    const documentInputs=files.map(file=>({propertyId:task.propertyId,unitId:unitId||undefined,leaseId:task.leaseId||undefined,taskId:id,taskEntryId:entryId,...file,category:documentCategory(null,file),photoStage:task.category==="MAINTENANCE"&&file.mimeType.startsWith("image/")?DocumentPhotoStage.AFTER:undefined,title:file.originalName}));
    const documentScope=unitId?{mode:"UNIT" as const,propertyId:task.propertyId,unitId}:{mode:"PROPERTY" as const,propertyId:task.propertyId};
    const stored=await storePreparedDocumentBatch(await prepareDocumentBatch(user,documentInputs,documentInputs.map(()=>documentScope)));
    try{await serializableTransaction(async tx=>{const claim=await tx.task.updateMany({where:{id,status:{notIn:["DONE","CANCELLED"]}},data:{status:"DONE",closedAt:new Date()}});if(claim.count!==1)throw new Error("Úkol už byl mezitím uzavřen nebo zrušen.");const entry=await tx.taskEntry.create({data:{id:entryId,taskId:id,authorId:user.id,kind:"STATUS",body}});await createStoredDocumentsInTransaction(tx,stored);await tx.auditLog.create({data:{userId:user.id,propertyId:task.propertyId,action:"TASK_CLOSED",entityType:"Task",entityId:id,details:{entryId:entry.id,attachmentCount:files.length}}});});}catch(error){await cleanupStoredDocumentBatch(stored);throw error;}
    return goWithMessage(request,`/ukoly/${id}`,"ok","Případ byl uzavřen.");
  }catch(error){return goWithMessage(request,`/ukoly/${id}`,"error",error instanceof Error?error.message:"Případ se nepodařilo uzavřít.")}
}
