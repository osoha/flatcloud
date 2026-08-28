import { ChargeCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { paidCents } from "@/lib/charges";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  const { id, chargeId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  const redirectTo = `/nemovitosti/${id}/predpisy/mesicni/${chargeId}`;
  try {
    const charge = await prisma.charge.findFirst({
      where: { id: chargeId, lease: { unit: { propertyId: id } } },
      include: { items: true, allocations: true, securityDepositOffsets: true, creditApplications: true },
    });
    if (!charge) throw new Error("Měsíční předpis nebyl nalezen.");
    const form = await request.formData();
    const name = text(form, "name", true)!;
    const category = (text(form, "category") || "ADJUSTMENT") as ChargeCategory;
    const amountCents = moneyToCents(form, "amount");
    const paid = paidCents(charge);
    const total = charge.items.reduce((sum, item) => sum + item.amountCents, 0) + amountCents;
    if (total < 0) throw new Error("Celkový měsíční předpis nesmí být záporný.");
    if (total < paid) throw new Error("Předpis nelze snížit pod již uhrazenou částku.");

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.chargeItem.create({ data: { chargeId, name, category, amountCents } });
      await tx.charge.update({ where: { id: chargeId }, data: { amountCents: total, manualOverride: true } });
      return created;
    });
    await audit(access.user.id, "CHARGE_ITEM_ADDED", "ChargeItem", item.id, { propertyId: id, chargeId, amountCents, total }, id);
    return goWithMessage(request, redirectTo, "ok", "Položka měsíčního předpisu byla přidána.");
  } catch (error) {
    return goWithMessage(request, redirectTo, "error", error instanceof Error ? error.message : "Položku se nepodařilo přidat.");
  }
}
