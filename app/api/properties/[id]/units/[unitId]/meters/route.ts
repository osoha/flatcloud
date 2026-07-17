import { MeterType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

const defaultUnits: Record<MeterType, string> = {
  COLD_WATER: "m³",
  HOT_WATER: "m³",
  ELECTRICITY_HIGH_TARIFF: "kWh",
  ELECTRICITY_LOW_TARIFF: "kWh",
  GAS: "m³",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    if (!(await prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, select: { id: true } }))) throw new Error("Jednotka nebyla nalezena.");
    const form = await request.formData();
    const rawType = text(form, "type", true)! as MeterType;
    if (!Object.values(MeterType).includes(rawType)) throw new Error("Neplatný typ měřidla.");
    const meter = await prisma.meter.create({ data: { unitId, type: rawType, label: text(form, "label"), serialNumber: text(form, "serialNumber"), unitOfMeasure: text(form, "unitOfMeasure") || defaultUnits[rawType] } });
    await audit(access.user.id, "METER_CREATED", "Meter", meter.id, { propertyId: id, unitId, type: rawType });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "ok", "Měřidlo bylo přidáno.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#meridla`, "error", error instanceof Error ? error.message : "Měřidlo se nepodařilo přidat.");
  }
}
