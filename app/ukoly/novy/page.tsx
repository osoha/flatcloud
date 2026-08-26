import { PropertyPermission, type Prisma } from "@prisma/client";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { TaskCreateForm } from "@/components/TaskCreateForm";
import { Flash, FormPage } from "@/components/FormUi";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ propertyId?: string; leaseId?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const propertyWhere: Prisma.PropertyWhereInput = hasAllPropertyAccess(user) ? {} : { memberships: { some: { userId: user.id, permission: { in: [PropertyPermission.EDIT, PropertyPermission.ADMIN] } } } };
  const properties = await prisma.property.findMany({
    where: { active: true, ...propertyWhere },
    orderBy: { name: "asc" },
    include: {
      manager: { select: { id: true, name: true } },
      memberships: { include: { user: { select: { id: true, name: true, active: true } } } },
      units: { orderBy: { label: "asc" }, include: { leases: { orderBy: { startDate: "desc" }, include: { tenant: { select: { id: true, name: true } } } } } },
    },
  });
  const globalManagers = await prisma.user.findMany({ where: { active: true, OR: [{ allProperties: true }, { role: { in: ["SUPER_ADMIN", "MANAGER"] } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const options = properties.map((property) => {
    const managerMap = new Map(globalManagers.map((manager) => [manager.id, manager]));
    if (property.manager) managerMap.set(property.manager.id, property.manager);
    for (const membership of property.memberships) if (membership.user.active && membership.permission !== "VIEW") managerMap.set(membership.user.id, { id: membership.user.id, name: membership.user.name });
    return { id: property.id, name: property.name, managerId: property.managerId, managers: [...managerMap.values()].sort((a,b)=>a.name.localeCompare(b.name,"cs")), units: property.units.map((unit) => ({ id: unit.id, label: unit.label, leases: unit.leases.map((lease) => ({ id: lease.id, tenantId: lease.tenantId, tenantName: lease.tenant.name, contractNumber: lease.contractNumber, status: leaseStatusAt(lease) })) })) };
  });

  return <Shell user={user}><FormPage title="Nový úkol" description="Založte provozní úkol nebo případ. Pokud úkol vzniká z detailu nemovitosti, objekt lze předvyplnit odkazem." backHref="/ukoly"><Flash ok={query.ok} error={query.error}/><TaskCreateForm properties={options} initialPropertyId={query.propertyId} initialLeaseId={query.leaseId}/></FormPage></Shell>;
}
