import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; meterId: string }> }) {
  const { id, unitId, meterId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.meter.findFirst({ where: { id: meterId, unitId, unit: { propertyId: id } } });
    if (!existing) throw new Error("Měřidlo nebylo nalezeno.");
    const form = await request.formData();
    const mode = text(form, "mode") || "update";
    if (mode === "toggle") {
      await prisma.meter.update({ where: { id: meterId }, data: { active: !existing.active } });
      await audit(access.user.id, "METER_STATUS_CHANGED", "Meter", meterId, { propertyId: id, unitId, active: !existing.active });
    } else {
      await prisma.meter.update({ where: { id: meterId }, data: { label: text(form, "label"), serialNumber: text(form, "serialNumber"), unitOfMeasure: text(form, "unitOfMeasure", true)! } });
      await audit(access.user.id, "METER_UPDATED", "Meter", meterId, { propertyId: id, unitId });
    }
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "ok", "Měřidlo bylo upraveno.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "error", error instanceof Error ? error.message : "Měřidlo se nepodařilo upravit.");
  }
}
