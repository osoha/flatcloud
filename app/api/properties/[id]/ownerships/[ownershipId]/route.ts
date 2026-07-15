import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; ownershipId: string }> }) {
  const { id, ownershipId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.propertyOwnership.findFirst({ where: { id: ownershipId, propertyId: id } });
    if (!existing) throw new Error("Vlastnický vztah nebyl nalezen.");
    const form = await request.formData();
    if (text(form, "mode") === "delete") {
      const count = await prisma.propertyOwnership.count({ where: { propertyId: id } });
      if (count <= 1) throw new Error("Objekt musí mít alespoň jednoho evidovaného vlastníka.");
      await prisma.propertyOwnership.delete({ where: { id: ownershipId } });
      await audit(access.user.id, "PROPERTY_OWNER_REMOVED", "PropertyOwnership", ownershipId, { propertyId: id, ownerId: existing.ownerId });
      return goWithMessage(request, `/nemovitosti/${id}/vlastnici`, "ok", "Vlastník byl z objektu odebrán.");
    }
    const share = floatValue(form, "sharePercent") ?? existing.shareBasisPoints / 100;
    if (share <= 0 || share > 100) throw new Error("Podíl musí být větší než 0 a nejvýše 100 %.");
    const otherShares = await prisma.propertyOwnership.aggregate({ where: { propertyId: id, id: { not: ownershipId } }, _sum: { shareBasisPoints: true } });
    if ((otherShares._sum.shareBasisPoints || 0) + Math.round(share * 100) > 10000) throw new Error("Součet vlastnických podílů objektu nesmí překročit 100 %.");
    await prisma.propertyOwnership.update({ where: { id: ownershipId }, data: { shareBasisPoints: Math.round(share * 100), note: text(form, "note") } });
    await audit(access.user.id, "PROPERTY_OWNER_UPDATED", "PropertyOwnership", ownershipId, { propertyId: id, sharePercent: share });
    return goWithMessage(request, `/nemovitosti/${id}/vlastnici`, "ok", "Podíl vlastníka byl upraven.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/vlastnici`, "error", error instanceof Error ? error.message : "Změnu se nepodařilo uložit.");
  }
}
