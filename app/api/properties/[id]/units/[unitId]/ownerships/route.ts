import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: id } });
    if (!unit) throw new Error("Jednotka nebyla nalezena.");
    const form = await request.formData();
    const ownerId = text(form, "ownerId", true)!;
    const share = floatValue(form, "sharePercent") ?? 100;
    if (share <= 0 || share > 100) throw new Error("Podíl musí být větší než 0 a nejvýše 100 %.");
    const otherShares = await prisma.unitOwnership.aggregate({ where: { unitId, ownerId: { not: ownerId } }, _sum: { shareBasisPoints: true } });
    if ((otherShares._sum.shareBasisPoints || 0) + Math.round(share * 100) > 10000) throw new Error("Součet vlastnických podílů jednotky nesmí překročit 100 %.");
    const ownership = await prisma.unitOwnership.upsert({
      where: { unitId_ownerId: { unitId, ownerId } },
      update: { shareBasisPoints: Math.round(share * 100), note: text(form, "note") },
      create: { unitId, ownerId, shareBasisPoints: Math.round(share * 100), note: text(form, "note") },
    });
    await audit(access.user.id, "UNIT_OWNER_SAVED", "UnitOwnership", ownership.id, { propertyId: id, unitId, ownerId, sharePercent: share });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "ok", "Vlastník jednotky byl uložen.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "error", error instanceof Error ? error.message : "Vlastníka jednotky se nepodařilo uložit.");
  }
}
