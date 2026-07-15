import { prisma } from "./db";
import { canSeeAll } from "./auth";
export async function accessibleProperties(user:{id:string;role:string}){
  return prisma.property.findMany({
    where: canSeeAll(user.role) ? {} : { memberships:{some:{userId:user.id}} },
    include:{ owner:true, bankAccounts:true, units:{include:{leases:{where:{status:"ACTIVE"},include:{tenant:true,charges:{include:{allocations:true}}}}}} },
    orderBy:{name:"asc"}
  });
}
export async function requirePropertyAccess(user:{id:string;role:string},propertyId:string){
  return prisma.property.findFirst({ where:{id:propertyId,...(canSeeAll(user.role)?{}:{memberships:{some:{userId:user.id}}})}, include:{owner:true,bankAccounts:true,units:{include:{leases:{include:{tenant:true,charges:{include:{allocations:true}}}}}}} });
}
