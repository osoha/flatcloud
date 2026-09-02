import { LeaseStatus, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { syncLeaseCharges } from "./charge-automation";
import { leaseStatusAt } from "./lease-lifecycle-core";
import { assertNoLeaseOverlap, syncUnitOccupancyCache } from "./lease-lifecycle";
import { assertUniqueVariableSymbol } from "./variable-symbol";

export const LEASE_NOT_CANCELLED_ERROR = "Smlouva není evidována jako zrušená budoucí smlouva.";
export const LEASE_TERMINATED_REACTIVATION_ERROR = "Smlouva má evidované skutečné ukončení. Obnovení zrušení nelze provést automaticky.";
export const LEASE_INVALID_INTERVAL_ERROR = "Smlouva má konec platnosti před začátkem. Nejprve opravte data smlouvy.";
export const LEASE_EXPIRED_REACTIVATION_ERROR = "Po odstranění zrušení by smlouva zůstala ukončená podle data platnosti. Upravte nejprve data smlouvy, nebo založte novou smlouvu.";
export const LEASE_RESTORE_REASON_REQUIRED_ERROR = "Důvod obnovení je povinný.";

export function leaseReactivationErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Zrušenou smlouvu se nepodařilo obnovit.";
  const safeExact = [LEASE_NOT_CANCELLED_ERROR, LEASE_TERMINATED_REACTIVATION_ERROR, LEASE_INVALID_INTERVAL_ERROR, LEASE_EXPIRED_REACTIVATION_ERROR, LEASE_RESTORE_REASON_REQUIRED_ERROR, "Smlouva nebyla nalezena."];
  if (safeExact.includes(error.message) || error.message.startsWith("Jednotka ") || error.message.startsWith("Variabilní symbol ")) return error.message;
  return "Zrušenou smlouvu se nepodařilo obnovit.";
}

type RestoreCancelledLeaseInput = {
  propertyId: string;
  leaseId: string;
  actor: { id: string };
  restoreReason: string;
  now?: Date;
};

export async function restoreCancelledLease(input: RestoreCancelledLeaseInput) {
  const restoreReason = input.restoreReason.trim();
  if (!restoreReason) throw new Error(LEASE_RESTORE_REASON_REQUIRED_ERROR);
  const now = input.now || new Date();

  return prisma.$transaction(async (tx) => {
    const lease = await tx.lease.findFirst({
      where: { id: input.leaseId, unit: { propertyId: input.propertyId } },
      include: { unit: true },
    });
    if (!lease) throw new Error("Smlouva nebyla nalezena.");
    if (!lease.cancelledAt) throw new Error(LEASE_NOT_CANCELLED_ERROR);
    if (lease.terminatedOn) throw new Error(LEASE_TERMINATED_REACTIVATION_ERROR);
    if (lease.endDate && lease.endDate < lease.startDate) throw new Error(LEASE_INVALID_INTERVAL_ERROR);

    const derivedStatus = leaseStatusAt({ ...lease, cancelledAt: null }, now) as LeaseStatus;
    if (derivedStatus !== LeaseStatus.ACTIVE && derivedStatus !== LeaseStatus.FUTURE) {
      throw new Error(LEASE_EXPIRED_REACTIVATION_ERROR);
    }

    await assertNoLeaseOverlap(tx, {
      unitId: lease.unitId,
      startDate: lease.startDate,
      endDate: lease.endDate,
      terminatedOn: null,
      cancelledAt: null,
      excludeLeaseId: lease.id,
    });
    if (lease.ownerBankAccountId) {
      await assertUniqueVariableSymbol(tx, lease.ownerBankAccountId, lease.variableSymbol, lease.id);
    }

    const previousCancelledAt = lease.cancelledAt;
    const previousCancellationReason = lease.cancellationReason;
    await tx.lease.update({
      where: { id: lease.id },
      data: { cancelledAt: null, cancellationReason: null, status: derivedStatus },
    });
    await syncUnitOccupancyCache(tx, lease.unitId, now);
    await syncLeaseCharges(tx, lease.id, {
      now,
      fromPeriod: lease.financialTrackingFromPeriod,
    });
    await tx.auditLog.create({
      data: {
        userId: input.actor.id,
        action: "LEASE_REACTIVATED",
        entityType: "Lease",
        entityId: lease.id,
        propertyId: input.propertyId,
        details: {
          unitId: lease.unitId,
          tenantId: lease.tenantId,
          previousCancelledAt: previousCancelledAt.toISOString(),
          ...(previousCancellationReason ? { previousCancellationReason } : {}),
          restoreReason,
          derivedLifecycleStatus: derivedStatus,
        } satisfies Prisma.InputJsonObject,
      },
    });
    return { leaseId: lease.id, unitId: lease.unitId, derivedStatus };
  });
}
