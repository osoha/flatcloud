import { PropertyCostCategory, PropertyCostKind, PropertyCostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { audit, requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";

const kinds = new Set(Object.values(PropertyCostKind));
const statuses = new Set(Object.values(PropertyCostStatus));
const categories = new Set(Object.values(PropertyCostCategory));

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", "Nemáte oprávnění přidávat náklady.");
  try {
    const form = await request.formData();
    const kind = String(form.get("kind") || "");
    const status = String(form.get("status") || "");
    const category = String(form.get("category") || "");
    if (!kinds.has(kind as PropertyCostKind) || !statuses.has(status as PropertyCostStatus) || !categories.has(category as PropertyCostCategory)) throw new Error("Vyberte platný typ, stav a kategorii nákladu.");
    const amountCents = moneyToCents(form, "amount");
    if (amountCents <= 0) throw new Error("Částka nákladu musí být vyšší než nula.");
    const unitId = text(form, "unitId");
    if (unitId && !await prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, select: { id: true } })) throw new Error("Vybraná jednotka do této nemovitosti nepatří.");
    const cost = await prisma.propertyCost.create({ data: {
      propertyId: id,
      unitId,
      kind: kind as PropertyCostKind,
      status: status as PropertyCostStatus,
      category: category as PropertyCostCategory,
      title: text(form, "title", true)!,
      amountCents,
      effectiveAt: dateValue(form, "effectiveAt", true)!,
      vendor: text(form, "vendor"),
      documentNumber: text(form, "documentNumber"),
      note: text(form, "note"),
      allocations: unitId ? { create: { unitId, shareBasisPoints: 10_000, amountCents } } : undefined,
    } });
    await audit(access.user.id, "PROPERTY_COST_CREATED", "PropertyCost", cost.id, { kind, status, category, amountCents, unitId, documentNumber: cost.documentNumber }, id);
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "ok", "Náklad byl přidán do asset finance.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", error instanceof Error ? error.message : "Náklad se nepodařilo uložit.");
  }
}
