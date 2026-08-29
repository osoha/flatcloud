import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { hasAllPropertyAccess } from "../auth";
type User = { id: string; role: string; allProperties?: boolean };
type DocumentPermission = "VIEW" | "EDIT" | "ADMIN";
/** Shared relational context chain used by both read and edit authorization. */
export function contextualDocumentAccessBranches(userId: string, permissions?: DocumentPermission[]): Prisma.DocumentWhereInput[] { const permission = permissions ? { permission: { in: permissions } } : {}; const ownUnit = { userAccesses: { some: { userId, ...permission } } }; return [{unit:ownUnit}, {lease:{unit:ownUnit}}, { task: { OR: [{ unit: ownUnit }, { lease: { unit: ownUnit } }] } }, { taskEntry: { task: { OR: [{ unit: ownUnit }, { lease: { unit: ownUnit } }] } } }]; }
function accessWhere(user: User, permissions?: DocumentPermission[]): Prisma.DocumentWhereInput { if (hasAllPropertyAccess(user)) return {deletedAt:null}; const permission = permissions ? { permission: { in: permissions } } : {}; return {deletedAt:null, OR: [{ property: { memberships: { some: { userId: user.id, ...permission } } } }, ...contextualDocumentAccessBranches(user.id, permissions)] }; }
export function documentAccessWhere(user: User) { return accessWhere(user); }
export function documentEditAccessWhere(user: User) { return accessWhere(user, ["EDIT", "ADMIN"]); }
export async function requireDocumentAccess(user: User, id: string) { return prisma.document.findFirst({ where: { id, ...documentAccessWhere(user) }, include: { fileAsset: true } }); }
export async function requireDocumentEditAccess(user: User, id: string) { return prisma.document.findFirst({ where: { id, ...documentEditAccessWhere(user) }, include: { fileAsset: true } }); }
