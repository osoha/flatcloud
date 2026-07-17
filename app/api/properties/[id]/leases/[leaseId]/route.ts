import { LeaseStatus, RentTiming, UnitStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { assertUniqueVariableSymbol, validateVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";

async function syncUnitOccupancy(tx: Prisma.TransactionClient, unitId: string) {
  const [unit, activeLease] = await Promise.all([
    tx.unit.findUnique({ where: { id: unitId }, select: { status: true } }),
    tx.lease.findFirst({ where: { unitId, status: LeaseStatus.ACTIVE }, select: { id: true } }),
  ]);
  if (!unit) return;
  if (activeLease && unit.status !== UnitStatus.OCCUPIED) {
    await tx.unit.update({ where: { id: unitId }, data: { status: UnitStatus.OCCUPIED } });
  } else if (!activeLease && unit.status === UnitStatus.OCCUPIED) {
    await tx.unit.update({ where: { id: unitId }, data: { status: UnitStatus.VACANT } });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: id } } });
    if (!existing) throw new Error("Smlouva nebyla nalezena.");

    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const tenantId = text(form, "tenantId", true)!;
    const statusRaw = text(form, "status") || "ACTIVE";
    const status = Object.values(LeaseStatus).includes(statusRaw as LeaseStatus) ? statusRaw as LeaseStatus : LeaseStatus.ACTIVE;
    const timingRaw = text(form, "rentTiming") || "ADVANCE";
    const rentTiming = Object.values(RentTiming).includes(timingRaw as RentTiming) ? timingRaw as RentTiming : RentTiming.ADVANCE;

    const [unit, tenant] = await Promise.all([
      prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, select: { id: true } }),
      prisma.tenant.findFirst({ where: { id: tenantId, OR: [{ leases: { some: { unit: { propertyId: id } } } }, { id: existing.tenantId }] }, select: { id: true } }),
    ]);
    if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
    if (!tenant) throw new Error("Vybraný nájemník nepatří k této nemovitosti.");

    const startDate = dateValue(form, "startDate", true)!;
    const termType = text(form, "termType") || "INDEFINITE";
    const endDate = termType === "FIXED" ? dateValue(form, "endDate", true)! : null;
    if (endDate && endDate < startDate) throw new Error("Konec smlouvy nesmí být před jejím začátkem.");
    const variableSymbol = validateVariableSymbol(text(form, "variableSymbol", true)!);

    const lease = await prisma.$transaction(async (tx) => {
      await assertUniqueVariableSymbol(tx, variableSymbol, leaseId);
      if (status === LeaseStatus.ACTIVE) {
        const collision = await tx.lease.findFirst({ where: { unitId, status: LeaseStatus.ACTIVE, id: { not: leaseId } }, select: { id: true } });
        if (collision) throw new Error("Vybraná jednotka už má jinou aktivní smlouvu.");
      }

      const updated = await tx.lease.update({
        where: { id: leaseId },
        data: {
          unitId,
          tenantId,
          contractNumber: text(form, "contractNumber"),
          startDate,
          endDate,
          dueDay: Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31),
          variableSymbol,
          rentTiming,
          rentCents: moneyToCents(form, "rent"),
          servicesCents: moneyToCents(form, "services"),
          depositCents: moneyToCents(form, "deposit"),
          note: text(form, "note"),
          remindersPausedUntil: dateValue(form, "remindersPausedUntil"),
          reminderPauseReason: text(form, "reminderPauseReason"),
          promisedPaymentDate: dateValue(form, "promisedPaymentDate"),
          promisedAmountCents: text(form, "promisedAmount") ? moneyToCents(form, "promisedAmount") : null,
          collectionNote: text(form, "collectionNote"),
          status,
        },
      });

      await syncUnitOccupancy(tx, unitId);
      if (existing.unitId !== unitId) await syncUnitOccupancy(tx, existing.unitId);
      return updated;
    });

    await audit(access.user.id, "LEASE_UPDATED", "Lease", lease.id, { propertyId: id, status, termType });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", "Smlouva byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/${leaseId}/upravit`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo upravit.");
  }
}
