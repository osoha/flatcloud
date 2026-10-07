import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { canSeeAll } from "./auth";
import { unitReadScope } from "./bank-account-permissions";
import { compareUnitLabels } from "./unit-label-sort";


const publicUserSelect = {
  id: true, email: true, name: true, role: true, active: true, allProperties: true,
  phone: true, title: true, avatarMimeType: true, avatarChoice: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;

const propertyInclude = {
  owner: true,
  communicationOwner: true,
  manager: { select: publicUserSelect },
  ownerships: { include: { owner: true }, orderBy: { createdAt: "asc" as const } },
  bankAccounts: { include: { owner: true }, orderBy: { bankName: "asc" as const } },
  paymentAccounts: { where: { active: true }, include: { ownerBankAccount: { include: { owner: true } } }, orderBy: [{ primary: "desc" as const }, { createdAt: "asc" as const }] },
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
          charges: { include: { allocations: true, securityDepositOffsets: true, creditApplications: true, items: true }, orderBy: { period: "desc" as const } },
          notifications: { orderBy: { createdAt: "desc" as const }, take: 30 },
        },
      },
    },
  },
} satisfies Prisma.PropertyInclude;

export async function accessibleProperties(user:{id:string;role:string;allProperties?:boolean}, options: { includeInactive?: boolean } = {}){
  const includeInactive = Boolean(options.includeInactive && ["SUPER_ADMIN", "MANAGER", "PROPERTY_MANAGER"].includes(user.role));
  const properties = await prisma.property.findMany({
    where: { ...(canSeeAll(user.role) ? {} : { OR:[{memberships:{some:{userId:user.id}}},{units:{some:{userAccesses:{some:{userId:user.id}}}}},{units:{some:{ownerships:{some:{owner:{userId:user.id}}}}}}] }), ...(includeInactive ? {} : { active: true }) },
    include: propertyInclude,
    orderBy:{name:"asc"}
  });
  if(canSeeAll(user.role)) return properties.map(property=>({...property,units:property.units.sort(compareUnitLabels)}));
  return properties.map(property=>{
    const propertyWide=user.role==="PROPERTY_MANAGER" && property.memberships.some(m=>m.userId===user.id);
    return {...property,bankAccounts:propertyWide?property.bankAccounts:[],matchingRules:propertyWide?property.matchingRules:[],paymentAccounts:propertyWide?property.paymentAccounts:property.paymentAccounts.filter(link=>link.ownerBankAccount.owner.userId===user.id),units:(propertyWide?property.units:property.units.filter(unit=>unit.userAccesses.some(access=>access.userId===user.id)||unit.ownerships.some(row=>row.owner.userId===user.id))).sort(compareUnitLabels)};
  });
}

export async function requirePropertyAccess(user:{id:string;role:string;allProperties?:boolean},propertyId:string){
  const property=await prisma.property.findFirst({
    where:{id:propertyId,...(canSeeAll(user.role)?{}:{OR:[{memberships:{some:{userId:user.id}}},{units:{some:{userAccesses:{some:{userId:user.id}}}}},{units:{some:{ownerships:{some:{owner:{userId:user.id}}}}}}]})},
    include: propertyInclude,
  });
  if(!property) return property;
  if(canSeeAll(user.role)) return {...property,units:property.units.sort(compareUnitLabels)};
  const propertyWide=user.role==="PROPERTY_MANAGER" && property.memberships.some(m=>m.userId===user.id);
  return {...property,bankAccounts:propertyWide?property.bankAccounts:[],matchingRules:propertyWide?property.matchingRules:[],paymentAccounts:propertyWide?property.paymentAccounts:property.paymentAccounts.filter(link=>link.ownerBankAccount.owner.userId===user.id),units:(propertyWide?property.units:property.units.filter(unit=>unit.userAccesses.some(access=>access.userId===user.id)||unit.ownerships.some(row=>row.owner.userId===user.id))).sort(compareUnitLabels)};
}

export async function requireUnitAccess(user:{id:string;role:string;allProperties?:boolean},propertyId:string,unitId:string){
  return prisma.unit.findFirst({
    where:{id:unitId,propertyId,...unitReadScope(user)},
    include:{ownerships:{include:{owner:true,ownerBankAccount:true}},userAccesses:true,meters:{orderBy:[{active:"desc"},{type:"asc"},{createdAt:"asc"}],include:{tariffs:{orderBy:{validFrom:"asc"}},readings:{orderBy:{readAt:"desc"},include:{lease:{include:{tenant:true}},createdBy:{select:{name:true}}}}}},leases:{orderBy:{startDate:"desc"},include:{tenant:true,parties:{include:{tenant:{select:{id:true,name:true}}}},ownerBankAccount:true,securityDepositTerms:{orderBy:[{effectiveFrom:"asc"},{createdAt:"asc"}]},securityDepositMovements:{orderBy:[{effectiveAt:"asc"},{createdAt:"asc"}]},occupants:{orderBy:[{active:"desc"},{name:"asc"}]},paymentItems:true,charges:{include:{allocations:{include:{transaction:true}},securityDepositOffsets:true,creditApplications:true,items:true},orderBy:{period:"desc"}},notifications:{orderBy:{createdAt:"desc"},take:50}}}}
  });
}

export function unitAccessWhere(user:{id:string;role:string;allProperties?:boolean},propertyId:string){
  return {propertyId,...unitReadScope(user)};
}

export function leaseAccessWhere(user:{id:string;role:string;allProperties?:boolean}, propertyId?: string): Prisma.LeaseWhereInput {
  return { unit: { ...(propertyId ? {propertyId} : {}), ...unitReadScope(user) } };
}

export function taskAccessWhere(user: { id: string; role: string; allProperties?: boolean }): Prisma.TaskWhereInput {
  if (canSeeAll(user.role)) return {};
  return { OR: [
    { propertyId: null, OR: [{ createdById: user.id }, { assigneeId: user.id }, { members: { some: { userId: user.id } } }] },
    { property: { memberships: { some: { userId: user.id } } } },
    { unit: { userAccesses: { some: { userId: user.id } } } },
    { unitId: null, lease: { unit: { userAccesses: { some: { userId: user.id } } } } },
  ] };
}

export function bankTransactionAccessWhere(user: { id: string; role: string; allProperties?: boolean }): Prisma.BankTransactionWhereInput {
  if (canSeeAll(user.role)) return {};
  const visibleUnit = unitReadScope(user);
  return { OR: [
    ...(user.role === "PROPERTY_MANAGER" ? [{ bankAccount: { property: { memberships: { some: { userId: user.id } } } } }] : []),
    { suggestedLease: { unit: visibleUnit } },
    { allocations: { some: { charge: { lease: { unit: visibleUnit } } } } },
    { securityDepositReceipts: { some: { lease: { unit: visibleUnit } } } },
  ] };
}
export function tenantAccessWhere(user:{id:string;role:string;allProperties?:boolean}): Prisma.TenantWhereInput {
  if (canSeeAll(user.role)) return {};
  const visibleUnit = unitReadScope(user);
  return { OR: [
    ...(user.role === "PROPERTY_MANAGER" ? [{ propertyLinks: { some: { property: {memberships:{some:{userId:user.id}}} } } }] : []),
    { leases: { some: { unit: visibleUnit } } },
    { leaseParties: { some: { lease: { unit: visibleUnit } } } },
  ] };
}

export function editableUnitWhere(user:{id:string;role:string;allProperties?:boolean},propertyId?:string){
  return {
    ...(propertyId?{propertyId}:{}),
    property:{active:true},
    ...(canSeeAll(user.role)?{}:{OR:[
      {property:{memberships:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}}},
      {userAccesses:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}},
    ]}),
  } satisfies Prisma.UnitWhereInput;
}

export function hasManageableProperty(user: { id: string; role: string; allProperties?: boolean }, property: { memberships: Array<{ userId: string; permission: string }>; units: Array<{ userAccesses: Array<{ userId: string; permission: string }> }> }) {
  return canSeeAll(user.role) || property.memberships.some((membership) => membership.userId === user.id && ["EDIT", "ADMIN"].includes(membership.permission)) || property.units.some((unit) => unit.userAccesses.some((access) => access.userId === user.id && ["EDIT", "ADMIN"].includes(access.permission)));
}
