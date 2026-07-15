import { ChargeCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string; itemId: string }> }) {
  const { id, leaseId, itemId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.leasePaymentItem.findFirst({ where: { id: itemId, leaseId, lease: { unit: { propertyId: id } } } });
    if (!existing) throw new Error("Položka předpisu nebyla nalezena.");
    const form = await request.formData();
    const validFrom = dateValue(form, "validFrom", true)!;
    const validTo = dateValue(form, "validTo");
    if (validTo && validTo < validFrom) throw new Error("Konec platnosti nesmí být před začátkem.");
    const item = await prisma.leasePaymentItem.update({
      where: { id: itemId },
      data: {
        name: text(form, "name", true)!,
        category: (text(form, "category") || "OTHER") as ChargeCategory,
        amountCents: moneyToCents(form, "amount"),
        validFrom,
        validTo,
        sortOrder: intValue(form, "sortOrder", 100),
        active: boolValue(form, "active"),
      },
    });
    await audit(access.user.id, "PAYMENT_ITEM_UPDATED", "LeasePaymentItem", item.id, { propertyId: id, leaseId });
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${leaseId}`, "ok", "Položka předpisu byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${leaseId}`, "error", error instanceof Error ? error.message : "Položku se nepodařilo upravit.");
  }
}
