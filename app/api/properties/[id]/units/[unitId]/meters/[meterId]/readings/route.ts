import { prisma } from "@/lib/db";
import { dateValue, floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; meterId: string }> }) {
  const { id, unitId, meterId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const meter = await prisma.meter.findFirst({ where: { id: meterId, unitId, unit: { propertyId: id } } });
    if (!meter) throw new Error("Měřidlo nebylo nalezeno.");
    const form = await request.formData();
    const value = floatValue(form, "value");
    if (value === null || value < 0) throw new Error("Stav měřidla musí být nezáporné číslo.");
    const leaseId = text(form, "leaseId");
    if (leaseId && !(await prisma.lease.findFirst({ where: { id: leaseId, unitId }, select: { id: true } }))) throw new Error("Vybraný nájemní vztah nepatří k této jednotce.");
    const reading = await prisma.meterReading.create({ data: { meterId, leaseId, readAt: dateValue(form, "readAt", true)!, value, note: text(form, "note") } });
    await audit(access.user.id, "METER_READING_CREATED", "MeterReading", reading.id, { propertyId: id, unitId, meterId, value });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "ok", "Odečet byl uložen.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "error", error instanceof Error ? error.message : "Odečet se nepodařilo uložit.");
  }
}
