import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { leaseStatusAt } from "./lease-lifecycle-core";
import { tenantPortalContactMatches, portalEditableUnitWhere } from "./tenant-portal-access";
import { hasPropertyPermission } from "./management";

export type PortalMessageUser = { id: string; email: string; role: string; allProperties?: boolean };

/** Only current contracting parties receive operational information. Payers keep their financial view. */
export async function portalMessageLease(user: PortalMessageUser, tenantId: string, leaseId: string, preview = false, db: Prisma.TransactionClient = prisma) {
  if (!preview) {
    const access = await db.tenantPortalAccess.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId } }, select: { tenant: { select: { email: true, communicationEmail: true } } } });
    if (!access || !tenantPortalContactMatches(user.email, access.tenant)) return null;
  }
  const lease = await db.lease.findFirst({
    where: { id: leaseId, OR: [{ tenantId }, { parties: { some: { tenantId, role: "CONTRACTING_PARTY" } } }], ...(preview ? { unit: portalEditableUnitWhere(user) } : {}) },
    select: { id: true, tenantId: true, unitId: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true, unit: { select: { propertyId: true } } },
  });
  return lease && leaseStatusAt(lease) === "ACTIVE" ? lease : null;
}

export function portalAnnouncementAudience(leaseId: string, propertyId: string): Prisma.AnnouncementWhereInput {
  return { audiences: { some: { OR: [
    { kind: "TENANT_LEASE", leaseId },
    { kind: "TENANT_PROPERTY", propertyId },
  ] } } };
}

export function portalTaskAudience(tenantId: string, leaseId: string, scope: { unitId: string; propertyId: string }): Prisma.TaskWhereInput {
  return { tenantId, leaseId, ...scope, tenantPortalRequest: false, tenantPortalPublishedAt: { not: null }, tenantPortalTitle: { not: null }, tenantPortalBody: { not: null } };
}

export async function tenantPortalMessages(user: PortalMessageUser, tenantId: string, leaseId: string, preview = false) {
  const lease = await portalMessageLease(user, tenantId, leaseId, preview);
  if (!lease) return null;
  const [tasks, announcements] = await Promise.all([
    prisma.task.findMany({
      where: portalTaskAudience(tenantId, leaseId, { unitId: lease.unitId, propertyId: lease.unit.propertyId }),
      select: { id: true, tenantPortalTitle: true, tenantPortalBody: true, tenantPortalPublishedAt: true, status: true, dueAt: true, tenantPortalPublishedBy: { select: { name: true } }, userStates: { where: { userId: preview ? "" : user.id }, select: { lastReadAt: true, tenantConfirmedAt: true } } },
      orderBy: [{ dueAt: "asc" }, { tenantPortalPublishedAt: "desc" }],
    }),
    prisma.announcement.findMany({
      where: { ...portalAnnouncementAudience(leaseId, lease.unit.propertyId), active: true, startsAt: { lte: new Date() } },
      select: { id: true, title: true, body: true, severity: true, startsAt: true, expiresAt: true, active: true, updatedAt: true, createdBy: { select: { name: true } }, userStates: { where: { userId: preview ? "" : user.id }, select: { readAt: true, dismissedAt: true } } },
      orderBy: [{ severity: "desc" }, { startsAt: "desc" }],
    }),
  ]);
  return { tasks, announcements };
}

/** Publication authority never follows a read-only allProperties flag. */
export async function canPublishLeaseMessage(user: { id: string; role: string; allProperties?: boolean }, leaseId: string) {
  return prisma.lease.findFirst({ where: { id: leaseId, unit: portalEditableUnitWhere(user) }, include: { parties: { select: { tenantId: true, role: true } }, unit: { select: { propertyId: true } } } });
}

export async function canPublishPropertyMessage(user: { id: string; role: string; allProperties?: boolean }, propertyId: string) {
  return await hasPropertyPermission({ id: user.id, role: user.role }, propertyId, "EDIT") && Boolean(await prisma.property.findFirst({ where: { id: propertyId, active: true }, select: { id: true } }));
}

export function tenantPublicationText(form: FormData) {
  const tenantPortalTitle = String(form.get("tenantPortalTitle") || "").trim();
  const tenantPortalBody = String(form.get("tenantPortalBody") || "").trim();
  if (!tenantPortalTitle || tenantPortalTitle.length > 140 || !tenantPortalBody || tenantPortalBody.length > 5000) throw new Error("Vyplňte název pro nájemníka do 140 a sdělení do 5 000 znaků.");
  return { tenantPortalTitle, tenantPortalBody };
}

export async function validateTaskPublication(user: { id: string; role: string; allProperties?: boolean }, task: { leaseId: string | null; tenantId: string | null; propertyId: string | null; unitId: string | null; tenantPortalRequest?: boolean }) {
  if (!task.leaseId || !task.tenantId || task.tenantPortalRequest) throw new Error("Zveřejnění vyžaduje úkol pro konkrétního nájemníka a jeho smlouvu. Hlášení z portálu mají vlastní přehled.");
  const lease = await canPublishLeaseMessage(user, task.leaseId);
  if (!lease || leaseStatusAt(lease) !== "ACTIVE" || lease.unitId !== task.unitId || lease.unit.propertyId !== task.propertyId || !(lease.tenantId === task.tenantId || lease.parties.some(party => party.tenantId === task.tenantId && party.role === "CONTRACTING_PARTY"))) throw new Error("K publikování pro tohoto nájemníka nemáte oprávnění nebo jeho smlouva není aktuální.");
  return lease;
}

export async function tenantAnnouncementManagerScope(user: { id: string; role: string; allProperties?: boolean }) {
  const [properties, leaseRows] = await Promise.all([
    prisma.property.findMany({ where: { active: true, ...(["SUPER_ADMIN", "MANAGER"].includes(user.role) ? {} : { memberships: { some: { userId: user.id, permission: { in: ["EDIT", "ADMIN"] } } } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lease.findMany({ where: { unit: portalEditableUnitWhere(user) }, include: { tenant: { select: { name: true } }, unit: { select: { label: true, propertyId: true, property: { select: { name: true } } } } }, orderBy: { startDate: "desc" } }),
  ]);
  const propertyIds = properties.map(property => property.id), leaseIds = leaseRows.map(lease => lease.id);
  const scopedAudience: Prisma.AnnouncementAudienceWhereInput = { OR: [ { kind: "TENANT_PROPERTY", propertyId: { in: propertyIds } }, { kind: "TENANT_LEASE", leaseId: { in: leaseIds } } ] };
  // Require every audience to be manageable; a mixed staff/tenant announcement cannot be edited here.
  const where: Prisma.AnnouncementWhereInput = { audiences: { some: scopedAudience, every: scopedAudience } };
  return { properties, leases: leaseRows.filter(lease => leaseStatusAt(lease) === "ACTIVE"), where };
}
