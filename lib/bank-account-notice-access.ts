import { prisma } from "./db";
import { leaseAccessWhere } from "./access";
import { hasTenantPortalAccess } from "./tenant-portal-access";
export async function accessibleBankNotice(user:{id:string;email:string;role:string;allProperties?:boolean},id:string,tenantId?:string){
  if(tenantId){
    if(!await hasTenantPortalAccess(user.id,user.email,tenantId))return null;
    return prisma.bankAccountNotice.findFirst({where:{id,tenantIds:{has:tenantId}}});
  }
  if(user.role==="TENANT")return null;
  return prisma.bankAccountNotice.findFirst({where:{id,lease:leaseAccessWhere(user)}});
}
