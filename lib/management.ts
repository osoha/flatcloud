import { Prisma, PropertyPermission } from "@prisma/client";
import { prisma } from "./db";
import { canSeeAll, hasAllPropertyAccess, currentUser } from "./auth";

const permissionRank: Record<PropertyPermission, number> = { VIEW: 1, EDIT: 2, ADMIN: 3 };

export async function requirePortfolioManager() {
  const user = await currentUser();
  if (!user || !canSeeAll(user.role)) return null;
  return user;
}

export async function propertyMembership(userId: string, propertyId: string) {
  return prisma.userProperty.findUnique({ where: { userId_propertyId: { userId, propertyId } } });
}

export async function hasPropertyPermission(user: { id: string; role: string }, propertyId: string, minimum: PropertyPermission) {
  if (hasAllPropertyAccess(user)) return true;
  const membership = await propertyMembership(user.id, propertyId);
  return Boolean(membership && permissionRank[membership.permission] >= permissionRank[minimum]);
}

async function requirePropertyPermission(propertyId: string, minimum: PropertyPermission) {
  const user = await currentUser();
  if (!user) return null;
  if (!(await hasPropertyPermission(user, propertyId, minimum))) return null;
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true } });
  return property ? { user, property } : null;
}

export function requireManagedProperty(propertyId: string) {
  return requirePropertyPermission(propertyId, PropertyPermission.EDIT);
}

export function requirePropertyAdmin(propertyId: string) {
  return requirePropertyPermission(propertyId, PropertyPermission.ADMIN);
}

export async function audit(userId: string | null, action: string, entityType: string, entityId?: string, details?: Prisma.InputJsonObject) {
  await prisma.auditLog.create({ data: { userId, action, entityType, entityId, details } });
}
