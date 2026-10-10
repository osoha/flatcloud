import { Prisma } from "@prisma/client";
import { tenantAccessWhere } from "./access";
import { prisma } from "./db";
import { hasAllPropertyAccess } from "./auth";

type Actor = { id: string; role: string; allProperties?: boolean };
export type LeaseTenantDirectoryScope = "PROPERTY" | "MINE" | "AVAILABLE";
export const LEASE_TENANT_PAGE_SIZE = 40;

/** The same property-specific boundary is used by the picker and both mutations. */
export function leaseTenantAccessWhere(user: Actor, propertyId: string): Prisma.TenantWhereInput {
  return { AND: [
    ...(hasAllPropertyAccess(user) ? [] : [{ OR: [tenantAccessWhere(user), { createdById: user.id }] }]),
    { OR: [
      { createdById: user.id },
      { propertyLinks: { some: { propertyId } } },
      { leases: { some: { unit: { propertyId } } } },
      { leaseParties: { some: { lease: { unit: { propertyId } } } } },
    ] },
  ] };
}

export function tenantDirectoryWhere(user: Actor, propertyId: string, options: { scope?: LeaseTenantDirectoryScope; q?: string; free?: boolean; startDate?: Date; endDate?: Date; excludeLeaseId?: string } = {}): Prisma.TenantWhereInput {
  const filters: Prisma.TenantWhereInput[] = [leaseTenantAccessWhere(user, propertyId), { active: true }];
  if (options.scope === "MINE") filters.push({ createdById: user.id });
  if (!options.scope || options.scope === "PROPERTY" || options.scope === "MINE") filters.push({ OR: [
    { propertyLinks: { some: { propertyId } } }, { leases: { some: { unit: { propertyId } } } },
    { leaseParties: { some: { lease: { unit: { propertyId } } } } },
    ...(options.scope === "MINE" ? [{ propertyLinks: { none: {} }, leases: { none: {} }, leaseParties: { none: {} } }] : []),
  ] });
  const q = options.q?.trim().slice(0, 150);
  if (q) filters.push({ OR: ["name", "email", "communicationEmail", "phone"].map(field => ({ [field]: { contains: q, mode: "insensitive" } })) });
  if (options.free) {
    // A lease occupies whole calendar days. Stored dates can be midnight or
    // the canonical noon used by forms; include both ends of the chosen day.
    const start = new Date(`${(options.startDate || new Date()).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const end = options.endDate ? new Date(`${options.endDate.toISOString().slice(0, 10)}T23:59:59.999Z`) : undefined;
    const overlap: Prisma.LeaseWhereInput = {
      cancelledAt: null,
      ...(options.excludeLeaseId ? { id: { not: options.excludeLeaseId } } : {}),
      ...(end ? { startDate: { lte: end } } : {}),
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: start } }] }, { OR: [{ terminatedOn: null }, { terminatedOn: { gte: start } }] }],
    };
    filters.push({ leases: { none: overlap }, leaseParties: { none: { role: "CONTRACTING_PARTY", lease: overlap } } });
  }
  return { AND: filters };
}

export const directoryTenantSelect = { id: true, name: true, type: true, email: true, communicationEmail: true, phone: true, createdById: true, payerAccounts: true } satisfies Prisma.TenantSelect;
type DirectoryTenant = Prisma.TenantGetPayload<{ select: typeof directoryTenantSelect }>;
export function directoryTenantOption(tenant: DirectoryTenant): [string, string] {
  return [tenant.id, `${tenant.name} · ${tenant.communicationEmail || tenant.email || tenant.phone || (tenant.type === "COMPANY" ? "firma" : "osoba")}`];
}

export async function initialLeaseTenants(user: Actor, propertyId: string, selectedIds: string[] = [], scope: LeaseTenantDirectoryScope = "PROPERTY") {
  const [page, selected] = await Promise.all([
    prisma.tenant.findMany({ where: tenantDirectoryWhere(user, propertyId, {scope}), select: directoryTenantSelect, orderBy: [{ name: "asc" }, { id: "asc" }], take: LEASE_TENANT_PAGE_SIZE }),
    selectedIds.length ? prisma.tenant.findMany({ where: { AND: [leaseTenantAccessWhere(user, propertyId), { id: { in: selectedIds } }] }, select: directoryTenantSelect }) : Promise.resolve([]),
  ]);
  return [...new Map([...page, ...selected].map(tenant => [tenant.id, tenant])).values()];
}
