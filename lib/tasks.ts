import { TaskEntryKind, TaskPriority } from "@prisma/client";
import { prisma } from "./db";
import { money } from "./format";
import { openTaskStatuses } from "./operations";
import { overdueDebtCents } from "./charges";

function displayPeriod(period: string) {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return period;
  return `${Number(m[2])}/${m[1].slice(2)}`;
}

export async function ensureCollectionTask(input: {
  leaseId: string;
  period: string;
  outstandingCents: number;
  event: string;
  kind?: TaskEntryKind;
  priority?: TaskPriority;
}) {
  const lease = await prisma.lease.findUnique({
    where: { id: input.leaseId },
    include: { tenant: true, unit: { include: { property: true } } },
  });
  if (!lease) return null;
  const dedupeKey = `collection:${lease.id}:${input.period}`;
  const title = `Upomínka ${displayPeriod(input.period)} · ${lease.unit.label} · ${lease.tenant.name}`;
  const description = `Pracovní vlákno k neuhrazenému nájemnému. Aktuální evidovaný dluh při založení / poslední automatické aktualizaci: ${money(input.outstandingCents)}.`;
  let task = await prisma.task.findUnique({ where: { dedupeKey } });
  if (!task) {
    task = await prisma.task.create({
      data: {
        title,
        description,
        category: "COLLECTION",
        status: "IN_PROGRESS",
        priority: input.priority || "HIGH",
        propertyId: lease.unit.propertyId,
        unitId: lease.unitId,
        leaseId: lease.id,
        tenantId: lease.tenantId,
        assigneeId: lease.unit.property.managerId || undefined,
        dedupeKey,
        entries: { create: { kind: "SYSTEM", body: `Úkol byl automaticky založen kvůli neuhrazenému předpisu ${input.period}.` } },
      },
    });
    await prisma.auditLog.create({ data: { propertyId: lease.unit.propertyId, action: "COLLECTION_TASK_CREATED", entityType: "Task", entityId: task.id, details: { leaseId: lease.id, period: input.period, title } } });
  } else if (task.status === "DONE" || task.status === "CANCELLED") {
    task = await prisma.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS", closedAt: null, priority: input.priority || "HIGH", description } });
  }
  await prisma.taskEntry.create({ data: { taskId: task.id, kind: input.kind || "SYSTEM", body: input.event } });
  return task;
}

export async function resolveCollectionTasksIfSettled(leaseId: string) {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: { select: { propertyId: true } }, charges: { where: { active: true }, include: { allocations: true } } },
  });
  if (!lease) return 0;
  const overdue = lease.charges.reduce((sum, charge) => sum + overdueDebtCents(charge), 0);
  if (overdue > 0) return 0;
  const tasks = await prisma.task.findMany({ where: { leaseId, category: "COLLECTION", status: { in: openTaskStatuses } }, select: { id: true } });
  for (const task of tasks) {
    await prisma.$transaction([
      prisma.task.update({ where: { id: task.id }, data: { status: "DONE", closedAt: new Date() } }),
      prisma.taskEntry.create({ data: { taskId: task.id, kind: "SYSTEM", body: "Dluh byl po spárování plateb vyrovnán. Úkol byl automaticky uzavřen." } }),
      prisma.auditLog.create({ data: { propertyId: lease.unit.propertyId, action: "COLLECTION_TASK_RESOLVED", entityType: "Task", entityId: task.id, details: { leaseId } } }),
    ]);
  }
  return tasks.length;
}
