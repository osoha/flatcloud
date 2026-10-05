import {manageableTenantLeaseIds} from "@/lib/tenant-portal-access";
import {currentUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {goWithMessage} from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{tenantId:string;userId:string}>}) {
  const {tenantId,userId}=await params,target=`/najemnici/${tenantId}`;
  const actor=await currentUser();if(!actor||!(await manageableTenantLeaseIds(actor,tenantId)).length)return goWithMessage(request,target,"error","Nemáte oprávnění.");
  const deleted=await prisma.$transaction(async tx=>{
    const result=await tx.tenantPortalAccess.deleteMany({where:{tenantId,userId}});
    if(result.count)await tx.auditLog.create({data:{userId:actor.id,action:"TENANT_PORTAL_ACCESS_REVOKED",entityType:"TenantPortalAccess",entityId:tenantId,details:{targetUserId:userId}}});
    return result.count;
  });
  return goWithMessage(request,target,"ok",deleted?"Přístup k portálu byl odebrán.":"Přístup už byl odebrán.");
}
