import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hasAllPropertyAccess } from "./auth";


const publicUserSelect = {
  id: true, email: true, name: true, role: true, active: true, allProperties: true,
  phone: true, title: true, avatarMimeType: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;

const propertyInclude = {
  owner: true,
  communicationOwner: true,
  manager: { select: publicUserSelect },
  ownerships: { include: { owner: true }, orderBy: { createdAt: "asc" as const } },
  bankAccounts: { include: { owner: true, connectedBy: { select: publicUserSelect } }, orderBy: { bankName: "asc" as const } },
  matchingRules: { orderBy: [{ priority: "asc" as const }, { createdAt: "asc" as const }] },
  memberships: { include: { user: { select: publicUserSelect } }, orderBy: { user: { name: "asc" as const } } },
  invitations: { include: { invitedBy: { select: publicUserSelect } }, orderBy: { createdAt: "desc" as const } },
  units: {
    orderBy: { label: "asc" as const },
    include: {
      ownerships: { include: { owner: true, ownerBankAccount: true }, orderBy: { createdAt: "asc" as const } },
      userAccesses: true,
      leases: {
        orderBy: { startDate: "desc" as const },
        include: {
          tenant: true,
          ownerBankAccount: true,
          paymentItems: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
          charges: { include: { allocations: true, items: true }, orderBy: { period: "desc" as const } },
          notifications: { orderBy: { createdAt: "desc" as const }, take: 30 },
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
    include:{ownerships:{include:{owner:true,ownerBankAccount:true}},userAccesses:true,meters:{orderBy:[{active:"desc"},{type:"asc"},{createdAt:"asc"}],include:{readings:{orderBy:{readAt:"desc"},include:{lease:{include:{tenant:true}}}}}},leases:{orderBy:{startDate:"desc"},include:{tenant:true,ownerBankAccount:true,occupants:{orderBy:[{active:"desc"},{name:"asc"}]},paymentItems:true,charges:{include:{allocations:{include:{transaction:true}},items:true},orderBy:{period:"desc"}},notifications:{orderBy:{createdAt:"desc"},take:50}}}}
  });
}

export function unitAccessWhere(user:{id:string;role:string;allProperties?:boolean},propertyId:string){
  return {propertyId,...(hasAllPropertyAccess(user)?{}:{OR:[{property:{memberships:{some:{userId:user.id}}}},{userAccesses:{some:{userId:user.id}}}]})};
}

export function editableUnitWhere(user:{id:string;role:string;allProperties?:boolean},propertyId?:string){
  return {
    ...(propertyId?{propertyId}:{}),
    property:{active:true},
    ...(hasAllPropertyAccess(user)?{}:{OR:[
      {property:{memberships:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}}},
      {userAccesses:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}},
    ]}),
  } satisfies Prisma.UnitWhereInput;
}
