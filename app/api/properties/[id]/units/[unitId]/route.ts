import { UnitStatus, UnitType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.unit.findFirst({ where: { id: unitId, propertyId: id } });
    if (!existing) throw new Error("Jednotka nebyla nalezena.");
    const form = await request.formData();
    const unit = await prisma.unit.update({
      where: { id: unitId },
      data: {
        label: text(form, "label", true)!,
        floor: text(form, "floor"),
        type: (text(form, "type") || "APARTMENT") as UnitType,
        status: (text(form, "status") || "VACANT") as UnitStatus,
        areaM2: floatValue(form, "areaM2"),
        note: text(form, "note"),
      },
    });
    await audit(access.user.id, "UNIT_UPDATED", "Unit", unit.id, { propertyId: id, label: unit.label });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky`, "ok", "Jednotka byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "error", error instanceof Error ? error.message : "Jednotku se nepodařilo upravit.");
  }
}
