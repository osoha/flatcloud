import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { canManageProperty, canSeeAll, currentUser } from "./auth";

export async function requirePortfolioManager() {
  const user = await currentUser();
  if (!user || !canSeeAll(user.role)) return null;
  return user;
}

export async function requireManagedProperty(propertyId: string) {
  const user = await currentUser();
  if (!user || !canManageProperty(user.role)) return null;
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(canSeeAll(user.role) ? {} : { memberships: { some: { userId: user.id } } }),
    },
    select: { id: true, name: true },
  });
  if (!property) return null;
  return { user, property };
}

export async function audit(userId: string, action: string, entityType: string, entityId?: string, details?: Prisma.InputJsonObject) {
  await prisma.auditLog.create({
    data: { userId, action, entityType, entityId, details },
  });
}
