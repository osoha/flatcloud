import { PropertyPermission, UserRole } from "@prisma/client";
import { prisma } from "./db";
import { invitationToken } from "./invitations";

export const permissionRank: Record<PropertyPermission, number> = { VIEW: 1, EDIT: 2, ADMIN: 3 };
export const roleRank: Record<UserRole, number> = { OWNER_VIEWER: 1, PROPERTY_MANAGER: 2, MANAGER: 3, SUPER_ADMIN: 4 };
export const strongerPermission = (a: PropertyPermission, b: PropertyPermission) => permissionRank[a] >= permissionRank[b] ? a : b;
export const strongerRole = (a: UserRole, b: UserRole) => roleRank[a] >= roleRank[b] ? a : b;

export type AccessScope = { role: UserRole; permission: PropertyPermission; allProperties: boolean; propertyIds: string[]; unitIds: string[] };
export type InvitationScopeLike = { email?: string; propertyId: string; propertyIds: string[]; unitIds: string[]; allProperties: boolean; role: UserRole };
export type InvitationCreateMode = "GLOBAL_EMAIL" | "PROPERTY_LOCAL";

export function canonicalizeAccessScope(scope: AccessScope): AccessScope {
  return scope.role === UserRole.MANAGER || scope.role === UserRole.SUPER_ADMIN ? { ...scope, allProperties: true, propertyIds: [], unitIds: [] } : scope;
}

export function isPropertyLocalInvitation(invitation: InvitationScopeLike, propertyId: string) {
  return !invitation.allProperties && invitation.role === UserRole.OWNER_VIEWER && invitation.unitIds.length === 0 && invitation.propertyId === propertyId
    && (invitation.propertyIds.length === 0 || invitation.propertyIds.length === 1 && invitation.propertyIds[0] === propertyId);
}

export function shouldRevokeInvitationOnCreate(invitation: InvitationScopeLike, mode: InvitationCreateMode, email: string, propertyId: string) {
  if (invitation.email?.toLowerCase() !== email.toLowerCase()) return false;
  return mode === "PROPERTY_LOCAL" ? isPropertyLocalInvitation(invitation, propertyId) : !isPropertyLocalInvitation(invitation, invitation.propertyId);
}

export async function grantUserAccess(user: { id: string; role: UserRole; allProperties: boolean }, scope: AccessScope) {
  scope = canonicalizeAccessScope(scope);
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

export async function rotateInvitation(input: { replaceId?: string; createMode?: InvitationCreateMode; email: string; name: string | null; propertyId: string; propertyIds: string[]; unitIds: string[]; allProperties: boolean; permission: PropertyPermission; role: UserRole; invitedById: string }) {
  const { token, tokenHash } = invitationToken();
  const scope = canonicalizeAccessScope(input);
  const invitation = await prisma.$transaction(async (tx) => {
    if (input.replaceId) {
      const replaced = await tx.userInvitation.updateMany({ where: { id: input.replaceId, status: "PENDING" }, data: { status: "REVOKED" } });
      if (replaced.count !== 1) throw new Error("Pozvánka už byla změněna nebo zrušena.");
    } else {
      const pending = await tx.userInvitation.findMany({ where: { email: input.email, status: "PENDING" }, select: { id: true, email: true, propertyId: true, propertyIds: true, unitIds: true, allProperties: true, role: true } });
      const replaceIds = pending.filter((candidate) => shouldRevokeInvitationOnCreate(candidate, input.createMode || "GLOBAL_EMAIL", input.email, input.propertyId)).map((candidate) => candidate.id);
      if (replaceIds.length) await tx.userInvitation.updateMany({ where: { id: { in: replaceIds }, status: "PENDING" }, data: { status: "REVOKED" } });
    }
    return tx.userInvitation.create({ data: { email: input.email, name: input.name, tokenHash, propertyId: input.propertyId, propertyIds: scope.propertyIds, unitIds: scope.unitIds, allProperties: scope.allProperties, permission: input.permission, role: scope.role, invitedById: input.invitedById, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
  });
  return { invitation, token };
}
