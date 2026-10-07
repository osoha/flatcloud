import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { canSeeAll, hasAllPropertyAccess } from "./auth";

export type BankActor = { id: string; role: string; allProperties?: boolean };
function managedProperty(user: BankActor): Prisma.PropertyWhereInput {
 return {memberships:{some:{userId:user.id,permission:{in:["EDIT","ADMIN"]}}}};
}
export function unitReadScope(user: BankActor): Prisma.UnitWhereInput {
  if (hasAllPropertyAccess(user)) return {};
  return { OR: [
    { ownerships: { some: { owner: { userId: user.id } } } },
    { userAccesses: { some: { userId: user.id } } },
    ...(user.role === "PROPERTY_MANAGER" ? [{ property: { memberships: { some: { userId: user.id } } } }] : []),
  ] };
}
export function bankEditableUnitScope(user: BankActor): Prisma.UnitWhereInput {
  if (canSeeAll(user.role)) return {};
  return { OR: [
    { ownerships: { some: { owner: { userId: user.id } } } },
    ...(user.role === "PROPERTY_MANAGER" ? [
      { property: { memberships: { some: { userId: user.id, permission: { in: ["EDIT", "ADMIN"] as ("EDIT" | "ADMIN")[] } } } } },
      { userAccesses: { some: { userId: user.id, permission: { in: ["EDIT", "ADMIN"] as ("EDIT" | "ADMIN")[] } } } },
    ] : []),
  ] };
}
export function bankAccountReadScope(user: BankActor): Prisma.OwnerBankAccountWhereInput {
  if (canSeeAll(user.role)) return {};
  return { OR: [
    { owner: { userId: user.id } },
    { createdById:user.id, owner:bankOwnerScope(user) },
    ...(user.role === "PROPERTY_MANAGER" ? [
      { propertyLinks: { some: { property: managedProperty(user) } } },
      { unitOwnerships: { some: { unit: bankEditableUnitScope(user) } } },
    ] : []),
  ] };
}
export function bankOwnerScope(user: BankActor): Prisma.OwnerWhereInput {
  if (canSeeAll(user.role)) return {};
  return { OR: [{ userId: user.id }, ...(user.role === "PROPERTY_MANAGER" ? [
    { unitOwnerships: { some: { unit: bankEditableUnitScope(user) } } },
    { properties: { some: managedProperty(user) } },
  ] : [])] };
}
export async function availableOwners(user: BankActor) {
  return prisma.owner.findMany({ where: { active: true, ...bankOwnerScope(user) }, include: { paymentAccounts: { where: { active: true, ...bankAccountReadScope(user) }, orderBy: { createdAt: "asc" } } }, orderBy: { name: "asc" } });
}
