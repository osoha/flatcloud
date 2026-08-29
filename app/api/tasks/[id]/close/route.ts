import { DocumentPhotoStage } from "@prisma/client";
import { editableUnitWhere } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPropertyPermission } from "@/lib/management";
import { prepareDocumentFiles,documentCategory } from "@/lib/documents/upload";
import { createDocumentFromUpload } from "@/lib/documents/service";
import { goWithMessage } from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return new Response("Unauthorized",{status:401});
  const{id}=await params;
  const task=await prisma.task.findUnique({where:{id},select:{id:true,propertyId:true,unitId:true,leaseId:true,category:true,status:true}});
  if(!task)return goWithMessage(request,"/ukoly","error","Úkol nebyl nalezen.");
  try{
    const canEdit=await hasPropertyPermission(user,task.propertyId,"EDIT")||Boolean(task.unitId&&await prisma.unit.findFirst({where:{id:task.unitId,...editableUnitWhere(user,task.propertyId)},select:{id:true}}));
    if(!canEdit)throw new Error("Nemáte oprávnění uzavřít případ.");
    if(task.status==="DONE"||task.status==="CANCELLED")throw new Error("Případ už je uzavřen.");
    const form=await request.formData(),body=String(form.get("body")||"").trim();if(!body)throw new Error("Závěrečný komentář je povinný.");
    const hasFiles=form.getAll("files").some(value=>value instanceof File&&value.size>0),files=hasFiles?await prepareDocumentFiles(form):[];
    const entry=await prisma.taskEntry.create({data:{taskId:id,authorId:user.id,kind:"STATUS",body}});
    for(const file of files)await createDocumentFromUpload({actor:user,propertyId:task.propertyId,unitId:task.unitId||undefined,leaseId:task.leaseId||undefined,taskId:id,taskEntryId:entry.id,...file,category:documentCategory(null,file),photoStage:task.category==="MAINTENANCE"&&file.mimeType.startsWith("image/")?DocumentPhotoStage.AFTER:undefined,title:file.originalName});
    await prisma.$transaction([prisma.task.update({where:{id},data:{status:"DONE",closedAt:new Date()}}),prisma.auditLog.create({data:{userId:user.id,propertyId:task.propertyId,action:"TASK_CLOSED",entityType:"Task",entityId:id,details:{entryId:entry.id,attachmentCount:files.length}}})]);
    return goWithMessage(request,`/ukoly/${id}`,"ok","Případ byl uzavřen.");
  }catch(error){return goWithMessage(request,`/ukoly/${id}`,"error",error instanceof Error?error.message:"Případ se nepodařilo uzavřít.")}
}
