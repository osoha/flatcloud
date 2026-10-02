import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; meterId: string }> }) {
  const { id, meterId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const meter = await prisma.meter.findFirst({ where: { id: meterId, propertyId: id, scope: { in: ["HOUSE_MAIN", "HOUSE_SUBMETER"] }, property: { active: true } }, select: { id: true } });
    if (!meter) throw new Error("Domovní měřidlo nebylo nalezeno nebo je nemovitost archivována.");
    const form = await request.formData();
    const supplyPointId = text(form, "supplyPointId");
    await prisma.meter.update({ where: { id: meterId }, data: { supplyPointId } });
    await audit(access.user.id, "HOUSE_METER_SUPPLY_POINT_UPDATED", "Meter", meterId, { propertyId: id, supplyPointId }, id);
    return goWithMessage(request, `/nemovitosti/${id}/meridla`, "ok", "Identifikátor odběrného místa byl uložen.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/meridla`, "error", error instanceof Error ? error.message : "Identifikátor se nepodařilo uložit.");
  }
}
