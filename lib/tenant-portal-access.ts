import {prisma} from "./db";
import {leaseStatusAt} from "./lease-lifecycle-core";

export function tenantPortalContactMatches(email:string,tenant:{email:string|null;communicationEmail:string|null}) {
  const contact=(tenant.communicationEmail||tenant.email||"").trim().toLowerCase();
  return Boolean(contact)&&contact===email.trim().toLowerCase();
}

export async function hasTenantPortalAccess(userId:string,email:string,tenantId:string) {
  const access=await prisma.tenantPortalAccess.findUnique({where:{userId_tenantId:{userId,tenantId}},select:{tenant:{select:{email:true,communicationEmail:true}}}});
  return Boolean(access&&tenantPortalContactMatches(email,access.tenant));
}

export async function activeTenantLease(userId:string,tenantId:string,leaseId:string) {
  const user=await prisma.user.findUnique({where:{id:userId},select:{email:true}});
  if(!user||!await hasTenantPortalAccess(userId,user.email,tenantId))return null;
  const lease=await prisma.lease.findFirst({where:{id:leaseId,OR:[{tenantId},{parties:{some:{tenantId,role:{in:["CONTRACTING_PARTY","PAYER"]}}}}]},include:{unit:{include:{ownerships:{include:{owner:{include:{user:true}}}},property:{include:{manager:true,owner:{include:{user:true}}}}}}}});
  return lease&&leaseStatusAt(lease)==="ACTIVE"?lease:null;
}
