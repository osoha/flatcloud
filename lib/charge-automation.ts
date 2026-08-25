import { ChargeCategory, LeaseStatus, Prisma, type RentTiming } from "@prisma/client";
import { prisma } from "./db";
import { periodDueDate, periodsBetween, periodStart } from "./period";

export const INDEFINITE_CHARGE_HORIZON_MONTHS = 12;

type Tx = Prisma.TransactionClient;
type SyncResult = { created: number; updated: number; skippedPaid: number; deactivated: number };

export function periodKeyForDate(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonthsUtc(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, Math.min(value.getUTCDate(), new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months + 1, 0)).getUTCDate()), 12));
}

function endOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function dayBefore(value: Date) {
  return new Date(value.getTime() - 86_400_000);
}

export function firstFutureAnniversary(startDate: Date, now = new Date()) {
  let next = addMonthsUtc(startDate, 12);
  while (next <= now) next = addMonthsUtc(next, 12);
  return next;
}

export async function replaceRecurringAmount(
  tx: Tx,
  leaseId: string,
  category: "RENT" | "SERVICES",
  amountCents: number,
  effectiveFrom: Date,
) {
  const current = await tx.leasePaymentItem.findFirst({
    where: { leaseId, category: category as ChargeCategory, active: true },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
  });
  if (current?.amountCents === amountCents) return false;

  if (current) {
    if (current.validFrom >= effectiveFrom) {
      if (amountCents > 0) {
        await tx.leasePaymentItem.update({ where: { id: current.id }, data: { amountCents, validFrom: effectiveFrom } });
        return true;
      }
      await tx.leasePaymentItem.update({ where: { id: current.id }, data: { active: false, validTo: dayBefore(effectiveFrom) } });
      return true;
    }
    await tx.leasePaymentItem.update({ where: { id: current.id }, data: { validTo: dayBefore(effectiveFrom) } });
  }
  if (amountCents > 0) {
    await tx.leasePaymentItem.create({
      data: {
        leaseId,
        name: category === "RENT" ? "Nájemné" : "Zálohy na služby",
        category: category as ChargeCategory,
        amountCents,
        validFrom: effectiveFrom,
        sortOrder: category === "RENT" ? 10 : 20,
      },
    });
  }
  return true;
}

export async function syncLeaseCharges(tx: Tx, leaseId: string, options: { now?: Date; fromPeriod?: string; force?: boolean } = {}): Promise<SyncResult> {
  const now = options.now || new Date();
  const lease = await tx.lease.findUnique({
    where: { id: leaseId },
    include: {
      paymentItems: { orderBy: [{ sortOrder: "asc" }, { validFrom: "asc" }] },
      charges: { include: { allocations: true, items: true } },
    },
  });
  const result: SyncResult = { created: 0, updated: 0, skippedPaid: 0, deactivated: 0 };
  if (!lease || (!lease.autoChargesEnabled && !options.force)) return result;

  const currentPeriod = periodKeyForDate(now);
  if (lease.status === LeaseStatus.ENDED) {
    for (const charge of lease.charges) {
      if (charge.period < currentPeriod || charge.allocations.length) continue;
      if (charge.active) {
        await tx.charge.update({ where: { id: charge.id }, data: { active: false } });
        result.deactivated += 1;
      }
    }
    return result;
  }

  const horizonBase = lease.startDate > now ? lease.startDate : now;
  const horizonEnd = lease.endDate || endOfMonth(addMonthsUtc(horizonBase, INDEFINITE_CHARGE_HORIZON_MONTHS - 1));
  const targetPeriods = periodsBetween(lease.startDate, horizonEnd);
  const targetSet = new Set(targetPeriods);
  const existingByPeriod = new Map(lease.charges.map((charge) => [charge.period, charge]));
  const fromPeriod = options.fromPeriod || periodKeyForDate(lease.startDate);

  for (const period of targetPeriods) {
    const start = periodStart(period);
    const monthEnd = endOfMonth(start);
    const items = lease.paymentItems.filter((item) => item.active && item.validFrom <= monthEnd && (!item.validTo || item.validTo >= start));
    const existing = existingByPeriod.get(period);
    if (!existing && period < fromPeriod) continue;
    if (!items.length) {
      if (existing?.active && !existing.allocations.length && period >= fromPeriod) {
        await tx.charge.update({ where: { id: existing.id }, data: { active: false } });
        result.deactivated += 1;
      }
      continue;
    }
    const amountCents = items.reduce((sum, item) => sum + item.amountCents, 0);
    const dueDate = periodDueDate(period, lease.dueDay, lease.rentTiming as RentTiming);
    if (!existing) {
      await tx.charge.create({
        data: {
          leaseId,
          period,
          dueDate,
          amountCents,
          items: { create: items.map((item) => ({ name: item.name, category: item.category, amountCents: item.amountCents })) },
        },
      });
      result.created += 1;
      continue;
    }
    if (period < fromPeriod) continue;
    if (existing.allocations.length) {
      result.skippedPaid += 1;
      continue;
    }
    const expectedItems = items.map((item) => `${item.name}|${item.category}|${item.amountCents}`).sort();
    const currentItems = existing.items.map((item) => `${item.name}|${item.category}|${item.amountCents}`).sort();
    const unchanged = existing.active && existing.amountCents === amountCents && existing.dueDate.getTime() === dueDate.getTime() && expectedItems.length === currentItems.length && expectedItems.every((value, index) => value === currentItems[index]);
    if (unchanged) continue;
    await tx.charge.update({
      where: { id: existing.id },
      data: {
        active: true,
        dueDate,
        amountCents,
        items: {
          deleteMany: {},
          create: items.map((item) => ({ name: item.name, category: item.category, amountCents: item.amountCents })),
        },
      },
    });
    result.updated += 1;
  }

  for (const charge of lease.charges) {
    if (targetSet.has(charge.period) || charge.allocations.length || !charge.active || charge.period < fromPeriod) continue;
    await tx.charge.update({ where: { id: charge.id }, data: { active: false } });
    result.deactivated += 1;
  }
  return result;
}

export async function runChargeAutomation(now = new Date()) {
  const leases = await prisma.lease.findMany({
    where: { autoChargesEnabled: true, status: { in: [LeaseStatus.ACTIVE, LeaseStatus.FUTURE] } },
    select: { id: true },
  });
  let generated = 0, updated = 0, skippedPaid = 0, indexed = 0;

  for (const row of leases) {
    const result = await prisma.$transaction(async (tx) => {
      let firstChangedPeriod: string | undefined;
      let lease = await tx.lease.findUnique({ where: { id: row.id }, include: { unit: { select: { propertyId: true } } } });
      if (!lease) return { created: 0, updated: 0, skippedPaid: 0, indexed: 0 };
      let indexCount = 0;
      while (lease.indexationEnabled && lease.indexationPercentBps && lease.nextIndexationAt && lease.nextIndexationAt <= now && indexCount < 10) {
        const effectiveFrom = lease.nextIndexationAt;
        const oldRent = lease.rentCents;
        const newRent = Math.round(oldRent * (10_000 + lease.indexationPercentBps) / 10_000);
        await replaceRecurringAmount(tx, lease.id, "RENT", newRent, effectiveFrom);
        const nextIndexationAt = addMonthsUtc(effectiveFrom, 12);
        await tx.lease.update({ where: { id: lease.id }, data: { rentCents: newRent, nextIndexationAt } });
        await tx.auditLog.create({
          data: {
            propertyId: lease.unit.propertyId,
            action: "LEASE_INDEXED",
            entityType: "Lease",
            entityId: lease.id,
            details: { oldRentCents: oldRent, newRentCents: newRent, percentBps: lease.indexationPercentBps, effectiveFrom: effectiveFrom.toISOString() },
          },
        });
        firstChangedPeriod ||= periodKeyForDate(effectiveFrom);
        indexCount += 1;
        lease = { ...lease, rentCents: newRent, nextIndexationAt };
      }
      const sync = await syncLeaseCharges(tx, lease.id, { now, fromPeriod: firstChangedPeriod || periodKeyForDate(now) });
      return { ...sync, indexed: indexCount };
    });
    generated += result.created;
    updated += result.updated;
    skippedPaid += result.skippedPaid;
    indexed += result.indexed;
  }
  return { leases: leases.length, generated, updated, skippedPaid, indexed, summary: `Předpisy: smlouvy ${leases.length}; nové ${generated}; aktualizované ${updated}; ponechané s úhradou ${skippedPaid}; indexace ${indexed}.` };
}
