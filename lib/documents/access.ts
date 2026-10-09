import { Prisma } from "@prisma/client";
import { taskEntryVisibilityWhere } from "../task-access";
import { prisma } from "../db";
import { hasAllPropertyAccess } from "../auth";
import { unitReadScope } from "../bank-account-permissions";
type User = { id: string; role: string; allProperties?: boolean };
type DocumentPermission = "VIEW" | "EDIT" | "ADMIN";
/** Shared relational context chain used by both read and edit authorization. */
export function contextualDocumentAccessBranches(userId: string, permissions?: DocumentPermission[]): Prisma.DocumentWhereInput[] { const permission = permissions ? { permission: { in: permissions } } : {}; const ownUnit = { userAccesses: { some: { userId, ...permission } } }; return [{unit:ownUnit}, {lease:{unit:ownUnit}}, {propertyCost:{unit:ownUnit}}, { task: { OR: [{ unit: ownUnit }, { lease: { unit: ownUnit } }] } }, { taskEntry: { task: { OR: [{ unit: ownUnit }, { lease: { unit: ownUnit } }] } } }]; }
function accessWhere(user: User, permissions?: DocumentPermission[]): Prisma.DocumentWhereInput {
  if (hasAllPropertyAccess(user)) return {deletedAt:null};
  const permission = permissions ? { permission: { in: permissions } } : {};
  const unit: Prisma.UnitWhereInput = user.role === "OWNER_VIEWER" ? { OR: [
    { ownerships: { some: { owner: { userId: user.id }, shareBasisPoints: { gt: 0 } } } },
    { userAccesses: { some: { userId: user.id } } },
    { property: { memberships: { some: { userId: user.id, permission: { in: ["EDIT", "ADMIN"] } } } } },
    { ownerships: { none: {} }, property: { ownershipMode: "WHOLE_OBJECT", OR: [
      { ownerships: { some: { owner: { userId: user.id }, shareBasisPoints: { gt: 0 } } } },
      { ownerships: { none: {} }, owner: { userId: user.id } },
    ] } },
  ] } : unitReadScope(user);
  const task: Prisma.TaskWhereInput = { AND: [
    { OR: [{ unitId: null }, { unit }] },
    { OR: [{ leaseId: null }, { lease: { unit } }] },
  ] };
  return { deletedAt: null, AND: [
    { OR: [
      { property: { memberships: { some: { userId: user.id, ...permission } } } },
      ...contextualDocumentAccessBranches(user.id, permissions),
      ...(!permissions ? [
        { unit }, { lease: { unit } }, { propertyCost: { unit } },
        { task: { OR: [{ unit }, { lease: { unit } }] } },
        { taskEntry: { task: { OR: [{ unit }, { lease: { unit } }] } } },
        { unitId: null, leaseId: null, taskId: null, taskEntryId: null, propertyCostId: null, property: { units: { some: unit } } },
      ] : []),
    ] },
    // A VIEW grant to a shared house must never bypass the unit's own scope.
    { OR: [{ unitId: null }, { unit }] },
    { OR: [{ leaseId: null }, { lease: { unit } }] },
    { OR: [{ propertyCostId: null }, { propertyCost: { unitId: null } }, { propertyCost: { unit } }] },
    { OR: [{ taskId: null }, { task }] },
    { OR: [{ taskEntryId: null }, { taskEntry: { task } }] },
  ] };
}
/** Owner-facing outputs must never silently republish an internal attachment. */
export const ownerVisibleDocumentWhere: Prisma.DocumentWhereInput = { OR: [{ taskEntryId: null }, { taskEntry: { visibility: "OWNER_VISIBLE" } }] };
export function documentAccessWhere(user: User): Prisma.DocumentWhereInput { if (hasAllPropertyAccess(user)) return accessWhere(user); return { AND: [accessWhere(user), { OR: [{ taskEntryId: null }, { taskEntry: taskEntryVisibilityWhere(user) }] }] }; }
export function documentEditAccessWhere(user: User) { return { AND: [accessWhere(user, ["EDIT", "ADMIN"]), documentAccessWhere(user)] }; }
export async function requireDocumentAccess(user: User, id: string) { return prisma.document.findFirst({ where: { id, ...documentAccessWhere(user) }, include: { fileAsset: true } }); }
export async function requireDocumentEditAccess(user: User, id: string) { return prisma.document.findFirst({ where: { id, ...documentEditAccessWhere(user) }, include: { fileAsset: true } }); }
