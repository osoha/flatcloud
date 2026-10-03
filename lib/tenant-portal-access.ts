import {prisma} from "./db";
import {leaseStatusAt} from "./lease-lifecycle-core";

export async function activeTenantLease(userId:string,tenantId:string,leaseId:string) {
  const access=await prisma.tenantPortalAccess.findUnique({where:{userId_tenantId:{userId,tenantId}},select:{tenantId:true}});
  if(!access)return null;
  const lease=await prisma.lease.findFirst({where:{id:leaseId,OR:[{tenantId},{parties:{some:{tenantId,role:{in:["CONTRACTING_PARTY","PAYER"]}}}}]},include:{unit:{include:{ownerships:{include:{owner:{include:{user:true}}}},property:{include:{manager:true,owner:{include:{user:true}}}}}}}});
  return lease&&leaseStatusAt(lease)==="ACTIVE"?lease:null;
}
