import {currentUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {documentEditAccessWhere} from "@/lib/documents/access";
import {goWithMessage} from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{leaseId:string;documentId:string}>}) {
  const {leaseId,documentId}=await params;const target=`/smlouvy/${leaseId}#dokumenty`;
  const user=await currentUser();if(!user)return goWithMessage(request,target,"error","Nemáte oprávnění.");
  const visible=(await request.formData()).get("tenantVisible")==="true";
  const doc=await prisma.document.findFirst({where:{id:documentId,leaseId,deletedAt:null,AND:[documentEditAccessWhere(user)]},select:{id:true,propertyId:true,tenantVisible:true}});
  if(!doc)return goWithMessage(request,target,"error","Dokument není dostupný k úpravě.");
  await prisma.$transaction(async tx=>{
    await tx.document.update({where:{id:documentId},data:{tenantVisible:visible}});
    await tx.auditLog.create({data:{userId:user.id,propertyId:doc.propertyId,action:"TENANT_DOCUMENT_VISIBILITY_CHANGED",entityType:"Document",entityId:doc.id,details:{from:doc.tenantVisible,to:visible}}});
  });
  return goWithMessage(request,target,"ok",visible?"Dokument je dostupný v portálu nájemníka.":"Dokument už není v portálu nájemníka dostupný.");
}
