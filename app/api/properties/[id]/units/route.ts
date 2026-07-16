import { UnitStatus, UnitType } from "@prisma/client";
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
    const property = await prisma.property.findUnique({ where: { id }, select: { ownerId: true } });
    if (!property) throw new Error("Nemovitost nebyla nalezena.");

    const ownerId = text(form, "ownerId") || property.ownerId;
    const owner = await prisma.owner.findFirst({ where: { id: ownerId, active: true }, select: { id: true } });
    if (!owner) throw new Error("Vybraný vlastník nebyl nalezen nebo není aktivní.");

    const sharePercentRaw = text(form, "sharePercent");
    const sharePercent = sharePercentRaw ? Number(sharePercentRaw.replace(",", ".")) : 100;
    if (!Number.isFinite(sharePercent) || sharePercent <= 0 || sharePercent > 100) {
      throw new Error("Podíl vlastníka musí být větší než 0 a nejvýše 100 %.");
    }

    const unit = await prisma.unit.create({
      data: {
        propertyId: id,
        label: text(form, "label", true)!,
        floor: text(form, "floor"),
        type: (text(form, "type") || "APARTMENT") as UnitType,
        status: (text(form, "status") || "VACANT") as UnitStatus,
        areaM2: floatValue(form, "areaM2"),
        note: text(form, "note"),
        ownerships: {
          create: {
            ownerId,
            shareBasisPoints: Math.round(sharePercent * 100),
          },
        },
      },
    });

    await audit(access.user.id, "UNIT_CREATED", "Unit", unit.id, {
      propertyId: id,
      label: unit.label,
      ownerId,
      sharePercent,
    });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky`, "ok", "Jednotka byla vytvořena.");
  } catch (error) {
    return goWithMessage(
      request,
      `/nemovitosti/${id}/jednotky/nova`,
      "error",
      error instanceof Error ? error.message : "Jednotku se nepodařilo vytvořit.",
    );
  }
}
