import { requireManagedUnit } from "@/lib/managed-unit";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; meterId: string }> }) {
  const { id, unitId, meterId } = await params;
  const access = await requireManagedUnit(id,unitId);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.meter.findFirst({ where: { id: meterId, unitId, unit: { propertyId: id } } });
    if (!existing) throw new Error("Měřidlo nebylo nalezeno.");
    if (!await prisma.property.findFirst({where:{id,active:true},select:{id:true}})) throw new Error("Archivovanou nemovitost nelze měnit.");
    const form = await request.formData();
    const mode = text(form, "mode") || "update";
    if (mode === "toggle") {
      await prisma.meter.update({ where: { id: meterId }, data: { active: !existing.active } });
      await audit(access.user.id, "METER_STATUS_CHANGED", "Meter", meterId, { propertyId: id, unitId, active: !existing.active }, id);
    } else {
      if (await prisma.meterReading.count({where:{meterId}}) && (text(form,"unitOfMeasure",true)! !== existing.unitOfMeasure || text(form,"serialNumber") !== existing.serialNumber)) throw new Error("Měřidlo s odečty nemůže změnit výrobní číslo ani měrnou jednotku. Při výměně založte nové měřidlo.");
      await prisma.meter.update({ where: { id: meterId }, data: { label: text(form, "label"), serialNumber: text(form, "serialNumber"), unitOfMeasure: text(form, "unitOfMeasure", true)! } });
      await audit(access.user.id, "METER_UPDATED", "Meter", meterId, { propertyId: id, unitId }, id);
    }
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "ok", "Měřidlo bylo upraveno.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "error", error instanceof Error ? error.message : "Měřidlo se nepodařilo upravit.");
  }
}
