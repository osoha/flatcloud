import {actualUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {activeTenantLease} from "@/lib/tenant-portal-access";
import {goWithMessage} from "@/lib/route-response";

export async function POST(request:Request,{params}:{params:Promise<{tenantId:string;taskId:string}>}) {
  const {tenantId,taskId}=await params,target=`/portal/najemnik/${tenantId}#zavady`;
  const user=await actualUser();
  if(!user||user.role==="SUPER_ADMIN")return goWithMessage(request,target,"error","Přístup byl odepřen.");
  const task=await prisma.task.findFirst({where:{id:taskId,tenantId,tenantPortalRequest:true},select:{id:true,leaseId:true,propertyId:true}});
  if(!task?.leaseId||!await activeTenantLease(user.id,tenantId,task.leaseId))return goWithMessage(request,target,"error","Hlášení není dostupné.");
  await prisma.$transaction(async tx=>{
    await tx.task.update({where:{id:task.id},data:{tenantEntryConsentAt:null}});
    await tx.auditLog.create({data:{userId:user.id,propertyId:task.propertyId,action:"TENANT_ENTRY_CONSENT_REVOKED",entityType:"Task",entityId:task.id,details:{tenantId,leaseId:task.leaseId}}});
  });
  return goWithMessage(request,target,"ok","Souhlas se vstupem byl odvolán. Správce bude muset domluvit jiný postup.");
}
