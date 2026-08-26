import { prisma } from "@/lib/db";
import { boolValue, dateValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { periodDueDate, periodStart } from "@/lib/period";

function endOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; chargeId: string }> }) {
  const { id, chargeId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  const redirectTo = `/nemovitosti/${id}/predpisy/mesicni/${chargeId}`;
  try {
    const existing = await prisma.charge.findFirst({
      where: { id: chargeId, lease: { unit: { propertyId: id } } },
      include: {
        allocations: true,
        items: true,
        lease: { include: { paymentItems: true } },
      },
    });
    if (!existing) throw new Error("Měsíční předpis nebyl nalezen.");
    const form = await request.formData();
    const mode = text(form, "mode") || "save";
    const paid = existing.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);

    if (mode === "reset") {
      if (paid > 0) throw new Error("U předpisu s již přiřazenou úhradou nelze ruční úpravy automaticky resetovat.");
      const start = periodStart(existing.period);
      const monthEnd = endOfMonth(start);
      const templateItems = existing.lease.paymentItems
        .filter((item) => item.active && item.validFrom <= monthEnd && (!item.validTo || item.validTo >= start))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
      const amountCents = templateItems.reduce((sum, item) => sum + item.amountCents, 0);
      const dueDate = periodDueDate(existing.period, existing.lease.dueDay, existing.lease.rentTiming);
      await prisma.charge.update({
        where: { id: chargeId },
        data: {
          amountCents,
          dueDate,
          active: templateItems.length > 0,
          manualOverride: false,
          note: null,
          items: {
            deleteMany: {},
            create: templateItems.map((item) => ({ name: item.name, category: item.category, amountCents: item.amountCents })),
          },
        },
      });
      await audit(access.user.id, "CHARGE_OVERRIDE_RESET", "Charge", chargeId, { propertyId: id, period: existing.period, amountCents }, id);
      return goWithMessage(request, redirectTo, "ok", "Předpis byl obnoven podle pravidelných položek smlouvy.");
    }

    if (mode === "waive") {
      if (paid > 0) throw new Error("Již uhrazený nebo částečně uhrazený předpis nelze vypnout. Použijte korekční položku.");
      const note = text(form, "note") || existing.note || "Předpis byl pro tento měsíc odpuštěn / vypnut.";
      const itemTotal = existing.items.reduce((sum, item) => sum + item.amountCents, 0);
      await prisma.$transaction(async (tx) => {
        if (itemTotal !== 0) {
          await tx.chargeItem.create({
            data: { chargeId, name: "Odpuštění předpisu", category: "ADJUSTMENT", amountCents: -itemTotal },
          });
        }
        await tx.charge.update({ where: { id: chargeId }, data: { amountCents: 0, active: false, manualOverride: true, note } });
      });
      await audit(access.user.id, "CHARGE_WAIVED", "Charge", chargeId, { propertyId: id, period: existing.period, previousAmountCents: existing.amountCents }, id);
      return goWithMessage(request, redirectTo, "ok", "Předpis byl pro tento měsíc vypnut a automatika jej nebude obnovovat.");
    }

    const active = boolValue(form, "active");
    if (!active && paid > 0) throw new Error("Již uhrazený nebo částečně uhrazený předpis nelze vypnout. Použijte korekční položku.");
    const dueDate = dateValue(form, "dueDate", true)!;
    const note = text(form, "note");
    await prisma.charge.update({
      where: { id: chargeId },
      data: { dueDate, note, active, manualOverride: true },
    });
    await audit(access.user.id, "CHARGE_UPDATED", "Charge", chargeId, { propertyId: id, period: existing.period, active, manualOverride: true }, id);
    return goWithMessage(request, redirectTo, "ok", active ? "Měsíční předpis byl upraven." : "Předpis byl pro tento měsíc vypnut.");
  } catch (error) {
    return goWithMessage(request, redirectTo, "error", error instanceof Error ? error.message : "Předpis se nepodařilo upravit.");
  }
}
