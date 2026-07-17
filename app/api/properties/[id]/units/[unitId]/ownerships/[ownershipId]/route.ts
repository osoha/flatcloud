import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; ownershipId: string }> }) {
  const { id, unitId, ownershipId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.unitOwnership.findFirst({ where: { id: ownershipId, unitId, unit: { propertyId: id } } });
    if (!existing) throw new Error("Vlastnický vztah nebyl nalezen.");
    const form = await request.formData();
    if (text(form, "mode") === "delete") {
      const count = await prisma.unitOwnership.count({ where: { unitId } });
      if (count <= 1) throw new Error("Jednotka musí mít alespoň jednoho evidovaného vlastníka.");
      await prisma.unitOwnership.delete({ where: { id: ownershipId } });
      await audit(access.user.id, "UNIT_OWNER_REMOVED", "UnitOwnership", ownershipId, { propertyId: id, unitId, ownerId: existing.ownerId });
      return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "ok", "Vlastník byl z jednotky odebrán.");
    }
    const share = floatValue(form, "sharePercent") ?? existing.shareBasisPoints / 100;
    if (share <= 0 || share > 100) throw new Error("Podíl musí být větší než 0 a nejvýše 100 %.");
    const ownerBankAccountId = text(form, "ownerBankAccountId") || existing.ownerBankAccountId;
    if (ownerBankAccountId) {
      const account = await prisma.ownerBankAccount.findFirst({ where: { id: ownerBankAccountId, ownerId: existing.ownerId, active: true }, select: { id: true } });
      if (!account) throw new Error("Vybraný bankovní účet nepatří vlastníkovi nebo není aktivní.");
    }
    const otherShares = await prisma.unitOwnership.aggregate({ where: { unitId, id: { not: ownershipId } }, _sum: { shareBasisPoints: true } });
    if ((otherShares._sum.shareBasisPoints || 0) + Math.round(share * 100) > 10000) throw new Error("Součet vlastnických podílů jednotky nesmí překročit 100 %.");
    await prisma.$transaction(async (tx) => {
      await tx.unitOwnership.update({ where: { id: ownershipId }, data: { shareBasisPoints: Math.round(share * 100), note: text(form, "note"), ownerBankAccountId } });
      if (ownerBankAccountId) await tx.lease.updateMany({ where: { unitId, status: { in: ["ACTIVE", "FUTURE"] } }, data: { ownerBankAccountId } });
    });
    await audit(access.user.id, "UNIT_OWNER_UPDATED", "UnitOwnership", ownershipId, { propertyId: id, unitId, sharePercent: share, ownerBankAccountId });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "ok", "Podíl a účet vlastníka jednotky byly upraveny.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "error", error instanceof Error ? error.message : "Změnu se nepodařilo uložit.");
  }
}
