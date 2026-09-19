import { prisma } from "@/lib/db";
import { boolValue, dateValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { periodDueDate, periodStart } from "@/lib/period";
import { paidCents } from "@/lib/charges";

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
        securityDepositOffsets: true,
        creditApplications: true,
        items: true,
        lease: { include: { paymentItems: true } },
      },
    });
    if (!existing) throw new Error("Měsíční předpis nebyl nalezen.");
    const form = await request.formData();
    const mode = text(form, "mode") || "save";
    const paid = paidCents(existing);
    if (paid > 0) throw new Error("Uhrazený nebo částečně uhrazený předpis nelze běžně přepisovat. Použijte auditovanou opravu platby nebo nový korekční předpis.");

    if (mode === "debt-treatment") {
      const treatment = text(form, "debtTreatment") || "CURRENT";
      if (!["CURRENT", "HISTORICAL", "EXCLUDED"].includes(treatment)) throw new Error("Neplatné zařazení pohledávky.");
      const reason = text(form, "debtTreatmentReason");
      if (treatment !== "CURRENT" && (!reason || reason.trim().length < 5)) throw new Error("U historické nebo skryté pohledávky uveďte důvod.");
      await prisma.charge.update({ where: { id: chargeId }, data: { debtTreatment: treatment as "CURRENT" | "HISTORICAL" | "EXCLUDED", debtTreatmentAt: treatment === "CURRENT" ? null : new Date(), debtTreatmentReason: treatment === "CURRENT" ? null : reason } });
      await audit(access.user.id, "CHARGE_DEBT_TREATMENT_CHANGED", "Charge", chargeId, { propertyId: id, period: existing.period, from: existing.debtTreatment, to: treatment, reason }, id);
      return goWithMessage(request, redirectTo, "ok", treatment === "CURRENT" ? "Pohledávka se znovu započítává do aktuálního dluhu." : treatment === "HISTORICAL" ? "Pohledávka byla přesunuta mezi historické pohledávky." : "Pohledávka byla vyřazena z dluhových KPI; historie zůstala zachována.");
    }

    if (mode === "reset") {
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
