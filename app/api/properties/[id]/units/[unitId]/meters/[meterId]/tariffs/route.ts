import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManagedUnit } from "@/lib/managed-unit";
import { goWithMessage } from "@/lib/route-response";
import { businessDateKeyToInstant } from "@/lib/calendar";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; meterId: string }> }) {
  const { id, unitId, meterId } = await params;
  const access = await requireManagedUnit(id, unitId);
  if (!access) return NextResponse.json({ error: "Nemáte oprávnění upravit měřidlo této jednotky." }, { status: 403 });
  const back = `/nemovitosti/${id}/jednotky/${unitId}#meridla`;
  try {
    const meter = await prisma.meter.findFirst({ where: { id: meterId, propertyId: id, unitId, scope: "UNIT" } });
    if (!meter) throw new Error("Měřidlo není dostupné.");
    const form = await request.formData(), date = String(form.get("validFrom") || "");
    const rawPrice = String(form.get("price") || "").replace(",", "."), rawAdvance = String(form.get("advance") || "").replace(",", ".");
    const price = Number(rawPrice), advance = Number(rawAdvance);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date) throw new Error("Vyberte platné datum účinnosti.");
    if (![rawPrice,rawAdvance].every(v=>/^\d+(\.\d{1,4})?$/.test(v)) || !Number.isFinite(price) || price<0 || price>1000000 || !Number.isFinite(advance) || advance<0 || advance>10000000) throw new Error("Zadejte nezápornou cenu a měsíční zálohu.");
    const validFrom = businessDateKeyToInstant(date as `${number}-${number}-${number}`);
    await prisma.$transaction(async tx => {
      const tariff = await tx.meterTariff.upsert({ where: { meterId_validFrom: { meterId, validFrom } }, create: { meterId, validFrom, priceCentsPerUnit: price*100, monthlyAdvanceCents: Math.round(advance*100), unitOfMeasure: meter.unitOfMeasure }, update: { priceCentsPerUnit:price*100, monthlyAdvanceCents:Math.round(advance*100), unitOfMeasure:meter.unitOfMeasure } });
      await tx.auditLog.create({data:{userId:access.user.id,propertyId:id,action:"METER_TARIFF_SAVED",entityType:"MeterTariff",entityId:tariff.id,details:{meterId,unitId,validFrom:date,price,advance}}});
    });
    return goWithMessage(request, back, "ok", "Cena a záloha byly uloženy.");
  } catch (error) { return goWithMessage(request, back, "error", error instanceof Error ? error.message : "Cenu nelze uložit."); }
}
