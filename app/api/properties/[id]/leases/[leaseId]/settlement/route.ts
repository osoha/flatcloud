import { ChargeCategory, LeaseCreditType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { audit } from "@/lib/management";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params; const user = await currentUser(); if (!user) return go(request, "/login");
  try {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, unit: editableUnitWhere(user, id) }, select: { id: true, tenantId: true, unitId: true } });
    if (!lease) throw new Error("Smlouva nebyla nalezena nebo k ní nemáte právo editace.");
    const form = await request.formData(); const kind = text(form, "kind", true); const amountCents = moneyToCents(form, "amount"); const effectiveAt = dateValue(form, "effectiveAt", true)!; const description = text(form, "description", true)!; const note = text(form, "note");
    if (amountCents <= 0) throw new Error("Částka musí být vyšší než nula.");
    if (kind === "DEBIT") {
      const dueDate = dateValue(form, "dueDate", true)!;
      const charge = await prisma.charge.create({ data: { leaseId, period: `SETTLEMENT-${effectiveAt.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`, dueDate, amountCents, note: `${description}${note ? `: ${note}` : ""}`, items: { create: { name: description, category: ChargeCategory.ADJUSTMENT, amountCents } } } });
      await audit(user.id, "SERVICE_SETTLEMENT_DEBIT_CREATED", "Charge", charge.id, { leaseId, tenantId: lease.tenantId, unitId: lease.unitId, chargeId: charge.id, amountCents, effectiveAt: effectiveAt.toISOString(), dueDate: dueDate.toISOString() }, id);
    } else if (kind === "CREDIT") {
      const credit = await prisma.leaseCredit.create({ data: { leaseId, type: LeaseCreditType.SERVICE_SETTLEMENT, amountCents, effectiveAt, description, note, createdById: user.id } });
      await audit(user.id, "SERVICE_SETTLEMENT_CREDIT_CREATED", "LeaseCredit", credit.id, { leaseId, tenantId: lease.tenantId, unitId: lease.unitId, creditId: credit.id, amountCents, effectiveAt: effectiveAt.toISOString() }, id);
    } else throw new Error("Vyberte nedoplatek nebo přeplatek.");
    return goWithMessage(request, `/smlouvy/${leaseId}`, "ok", "Výsledek vyúčtování byl uložen.");
  } catch (error) { return goWithMessage(request, `/smlouvy/${leaseId}`, "error", error instanceof Error ? error.message : "Výsledek vyúčtování se nepodařilo uložit."); }
}
