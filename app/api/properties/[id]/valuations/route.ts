import { PropertyValuationSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { audit, requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";

const sources = new Set(Object.values(PropertyValuationSource));

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, `/nemovitosti/${id}/finance#oceneni`, "error", "Nemáte oprávnění zapisovat ocenění nemovitosti.");
  try {
    const form = await request.formData();
    const source = String(form.get("source") || "");
    if (!sources.has(source as PropertyValuationSource)) throw new Error("Vyberte platný zdroj ocenění.");
    const marketValueCents = moneyToCents(form, "marketValue");
    if (marketValueCents <= 0) throw new Error("Tržní hodnota musí být vyšší než nula.");
    const valuation = await prisma.propertyValuationSnapshot.create({ data: {
      propertyId: id,
      asOfDate: dateValue(form, "asOfDate", true)!,
      marketValueCents,
      source: source as PropertyValuationSource,
      note: text(form, "note"),
      createdById: access.user.id,
    } });
    await audit(access.user.id, "PROPERTY_VALUATION_SNAPSHOT_CREATED", "PropertyValuationSnapshot", valuation.id, { asOfDate: valuation.asOfDate.toISOString(), marketValueCents, source }, id);
    return goWithMessage(request, `/nemovitosti/${id}/finance#oceneni`, "ok", "Nové ocenění bylo uloženo do historie.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/finance#oceneni`, "error", error instanceof Error ? error.message : "Ocenění se nepodařilo uložit.");
  }
}
