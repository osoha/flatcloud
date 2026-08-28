import { PropertyPermission, UserRole } from "@prisma/client";
import { prisma } from "./db";
import { invitationToken } from "./invitations";

export const permissionRank: Record<PropertyPermission, number> = { VIEW: 1, EDIT: 2, ADMIN: 3 };
export const roleRank: Record<UserRole, number> = { OWNER_VIEWER: 1, PROPERTY_MANAGER: 2, MANAGER: 3, SUPER_ADMIN: 4 };
export const strongerPermission = (a: PropertyPermission, b: PropertyPermission) => permissionRank[a] >= permissionRank[b] ? a : b;
export const strongerRole = (a: UserRole, b: UserRole) => roleRank[a] >= roleRank[b] ? a : b;

export type AccessScope = { role: UserRole; permission: PropertyPermission; allProperties: boolean; propertyIds: string[]; unitIds: string[] };

export async function grantUserAccess(user: { id: string; role: UserRole; allProperties: boolean }, scope: AccessScope) {
  let changed = roleRank[scope.role] > roleRank[user.role] || scope.allProperties && !user.allProperties;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: strongerRole(user.role, scope.role), allProperties: user.allProperties || scope.allProperties || scope.role === UserRole.MANAGER || scope.role === UserRole.SUPER_ADMIN } });
    if (!scope.allProperties) for (const propertyId of scope.propertyIds) {
      const current = await tx.userProperty.findUnique({ where: { userId_propertyId: { userId: user.id, propertyId } } });
      if (!current || permissionRank[current.permission] < permissionRank[scope.permission]) changed = true;
      await tx.userProperty.upsert({ where: { userId_propertyId: { userId: user.id, propertyId } }, update: { permission: current ? strongerPermission(current.permission, scope.permission) : scope.permission }, create: { userId: user.id, propertyId, permission: scope.permission } });
    }
    if (!scope.allProperties) for (const unitId of scope.unitIds) {
      const current = await tx.userUnit.findUnique({ where: { userId_unitId: { userId: user.id, unitId } } });
      if (!current || permissionRank[current.permission] < permissionRank[scope.permission]) changed = true;
      await tx.userUnit.upsert({ where: { userId_unitId: { userId: user.id, unitId } }, update: { permission: current ? strongerPermission(current.permission, scope.permission) : scope.permission }, create: { userId: user.id, unitId, permission: scope.permission } });
    }
  });
  return { changed };
}

export async function rotateInvitation(input: { replaceId?: string; email: string; name: string | null; propertyId: string; propertyIds: string[]; unitIds: string[]; allProperties: boolean; permission: PropertyPermission; role: UserRole; invitedById: string }) {
  const { token, tokenHash } = invitationToken();
  const invitation = await prisma.$transaction(async (tx) => {
    if (input.replaceId) await tx.userInvitation.updateMany({ where: { id: input.replaceId, status: "PENDING" }, data: { status: "REVOKED" } });
    else await tx.userInvitation.updateMany({ where: { email: input.email, status: "PENDING" }, data: { status: "REVOKED" } });
    return tx.userInvitation.create({ data: { email: input.email, name: input.name, tokenHash, propertyId: input.propertyId, propertyIds: input.propertyIds, unitIds: input.unitIds, allProperties: input.allProperties, permission: input.permission, role: input.role, invitedById: input.invitedById, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
  });
  return { invitation, token };
}
