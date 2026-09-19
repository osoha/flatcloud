import { PropertyCostCategory, PropertyCostKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { intValue, moneyToCents, text } from "@/lib/forms";
import { audit, requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";

const kinds = new Set(Object.values(PropertyCostKind));
const categories = new Set(Object.values(PropertyCostCategory));

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", "Nemáte oprávnění přidávat rozpočtové položky.");
  try {
    const form = await request.formData();
    const kind = String(form.get("kind") || "");
    const category = String(form.get("category") || "");
    if (!kinds.has(kind as PropertyCostKind) || !categories.has(category as PropertyCostCategory)) throw new Error("Vyberte platný typ a kategorii rozpočtu.");
    const rawYear = String(form.get("year") || "").trim();
    if (!/^\d{4}$/.test(rawYear)) throw new Error("Rozpočtový rok musí mít čtyři číslice.");
    const year = intValue(form, "year");
    if (year < 2000 || year > 2200) throw new Error("Rozpočtový rok musí být mezi 2000 a 2200.");
    const amountCents = moneyToCents(form, "amount");
    if (amountCents <= 0) throw new Error("Částka rozpočtu musí být vyšší než nula.");
    const line = await prisma.propertyBudgetLine.create({ data: {
      propertyId: id,
      year,
      kind: kind as PropertyCostKind,
      category: category as PropertyCostCategory,
      title: text(form, "title", true)!,
      amountCents,
      note: text(form, "note"),
    } });
    await audit(access.user.id, "PROPERTY_BUDGET_LINE_CREATED", "PropertyBudgetLine", line.id, { year, kind, category, amountCents }, id);
    return goWithMessage(request, `/nemovitosti/${id}/finance?financeYear=${year}`, "ok", "Rozpočtová položka byla přidána.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/finance`, "error", error instanceof Error ? error.message : "Rozpočtovou položku se nepodařilo uložit.");
  }
}
