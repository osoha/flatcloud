import { text } from "@/lib/forms";
import { requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; costId: string }> }) {
  const { id, costId } = await params;
  const returnTo = `/nemovitosti/${id}/naklady/${costId}`;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, returnTo, "error", "Nemáte oprávnění změnit vazbu nákladu.");
  try {
    const form = await request.formData();
    const reason = text(form, "reason", true)!;
    const expectedUpdatedAt = text(form, "expectedUpdatedAt", true)!;
    const budgetLineId = text(form, "budgetLineId");
    if (form.get("confirmed") !== "on") throw new Error("Potvrďte změnu vazby na rozpočet.");
    if (reason.length > 2000) throw new Error("Důvod změny může mít nejvýše 2000 znaků.");
    await serializableTransaction(async tx => {
      const cost = await tx.propertyCost.findFirst({ where: { id: costId, propertyId: id }, include: { budgetLine: true, conditionPlanExecution: true } });
      if (!cost) throw new Error("Náklad nebyl nalezen.");
      if (cost.conditionPlanExecution) throw new Error("Vazba řízené CAPEX realizace zůstává v modulu Kvalita a CAPEX.");
      if (cost.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Náklad se mezitím změnil. Obnovte detail.");
      if (cost.budgetLineId === budgetLineId) throw new Error("Vazba na rozpočet se nezměnila.");
      const target = budgetLineId ? await tx.propertyBudgetLine.findFirst({ where: { id: budgetLineId, propertyId: id }, include: { conditionPlanExecution: true } }) : null;
      if (budgetLineId && !target) throw new Error("Rozpočtová položka nepatří do této nemovitosti.");
      if (target?.conditionPlanExecution) throw new Error("Rozpočet řízené CAPEX realizace nelze přiřadit jinému nákladu.");
      if (target && (target.kind !== cost.kind || target.category !== cost.category)) throw new Error("Rozpočtová položka musí mít stejný typ a kategorii jako náklad.");
      const changed = await tx.propertyCost.updateMany({ where: { id: costId, propertyId: id, updatedAt: cost.updatedAt }, data: { budgetLineId, updatedAt: new Date(Math.max(Date.now(), cost.updatedAt.getTime() + 1)) } });
      if (changed.count !== 1) throw new Error("Náklad se mezitím změnil. Obnovte detail.");
      const snapshot = (line: { id: string; title: string; year: number } | null) => ({ budgetLineId: line?.id || null, title: line?.title || null, year: line?.year || null });
      await tx.auditLog.create({ data: { userId: access.user.id, propertyId: id, entityType: "PropertyCost", entityId: costId, action: "PROPERTY_COST_BUDGET_LINK_CHANGED", details: { reason, costTitle: cost.title, amountCents: cost.amountCents, status: cost.status, before: snapshot(cost.budgetLine), after: snapshot(target) } } });
    });
    return goWithMessage(request, returnTo, "ok", "Vazba na rozpočet byla zaznamenána. Náklad i jeho podklady zůstaly zachovány.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Vazbu se nepodařilo uložit.");
  }
}
