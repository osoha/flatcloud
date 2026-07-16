import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hasAllPropertyAccess } from "./auth";

const propertyInclude = {
  owner: true,
  communicationOwner: true,
  manager: true,
  ownerships: { include: { owner: true }, orderBy: { createdAt: "asc" as const } },
  bankAccounts: { include: { owner: true, connectedBy: true }, orderBy: { bankName: "asc" as const } },
  matchingRules: { orderBy: [{ priority: "asc" as const }, { createdAt: "asc" as const }] },
  memberships: { include: { user: true }, orderBy: { user: { name: "asc" as const } } },
  invitations: { include: { invitedBy: true }, orderBy: { createdAt: "desc" as const } },
  units: {
    orderBy: { label: "asc" as const },
    include: {
      ownerships: { include: { owner: true }, orderBy: { createdAt: "asc" as const } },
      userAccesses: true,
      leases: {
        orderBy: { startDate: "desc" as const },
        include: {
          tenant: true,
          paymentItems: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
          charges: { include: { allocations: true, items: true }, orderBy: { period: "desc" as const } },
        },
      },
    },
  },
} satisfies Prisma.PropertyInclude;

export async function accessibleProperties(user:{id:string;role:string;allProperties?:boolean}){
  const properties = await prisma.property.findMany({
    where: { ...(hasAllPropertyAccess(user) ? {} : { OR:[{memberships:{some:{userId:user.id}}},{units:{some:{userAccesses:{some:{userId:user.id}}}}}] }), active: true },
    include: propertyInclude,
    orderBy:{name:"asc"}
  });
  if(hasAllPropertyAccess(user)) return properties;
  return properties.map(property=>{
    const propertyWide=property.memberships.some(m=>m.userId===user.id);
    return propertyWide?property:{...property,units:property.units.filter(unit=>unit.userAccesses.some(access=>access.userId===user.id))};
  });
}

export async function requirePropertyAccess(user:{id:string;role:string;allProperties?:boolean},propertyId:string){
  const property=await prisma.property.findFirst({
    where:{id:propertyId,...(hasAllPropertyAccess(user)?{}:{OR:[{memberships:{some:{userId:user.id}}},{units:{some:{userAccesses:{some:{userId:user.id}}}}}]})},
    include: propertyInclude,
  });
  if(!property||hasAllPropertyAccess(user)) return property;
  const propertyWide=property.memberships.some(m=>m.userId===user.id);
  return propertyWide?property:{...property,units:property.units.filter(unit=>unit.userAccesses.some(access=>access.userId===user.id))};
}

export async function requireUnitAccess(user:{id:string;role:string;allProperties?:boolean},propertyId:string,unitId:string){
  return prisma.unit.findFirst({
    where:{id:unitId,propertyId,...(hasAllPropertyAccess(user)?{}:{OR:[{property:{memberships:{some:{userId:user.id}}}},{userAccesses:{some:{userId:user.id}}}]})},
    include:{ownerships:{include:{owner:true}},userAccesses:true,leases:{orderBy:{startDate:"desc"},include:{tenant:true,paymentItems:true,charges:{include:{allocations:{include:{transaction:true}},items:true},orderBy:{period:"desc"}}}}}
  });
}

export function unitAccessWhere(user:{id:string;role:string;allProperties?:boolean},propertyId:string){
  return {propertyId,...(hasAllPropertyAccess(user)?{}:{OR:[{property:{memberships:{some:{userId:user.id}}}},{userAccesses:{some:{userId:user.id}}}]})};
}
