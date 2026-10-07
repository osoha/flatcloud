import { currentUser, previewContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { accessibleBankNotice } from "@/lib/bank-account-notice-access";
import { goWithMessage } from "@/lib/route-response";
type Params={params:Promise<{tenantId:string;id:string}>};
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:Params){
 const user=await currentUser(),{tenantId,id}=await params;if(!user)return new Response("Not found",{status:404});
 const notice=await accessibleBankNotice(user,id,tenantId);if(!notice)return new Response("Not found",{status:404});
 if(!(await previewContext()).requested) await prisma.bankAccountNoticeRead.upsert({where:{noticeId_userId:{noticeId:id,userId:user.id}},create:{noticeId:id,userId:user.id,tenantId,openedAt:new Date()},update:{}});
 return new Response(new Uint8Array(notice.pdfData),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="oznameni-platebni-udaje-${notice.id}.pdf"`,"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request,{params}:Params){
 const user=await currentUser(),{tenantId,id}=await params;if(!user)return new Response("Not found",{status:404});
 const notice=await accessibleBankNotice(user,id,tenantId);if(!notice)return new Response("Not found",{status:404});
 const form=await request.formData();if(form.get("confirm")!==notice.pdfHash)return new Response("Obnovte oznámení.",{status:409});
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${"bank-notice-read:"+id},0))`;
  const previous=await tx.bankAccountNoticeRead.findUnique({where:{noticeId_userId:{noticeId:id,userId:user.id}}});
  if(previous?.confirmedAt)return;
  await tx.bankAccountNoticeRead.upsert({where:{noticeId_userId:{noticeId:id,userId:user.id}},create:{noticeId:id,userId:user.id,tenantId,confirmedAt:new Date()},update:{confirmedAt:new Date()}});
  const lease=await tx.lease.findUniqueOrThrow({where:{id:notice.leaseId},select:{unit:{select:{propertyId:true}}}});
  await tx.auditLog.create({data:{userId:user.id,propertyId:lease.unit.propertyId,entityType:"Lease",entityId:notice.leaseId,action:"LEASE_BANK_NOTICE_READ_CONFIRMED",details:{noticeId:id,pdfHash:notice.pdfHash,tenantId}}});
  const confirmed=await tx.bankAccountNoticeRead.findMany({where:{noticeId:id,confirmedAt:{not:null}},select:{tenantId:true}});
  if(notice.tenantIds.every(t=>confirmed.some(r=>r.tenantId===t)))await tx.task.updateMany({where:{dedupeKey:`bank-notice:${id}`,status:{notIn:["DONE","CANCELLED"]}},data:{status:"DONE",closedAt:new Date()}});
 });
 return goWithMessage(request,`/portal/najemnik/${tenantId}#bankovni-oznameni`,"ok","Přečtení konkrétního oznámení bylo potvrzeno.");
}
