import { LeaseStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { syncUnitOccupancyCache } from "@/lib/lease-lifecycle";
import { periodKeyForDate, syncLeaseCharges } from "@/lib/charge-automation";
import { closeLeaseFinancialVersionsAt } from "@/lib/lease-financial-versions";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: id } }, include: { unit: true } });
    if (!lease) throw new Error("Smlouva nebyla nalezena.");
    if (lease.terminatedOn || lease.cancelledAt) throw new Error("Ukončení tohoto nájemního vztahu již bylo zaznamenáno a nelze je tímto formulářem přepsat.");
    const now = new Date();
    const currentStatus = leaseStatusAt(lease, now);
    if (currentStatus === "ENDED") throw new Error("Tento nájemní vztah je již ukončený.");
    const form = await request.formData();
    if (text(form, "confirmed") !== "yes") throw new Error("Před ukončením potvrďte kontrolu dopadů.");

    if (currentStatus === "FUTURE") {
      const cancellationReason = text(form, "reason");
      const financialCleanup = await serializableTransaction(async (tx) => {
        const fresh = await tx.lease.findUnique({ where: { id: leaseId }, select: { terminatedOn: true, cancelledAt: true } });
        if (!fresh || fresh.terminatedOn || fresh.cancelledAt) throw new Error("Ukončení tohoto nájemního vztahu již bylo zaznamenáno.");
        await tx.lease.update({ where: { id: leaseId }, data: { cancelledAt: now, cancellationReason, status: LeaseStatus.ENDED } });
        const cleanup = await closeLeaseFinancialVersionsAt(tx, leaseId, now);
        await tx.rentChangeProposal.updateMany({ where: { leaseId, status: "CONFIRMED" }, data: { status: "CANCELLED" } });
        const chargeSync = await syncLeaseCharges(tx, leaseId, { now, fromPeriod: periodKeyForDate(lease.startDate), force: true });
        await syncUnitOccupancyCache(tx, lease.unitId, now);
        return { ...cleanup, chargeSync };
      });
      await audit(access.user.id, "LEASE_CANCELLED", "Lease", leaseId, { propertyId: id, unitId: lease.unitId, cancellationReason, financialCleanup }, id);
      return goWithMessage(request, `/nemovitosti/${id}/jednotky/${lease.unitId}`, "ok", "Budoucí smlouva byla zrušena. Nájemník i smlouva zůstávají v historii.");
    }

    const terminatedOn = dateValue(form, "terminatedOn", true)!;
    if (terminatedOn < lease.startDate) throw new Error("Datum ukončení nesmí být před začátkem smlouvy.");
    if (lease.endDate && terminatedOn > lease.endDate) throw new Error("Skutečné ukončení nemůže být po smluvním konci.");
    const terminationReason = text(form, "reason");
    const derivedStatus = leaseStatusAt({ ...lease, terminatedOn }, now) as LeaseStatus;

    const financialCleanup = await serializableTransaction(async (tx) => {
      const fresh = await tx.lease.findUnique({ where: { id: leaseId }, select: { terminatedOn: true, cancelledAt: true } });
      if (!fresh || fresh.terminatedOn || fresh.cancelledAt) throw new Error("Ukončení tohoto nájemního vztahu již bylo zaznamenáno.");
      await tx.lease.update({ where: { id: leaseId }, data: { terminatedOn, terminationReason, status: derivedStatus } });
      const cleanup = await closeLeaseFinancialVersionsAt(tx, leaseId, terminatedOn);
      await tx.rentChangeProposal.updateMany({ where: { leaseId, status: "CONFIRMED", effectiveFrom: { gt: terminatedOn } }, data: { status: "CANCELLED" } });
      const chargeSync = await syncLeaseCharges(tx, leaseId, { now, fromPeriod: periodKeyForDate(terminatedOn), force: true });
      await syncUnitOccupancyCache(tx, lease.unitId, now);
      return { ...cleanup, chargeSync };
    });
    await audit(access.user.id, "LEASE_TERMINATED", "Lease", leaseId, { propertyId: id, unitId: lease.unitId, terminatedOn: terminatedOn.toISOString(), terminationReason, financialCleanup }, id);
    const message = derivedStatus === LeaseStatus.ACTIVE ? "Ukončení bylo zaznamenáno k závěru zadaného dne. Do té doby je smlouva aktivní; budoucí účetní historie zůstává dohledatelná." : "Nájemní vztah byl ukončen. Nájemník i historie smlouvy zůstávají zachovány.";
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${lease.unitId}`, "ok", message);
  } catch (error) {
    return goWithMessage(request, `/smlouvy/${leaseId}/ukoncit`, "error", error instanceof Error ? error.message : "Nájemní vztah se nepodařilo ukončit.");
  }
}
