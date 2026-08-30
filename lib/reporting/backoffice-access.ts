import { Prisma, ReportingGroupPermission } from "@prisma/client";
import { businessDateKey, businessDateKeyToInstant, type BusinessDateKey } from "../calendar";
import { prisma } from "../db";
import { serializableTransaction } from "../serializable";
import { validateReportingGroupPropertyIntervals } from "./group-property-intervals";

export type ReportingBackofficeActor = { id: string; role: string };
export type ReportingBackofficePermission = ReportingGroupPermission | "SUPER_ADMIN" | "NONE";
export const reportingGroupPermissions = Object.values(ReportingGroupPermission);
export class ReportingBackofficeError extends Error {
  constructor(message: string) { super(message); this.name = "ReportingBackofficeError"; }
}
export function reportingBackofficeErrorMessage(error: unknown) {
  if (error instanceof ReportingBackofficeError) return error.message;
  console.error("Reporting backoffice operation failed.", error);
  return "Operaci se nepodařilo provést.";
}
function domainError(message: string): never { throw new ReportingBackofficeError(message); }

export function effectiveBackofficePermission(role: string, membership?: ReportingGroupPermission | string | null): ReportingBackofficePermission {
  if (role === "SUPER_ADMIN") return "SUPER_ADMIN";
  return reportingGroupPermissions.includes(membership as ReportingGroupPermission) ? membership as ReportingGroupPermission : "NONE";
}
export function canReadReportingBackoffice(permission: ReportingBackofficePermission) { return ["EDIT", "ADMIN", "SUPER_ADMIN"].includes(permission); }
export function canAdminReportingBackoffice(permission: ReportingBackofficePermission) { return ["ADMIN", "SUPER_ADMIN"].includes(permission); }
export function canCreateReportingGroup(role: string) { return role === "SUPER_ADMIN"; }
export function reportingBackofficeNavVisible(role: string, memberships: Array<{ permission: string }> = []) { return role === "SUPER_ADMIN" || memberships.some((row) => row.permission === "EDIT" || row.permission === "ADMIN"); }

async function storedActor(tx: Prisma.TransactionClient, actor: ReportingBackofficeActor) {
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true, active: true } });
  if (!user?.active) domainError("Přihlášený uživatel není aktivní.");
  return user;
}
export async function backofficePermissionForGroup(actor: ReportingBackofficeActor, groupId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, active: true, reportingGroupMemberships: { where: { reportingGroupId: groupId }, select: { permission: true }, take: 1 } } });
  if (!user?.active) return "NONE" as const;
  return effectiveBackofficePermission(user.role, user.reportingGroupMemberships[0]?.permission);
}
export async function requireReportingBackoffice(actor: ReportingBackofficeActor, groupId: string, minimum: "EDIT" | "ADMIN", tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const permission = await backofficePermissionForGroup(actor, groupId, tx);
  const allowed = minimum === "ADMIN" ? canAdminReportingBackoffice(permission) : canReadReportingBackoffice(permission);
  if (!allowed) domainError(minimum === "ADMIN" ? "Nemáte oprávnění spravovat tuto reportovací skupinu." : "Nemáte přístup k přípravě kvartálních reportů.");
  return permission;
}
export async function hasReportingBackofficeAccess(actor: ReportingBackofficeActor) {
  if (actor.role === "SUPER_ADMIN") return true;
  return Boolean(await prisma.reportingGroupMember.count({ where: { userId: actor.id, permission: { in: ["EDIT", "ADMIN"] } } }));
}
export async function listReportingBackofficeGroups(actor: ReportingBackofficeActor) {
  const where = actor.role === "SUPER_ADMIN" ? {} : { members: { some: { userId: actor.id, permission: { in: ["EDIT", "ADMIN"] as ReportingGroupPermission[] } } } };
  const groups = await prisma.reportingGroup.findMany({ where, select: { id: true, name: true, description: true, active: true, properties: { select: { propertyId: true } }, members: { where: { userId: actor.id }, select: { permission: true }, take: 1 }, quarterlyReports: { select: { year: true, quarter: true, revision: true, status: true }, orderBy: [{ year: "desc" }, { quarter: "desc" }, { revision: "desc" }], take: 1 } }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return groups.map((group) => ({ ...group, propertyCount: new Set(group.properties.map((row) => row.propertyId)).size, effectivePermission: effectiveBackofficePermission(actor.role, group.members[0]?.permission), latestReport: group.quarterlyReports[0] || null }));
}
export function parseReportingBusinessDate(value: string, required = true) {
  const raw = value.trim(); if (!raw) { if (required) domainError("Datum je povinné."); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) domainError("Datum musí být ve formátu YYYY-MM-DD.");
  const date = businessDateKeyToInstant(raw as BusinessDateKey);
  if (businessDateKey(date) !== raw) domainError("Datum není platný pražský kalendářní den.");
  return date;
}
function auditData(groupId: string, extra: Prisma.InputJsonObject = {}) { return { groupId, ...extra } satisfies Prisma.InputJsonObject; }

export async function createReportingGroup(input: { name: string; description?: string | null; active: boolean }, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => { const user = await storedActor(tx, actor); if (!canCreateReportingGroup(user.role)) domainError("Novou reportovací skupinu může vytvořit pouze hlavní administrátor."); const group = await tx.reportingGroup.create({ data: input }); await tx.auditLog.create({ data: { userId: user.id, action: "REPORTING_GROUP_CREATED", entityType: "ReportingGroup", entityId: group.id, details: auditData(group.id, { active: group.active }) } }); return group; });
}
export async function updateReportingGroup(groupId: string, input: { name: string; description?: string | null; active: boolean }, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => { await storedActor(tx, actor); await requireReportingBackoffice(actor, groupId, "ADMIN", tx); const group = await tx.reportingGroup.update({ where: { id: groupId }, data: input }); await tx.auditLog.create({ data: { userId: actor.id, action: "REPORTING_GROUP_UPDATED", entityType: "ReportingGroup", entityId: group.id, details: auditData(group.id, { active: group.active }) } }); return group; });
}
export async function addReportingGroupMember(groupId: string, userId: string, permission: ReportingGroupPermission, actor: ReportingBackofficeActor) {
  try {
    return await serializableTransaction(async (tx) => { await storedActor(tx, actor); await requireReportingBackoffice(actor, groupId, "ADMIN", tx); const user = await tx.user.findFirst({ where: { id: userId, active: true }, select: { id: true } }); if (!user) domainError("Vybraný aktivní uživatel neexistuje."); const member = await tx.reportingGroupMember.create({ data: { reportingGroupId: groupId, userId, permission } }); await tx.auditLog.create({ data: { userId: actor.id, action: "REPORTING_GROUP_MEMBER_ADDED", entityType: "ReportingGroupMember", entityId: `${groupId}:${userId}`, details: auditData(groupId, { userId, permission }) } }); return member; });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") domainError("Uživatel už je členem této reportovací skupiny.");
    throw error;
  }
}
export async function changeReportingGroupMember(groupId: string, userId: string, action: "update" | "remove", permission: ReportingGroupPermission | null, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => { await storedActor(tx, actor); await requireReportingBackoffice(actor, groupId, "ADMIN", tx); const key = { reportingGroupId_userId: { reportingGroupId: groupId, userId } }; if (action === "remove") { await tx.reportingGroupMember.delete({ where: key }); await tx.auditLog.create({ data: { userId: actor.id, action: "REPORTING_GROUP_MEMBER_REMOVED", entityType: "ReportingGroupMember", entityId: `${groupId}:${userId}`, details: auditData(groupId, { userId }) } }); return; } if (!permission) domainError("Oprávnění je povinné."); const member = await tx.reportingGroupMember.update({ where: key, data: { permission } }); await tx.auditLog.create({ data: { userId: actor.id, action: "REPORTING_GROUP_MEMBER_UPDATED", entityType: "ReportingGroupMember", entityId: `${groupId}:${userId}`, details: auditData(groupId, { userId, permission }) } }); return member; });
}
async function validatedIntervals(tx: Prisma.TransactionClient, groupId: string, propertyId: string, replacement?: { id: string; effectiveFrom: Date; effectiveTo: Date | null }, addition?: { effectiveFrom: Date; effectiveTo: Date | null }) {
  const rows = await tx.reportingGroupProperty.findMany({ where: { reportingGroupId: groupId, propertyId }, select: { id: true, effectiveFrom: true, effectiveTo: true } });
  const proposed = rows.map((row) => replacement?.id === row.id ? replacement : row); if (addition) proposed.push({ id: "new", ...addition });
  try { validateReportingGroupPropertyIntervals(proposed); } catch (error) {
    if (error instanceof Error && error.message.includes("ends before")) domainError("Datum začátku intervalu nesmí být po datu konce.");
    if (error instanceof Error && error.message.includes("must not overlap")) domainError("Intervaly stejné nemovitosti se nesmí překrývat.");
    throw error;
  }
  return rows;
}
export async function addReportingGroupPropertyInterval(groupId: string, input: { propertyId: string; effectiveFrom: Date; effectiveTo: Date | null }, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => { await storedActor(tx, actor); await requireReportingBackoffice(actor, groupId, "ADMIN", tx); if (!await tx.property.findUnique({ where: { id: input.propertyId }, select: { id: true } })) domainError("Vybraná nemovitost neexistuje."); await validatedIntervals(tx, groupId, input.propertyId, undefined, input); const interval = await tx.reportingGroupProperty.create({ data: { reportingGroupId: groupId, ...input } }); await tx.auditLog.create({ data: { userId: actor.id, action: "REPORTING_GROUP_PROPERTY_ADDED", entityType: "ReportingGroupProperty", entityId: interval.id, details: auditData(groupId, { propertyId: input.propertyId, intervalId: interval.id, effectiveFrom: businessDateKey(input.effectiveFrom), effectiveTo: input.effectiveTo ? businessDateKey(input.effectiveTo) : null }) } }); return interval; });
}
export async function changeReportingGroupPropertyInterval(groupId: string, intervalId: string, action: "update" | "end", input: { effectiveFrom?: Date; effectiveTo: Date | null }, actor: ReportingBackofficeActor) {
  return serializableTransaction(async (tx) => { await storedActor(tx, actor); await requireReportingBackoffice(actor, groupId, "ADMIN", tx); const current = await tx.reportingGroupProperty.findFirst({ where: { id: intervalId, reportingGroupId: groupId } }); if (!current) domainError("Interval nebyl nalezen."); const effectiveFrom = action === "end" ? current.effectiveFrom : input.effectiveFrom!; const replacement = { id: intervalId, effectiveFrom, effectiveTo: input.effectiveTo }; await validatedIntervals(tx, groupId, current.propertyId, replacement); const interval = await tx.reportingGroupProperty.update({ where: { id: intervalId }, data: { effectiveFrom, effectiveTo: input.effectiveTo } }); const auditAction = action === "end" ? "REPORTING_GROUP_PROPERTY_ENDED" : "REPORTING_GROUP_PROPERTY_UPDATED"; await tx.auditLog.create({ data: { userId: actor.id, action: auditAction, entityType: "ReportingGroupProperty", entityId: interval.id, details: auditData(groupId, { propertyId: current.propertyId, intervalId, effectiveFrom: businessDateKey(effectiveFrom), effectiveTo: input.effectiveTo ? businessDateKey(input.effectiveTo) : null }) } }); return interval; });
}
