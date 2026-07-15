import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId", true)!;
    const share = floatValue(form, "sharePercent") ?? 100;
    if (share <= 0 || share > 100) throw new Error("Podíl musí být větší než 0 a nejvýše 100 %.");
    const owner = await prisma.owner.findFirst({ where: { id: ownerId, active: true } });
    if (!owner) throw new Error("Vlastník nebyl nalezen.");
    const otherShares = await prisma.propertyOwnership.aggregate({ where: { propertyId: id, ownerId: { not: ownerId } }, _sum: { shareBasisPoints: true } });
    if ((otherShares._sum.shareBasisPoints || 0) + Math.round(share * 100) > 10000) throw new Error("Součet vlastnických podílů objektu nesmí překročit 100 %.");
    const ownership = await prisma.propertyOwnership.upsert({
      where: { propertyId_ownerId: { propertyId: id, ownerId } },
      update: { shareBasisPoints: Math.round(share * 100), note: text(form, "note") },
      create: { propertyId: id, ownerId, shareBasisPoints: Math.round(share * 100), note: text(form, "note") },
    });
    await audit(access.user.id, "PROPERTY_OWNER_SAVED", "PropertyOwnership", ownership.id, { propertyId: id, ownerId, sharePercent: share });
    return goWithMessage(request, `/nemovitosti/${id}/vlastnici`, "ok", "Vlastník objektu byl uložen.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/vlastnici`, "error", error instanceof Error ? error.message : "Vlastníka se nepodařilo uložit.");
  }
}
