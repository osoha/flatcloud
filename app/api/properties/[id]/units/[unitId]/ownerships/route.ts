import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { assertUniqueVariableSymbol } from "@/lib/variable-symbol";
import { go, goWithMessage } from "@/lib/route-response";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId", true)!;
    const ownerBankAccountId = text(form, "ownerBankAccountId", true)!;
    const [unit, owner, account] = await Promise.all([
      prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, select: { id: true } }),
      prisma.owner.findFirst({ where: { id: ownerId, active: true }, select: { id: true } }),
      prisma.ownerBankAccount.findFirst({ where: { id: ownerBankAccountId, ownerId, active: true }, select: { id: true } }),
    ]);
    if (!unit || !owner) throw new Error("Jednotka nebo vlastník nebyli nalezeni.");
    if (!account) throw new Error("Vyberte aktivní bankovní účet z číselníku zvoleného vlastníka.");
    await prisma.$transaction(async (tx) => {
      if (ownerBankAccountId) await tx.propertyPaymentAccount.upsert({
        where: { propertyId_ownerBankAccountId: { propertyId: id, ownerBankAccountId } },
        update: { active: true },
        create: { propertyId: id, ownerBankAccountId, active: true },
      });
      if (ownerBankAccountId) {
        const leaseRows = await tx.lease.findMany({ where: { unitId }, select: { id: true, variableSymbol: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true } });
        const affectedLeases = leaseRows.filter((lease) => leaseStatusAt(lease) !== "ENDED");
        for (const lease of affectedLeases) await assertUniqueVariableSymbol(tx, ownerBankAccountId, lease.variableSymbol, lease.id);
      }
      await tx.unitOwnership.deleteMany({ where: { unitId } });
      await tx.unitOwnership.create({ data: { unitId, ownerId, ownerBankAccountId, shareBasisPoints: 10000 } });
      const leaseRows = await tx.lease.findMany({ where: { unitId }, select: { id: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true } });
      const affectedLeaseIds = leaseRows.filter((lease) => leaseStatusAt(lease) !== "ENDED").map((lease) => lease.id);
      if (affectedLeaseIds.length) await tx.lease.updateMany({ where: { id: { in: affectedLeaseIds } }, data: { ownerBankAccountId } });
    });
    await audit(access.user.id, "UNIT_OWNER_REPLACED", "Unit", unitId, { ownerId, ownerBankAccountId }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", "Vlastník jednotky a účet pro nájemné byly uloženy.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "error", error instanceof Error ? error.message : "Vlastníka se nepodařilo uložit.");
  }
}
