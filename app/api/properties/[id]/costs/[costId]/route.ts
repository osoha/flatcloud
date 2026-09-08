import { PropertyCostCategory, PropertyCostKind, PropertyCostStatus } from "@prisma/client";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";
import { allocateCostAmount } from "@/lib/property-cost-allocations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; costId: string }> }) {
  const { id, costId } = await params;
  const returnTo = `/nemovitosti/${id}/naklady/${costId}`;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, returnTo, "error", "Nemáte oprávnění upravit náklad.");
  try {
    const form = await request.formData();
    const reason = text(form, "reason", true)!;
    const expectedUpdatedAt = text(form, "expectedUpdatedAt", true)!;
    const kind = text(form, "kind") as PropertyCostKind;
    const status = text(form, "status") as PropertyCostStatus;
    const category = text(form, "category") as PropertyCostCategory;
    if (!Object.values(PropertyCostKind).includes(kind) || !Object.values(PropertyCostStatus).includes(status) || !Object.values(PropertyCostCategory).includes(category)) throw new Error("Vyberte platný typ, stav a kategorii nákladu.");
    const amountCents = moneyToCents(form, "amount");
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) throw new Error("Částka nákladu musí být kladná a v podporovaném rozsahu.");
    const data = { kind, status, category, amountCents, title: text(form, "title", true)!, effectiveAt: dateValue(form, "effectiveAt", true)!, vendor: text(form, "vendor"), documentNumber: text(form, "documentNumber"), note: text(form, "note"), taskId: text(form, "taskId") };
    await serializableTransaction(async tx => {
      const cost = await tx.propertyCost.findFirst({ where: { id: costId, propertyId: id }, include: { allocations: true, conditionPlanExecution: true } });
      if (!cost) throw new Error("Náklad nebyl nalezen.");
      if (cost.conditionPlanExecution) throw new Error("Náklad řízené CAPEX realizace upravujte v modulu Kvalita a CAPEX.");
      if (cost.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Náklad se mezitím změnil. Obnovte detail a zkontrolujte aktuální údaje.");
      if (data.taskId && !await tx.task.findFirst({ where: { id: data.taskId, propertyId: id, ...(cost.unitId ? { OR: [{ unitId: cost.unitId }, { unitId: null, leaseId: null }] } : {}) }, select: { id: true } })) throw new Error("Vybraný úkol nepatří do rozsahu nákladu.");
      const before = { title: cost.title, kind: cost.kind, status: cost.status, category: cost.category, amountCents: cost.amountCents, effectiveAt: cost.effectiveAt.toISOString(), vendor: cost.vendor, documentNumber: cost.documentNumber, note: cost.note, taskId: cost.taskId, annualReviewStatus: cost.annualReviewStatus, annualReviewNote: cost.annualReviewNote, annualReviewedById: cost.annualReviewedById, annualReviewedAt: cost.annualReviewedAt?.toISOString() || null };
      const claim = await tx.propertyCost.updateMany({ where: { id: costId, propertyId: id, updatedAt: cost.updatedAt }, data: { ...data, annualReviewStatus: "DRAFT", annualReviewNote: null, annualReviewedAt: null, annualReviewedById: null } });
      if (claim.count !== 1) throw new Error("Náklad se mezitím změnil. Obnovte detail.");
      if (cost.allocations.length && amountCents !== cost.amountCents) {
        for (const row of allocateCostAmount(amountCents, cost.allocations)) await tx.propertyCostAllocation.update({ where: { propertyCostId_unitId: { propertyCostId: costId, unitId: row.unitId } }, data: { amountCents: row.amountCents } });
      }
      await tx.auditLog.create({ data: { userId: access.user.id, propertyId: id, action: "PROPERTY_COST_UPDATED", entityType: "PropertyCost", entityId: costId, details: { reason, before, after: { ...data, effectiveAt: data.effectiveAt.toISOString() } } } });
    });
    return goWithMessage(request, returnTo, "ok", "Náklad byl aktualizován. Rozdělení a podklady zůstaly zachovány; účetní kontrola čeká na nové ověření.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Náklad se nepodařilo upravit.");
  }
}
