import { LeaseStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { syncUnitOccupancyCache } from "@/lib/lease-lifecycle";
import { periodKeyForDate, syncLeaseCharges } from "@/lib/charge-automation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: id } }, include: { unit: true } });
    if (!lease) throw new Error("Smlouva nebyla nalezena.");
    const now = new Date();
    const currentStatus = leaseStatusAt(lease, now);
    if (currentStatus === "ENDED") throw new Error("Tento nájemní vztah je již ukončený.");
    const form = await request.formData();
    if (text(form, "confirmed") !== "yes") throw new Error("Před ukončením potvrďte kontrolu dopadů.");

    if (currentStatus === "FUTURE") {
      const cancellationReason = text(form, "reason");
      await prisma.$transaction(async (tx) => {
        await tx.lease.update({ where: { id: leaseId }, data: { cancelledAt: now, cancellationReason, status: LeaseStatus.ENDED } });
        await tx.rentChangeProposal.updateMany({ where: { leaseId, status: "CONFIRMED" }, data: { status: "CANCELLED" } });
        await syncLeaseCharges(tx, leaseId, { now, fromPeriod: periodKeyForDate(lease.startDate), force: true });
        await syncUnitOccupancyCache(tx, lease.unitId, now);
      });
      await audit(access.user.id, "LEASE_CANCELLED", "Lease", leaseId, { propertyId: id, unitId: lease.unitId, cancellationReason }, id);
      return goWithMessage(request, `/nemovitosti/${id}/jednotky/${lease.unitId}`, "ok", "Budoucí smlouva byla zrušena. Nájemník i smlouva zůstávají v historii.");
    }

    const terminatedOn = dateValue(form, "terminatedOn", true)!;
    if (terminatedOn < lease.startDate) throw new Error("Datum ukončení nesmí být před začátkem smlouvy.");
    if (lease.endDate && terminatedOn > lease.endDate) throw new Error("Skutečné ukončení nemůže být po smluvním konci.");
    const terminationReason = text(form, "reason");
    const derivedStatus = leaseStatusAt({ ...lease, terminatedOn }, now) as LeaseStatus;

    await prisma.$transaction(async (tx) => {
      await tx.lease.update({ where: { id: leaseId }, data: { terminatedOn, terminationReason, status: derivedStatus } });
      await tx.rentChangeProposal.updateMany({ where: { leaseId, status: "CONFIRMED", effectiveFrom: { gt: terminatedOn } }, data: { status: "CANCELLED" } });
      await syncLeaseCharges(tx, leaseId, { now, fromPeriod: periodKeyForDate(terminatedOn), force: true });
      await syncUnitOccupancyCache(tx, lease.unitId, now);
    });
    await audit(access.user.id, "LEASE_TERMINATED", "Lease", leaseId, { propertyId: id, unitId: lease.unitId, terminatedOn: terminatedOn.toISOString(), terminationReason }, id);
    const message = derivedStatus === LeaseStatus.ACTIVE ? "Ukončení nájmu bylo naplánováno. Do zadaného data zůstává smlouva aktivní." : "Nájemní vztah byl ukončen. Nájemník i historie smlouvy zůstávají zachovány.";
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${lease.unitId}`, "ok", message);
  } catch (error) {
    return goWithMessage(request, `/smlouvy/${leaseId}/ukoncit`, "error", error instanceof Error ? error.message : "Nájemní vztah se nepodařilo ukončit.");
  }
}
