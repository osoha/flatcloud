import { UnitDisposition, UnitOperationalStatus, UnitType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { shouldCreateOperationalStatusEvent } from "@/lib/unit-operational-history";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const rawDisposition = text(form, "disposition");
    const disposition = rawDisposition && Object.values(UnitDisposition).includes(rawDisposition as UnitDisposition)
      ? (rawDisposition as UnitDisposition)
      : null;
    if (rawDisposition && !disposition) throw new Error("Neplatná dispozice jednotky.");
    const dispositionCustom = text(form, "dispositionCustom");
    if (disposition === "OTHER" && !dispositionCustom) throw new Error("U jiné dispozice doplňte vlastní označení.");
    const operationalStatus = (text(form, "operationalStatus") || "STANDARD") as UnitOperationalStatus;
    const unit = await serializableTransaction(async (tx) => {
      const current = await tx.unit.findFirst({ where: { id: unitId, propertyId: id }, select: { operationalStatus: true } });
      if (!current) throw new Error("Jednotka nebyla nalezena.");
      return tx.unit.update({ where: { id: unitId }, data: {
        label: text(form, "label", true)!,
        floor: text(form, "floor"),
        type: (text(form, "type") || "APARTMENT") as UnitType,
        disposition,
        dispositionCustom: disposition === "OTHER" ? dispositionCustom : null,
        operationalStatus,
        areaM2: floatValue(form, "areaM2"),
        note: text(form, "note"),
        ...(shouldCreateOperationalStatusEvent(current.operationalStatus, operationalStatus) ? { operationalStatusEvents: { create: { status: operationalStatus, source: "USER_CHANGE", createdById: access.user.id, effectiveAt: new Date() } } } : {}),
      },
      });
    });
    await audit(access.user.id, "UNIT_UPDATED", "Unit", unit.id, { propertyId: id, label: unit.label }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky`, "ok", "Jednotka byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "error", error instanceof Error ? error.message : "Jednotku se nepodařilo upravit.");
  }
}
