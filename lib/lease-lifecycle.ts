import { LeaseStatus, Prisma, UnitStatus } from "@prisma/client";
import { prisma } from "./db";
import { currentLeaseForUnit, leaseIntervalsOverlap, leaseStatusAt, type LeaseLifecycleInput } from "./lease-lifecycle-core";

type Tx = Prisma.TransactionClient;

type OverlapInput = LeaseLifecycleInput & {
  unitId: string;
  excludeLeaseId?: string;
};

export async function assertNoLeaseOverlap(tx: Tx, input: OverlapInput) {
  const lockKey = `flatcloud:lease-unit:${input.unitId}`;
  await tx.$queryRaw<Array<{ locked: number }>>`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const rows = await tx.lease.findMany({
    where: {
      unitId: input.unitId,
      cancelledAt: null,
      ...(input.excludeLeaseId ? { id: { not: input.excludeLeaseId } } : {}),
    },
    include: { tenant: true, unit: true },
    orderBy: { startDate: "asc" },
  });
  const collision = rows.find((row) => leaseIntervalsOverlap(input, row));
  if (collision) {
    const end = collision.terminatedOn || collision.endDate;
    const range = `${collision.startDate.toLocaleDateString("cs-CZ")} – ${end ? end.toLocaleDateString("cs-CZ") : "neurčito"}`;
    throw new Error(`Jednotka ${collision.unit.label} už má v tomto období smlouvu ${collision.tenant.name} (${range}). Období smluv se nesmí překrývat.`);
  }
}

export async function syncLeaseCache(tx: Tx, leaseId: string, now = new Date()) {
  const lease = await tx.lease.findUnique({ where: { id: leaseId }, select: { id: true, status: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true } });
  if (!lease) return null;
  const derived = leaseStatusAt(lease, now) as LeaseStatus;
  if (lease.status !== derived) await tx.lease.update({ where: { id: leaseId }, data: { status: derived } });
  return derived;
}

export async function syncUnitOccupancyCache(tx: Tx, unitId: string, now = new Date()) {
  const unit = await tx.unit.findUnique({ where: { id: unitId }, select: { id: true, status: true } });
  if (!unit) return null;
  const leases = await tx.lease.findMany({
    where: { unitId },
    select: { startDate: true, endDate: true, terminatedOn: true, cancelledAt: true },
  });
  const derived = currentLeaseForUnit(leases, now) ? UnitStatus.OCCUPIED : UnitStatus.VACANT;
  if (unit.status !== derived) await tx.unit.update({ where: { id: unitId }, data: { status: derived } });
  return derived;
}

export async function syncLifecycleCaches(now = new Date()) {
  const leases = await prisma.lease.findMany({
    select: { id: true, unitId: true, status: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true },
  });
  const unitIds = new Set<string>();
  let leaseChanges = 0;
  let unitChanges = 0;
  await prisma.$transaction(async (tx) => {
    for (const lease of leases) {
      unitIds.add(lease.unitId);
      const derived = leaseStatusAt(lease, now) as LeaseStatus;
      if (lease.status !== derived) {
        await tx.lease.update({ where: { id: lease.id }, data: { status: derived } });
        leaseChanges += 1;
      }
    }
    for (const unitId of unitIds) {
      const unit = await tx.unit.findUnique({ where: { id: unitId }, select: { status: true } });
      if (!unit) continue;
      const rows = leases.filter((lease) => lease.unitId === unitId);
      const derived = currentLeaseForUnit(rows, now) ? UnitStatus.OCCUPIED : UnitStatus.VACANT;
      if (unit.status !== derived) {
        await tx.unit.update({ where: { id: unitId }, data: { status: derived } });
        unitChanges += 1;
      }
    }
  });
  return { leases: leases.length, units: unitIds.size, leaseChanges, unitChanges };
}
