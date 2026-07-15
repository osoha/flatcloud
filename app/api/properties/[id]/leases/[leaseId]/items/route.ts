import { ChargeCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: id } } });
    if (!lease) throw new Error("Smlouva nebyla nalezena.");
    const form = await request.formData();
    const validFrom = dateValue(form, "validFrom", true)!;
    const validTo = dateValue(form, "validTo");
    if (validTo && validTo < validFrom) throw new Error("Konec platnosti nesmí být před začátkem.");
    const item = await prisma.leasePaymentItem.create({
      data: {
        leaseId,
        name: text(form, "name", true)!,
        category: (text(form, "category") || "OTHER") as ChargeCategory,
        amountCents: moneyToCents(form, "amount"),
        validFrom,
        validTo,
        sortOrder: intValue(form, "sortOrder", 100),
      },
    });
    await audit(access.user.id, "PAYMENT_ITEM_CREATED", "LeasePaymentItem", item.id, { propertyId: id, leaseId });
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${leaseId}`, "ok", "Položka předpisu byla přidána.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${leaseId}`, "error", error instanceof Error ? error.message : "Položku se nepodařilo přidat.");
  }
}
