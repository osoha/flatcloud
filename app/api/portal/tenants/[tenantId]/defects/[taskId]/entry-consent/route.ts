import {actualUser} from "@/lib/auth";
import {activeTenantLease} from "@/lib/tenant-portal-access";
import {goWithMessage} from "@/lib/route-response";
import {serializableTransaction} from "@/lib/serializable";

export async function POST(request:Request,{params}:{params:Promise<{tenantId:string;taskId:string}>}) {
  const {tenantId,taskId}=await params;let target=`/portal/najemnik/${tenantId}#zavady`;
  const user=await actualUser();
  if(!user||user.role==="SUPER_ADMIN")return goWithMessage(request,target,"error","Přístup byl odepřen.");
  try {
    await serializableTransaction(async tx=>{
      const task=await tx.task.findFirst({where:{id:taskId,tenantId,tenantPortalRequest:true},select:{id:true,leaseId:true,propertyId:true,unitId:true}});
      if(!task?.leaseId)throw new Error("Hlášení není dostupné.");
      const lease=await activeTenantLease(user.id,tenantId,task.leaseId,tx);
      if(!lease||lease.unitId!==task.unitId||lease.unit.propertyId!==task.propertyId)throw new Error("Hlášení není dostupné.");
      target=`/portal/najemnik/${tenantId}#zavady-${encodeURIComponent(task.leaseId)}-historie`;
      await tx.task.update({where:{id:task.id},data:{tenantEntryConsentAt:null}});
      await tx.auditLog.create({data:{userId:user.id,propertyId:task.propertyId,action:"TENANT_ENTRY_CONSENT_REVOKED",entityType:"Task",entityId:task.id,details:{tenantId,leaseId:task.leaseId}}});
    });
    return goWithMessage(request,target,"ok","Souhlas se vstupem byl odvolán. Správce bude muset domluvit jiný postup.");
  }catch(error){return goWithMessage(request,target,"error",error instanceof Error?error.message:"Souhlas se nepodařilo odvolat.");}
}
