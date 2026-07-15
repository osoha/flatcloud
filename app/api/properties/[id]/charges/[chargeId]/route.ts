import { prisma } from "@/lib/db";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  const { id, chargeId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.charge.findFirst({ where: { id: chargeId, lease: { unit: { propertyId: id } } }, include: { allocations: true } });
    if (!existing) throw new Error("Měsíční předpis nebyl nalezen.");
    const form = await request.formData();
    const amountCents = moneyToCents(form, "amount");
    const paid = existing.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
    if (amountCents < paid) throw new Error("Předpis nelze snížit pod již uhrazenou částku.");
    await prisma.charge.update({
      where: { id: chargeId },
      data: { amountCents, dueDate: dateValue(form, "dueDate", true)!, note: text(form, "note") },
    });
    await audit(access.user.id, "CHARGE_UPDATED", "Charge", chargeId, { propertyId: id, amountCents });
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/mesicni/${chargeId}`, "ok", "Měsíční předpis byl upraven.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/mesicni/${chargeId}`, "error", error instanceof Error ? error.message : "Předpis se nepodařilo upravit.");
  }
}
