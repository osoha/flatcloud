import { createHash } from "node:crypto";
import { parseCzkToCents, text } from "@/lib/forms";
import { requireManagedProperty } from "@/lib/management";
import { goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; budgetId: string }> }) {
  const { id, budgetId } = await params;
  const returnTo = `/nemovitosti/${id}/rozpocet/${budgetId}`;
  const access = await requireManagedProperty(id);
  if (!access) return goWithMessage(request, returnTo, "error", "Nemáte oprávnění změnit rozpočet.");
  try {
    const form = await request.formData();
    const reason = text(form, "reason", true)!;
    const expectedUpdatedAt = text(form, "expectedUpdatedAt", true)!;
    const requestId = text(form, "requestId", true)!;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("Obnovte formulář revize.");
    if (form.get("confirmed") !== "on") throw new Error("Potvrďte změnu limitu.");
    if (reason.length > 2000) throw new Error("Důvod změny může mít nejvýše 2000 znaků.");
    let amountCents: number;
    try { amountCents = parseCzkToCents(text(form, "amount", true)!); }
    catch { throw new Error("Zadejte limit v Kč s nejvýše dvěma desetinnými místy."); }
    if (amountCents <= 0 || amountCents > 2147483647) throw new Error("Limit musí být kladný a nejvýše 21 474 836,47 Kč.");
    const auditId = `budget-revision:${requestId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify([access.user.id, id, budgetId, expectedUpdatedAt, amountCents, reason])).digest("hex");
    await serializableTransaction(async tx => {
      const existing = await tx.auditLog.findUnique({ where: { id: auditId } });
      if (existing) {
        if ((existing.details as { fingerprint?: string } | null)?.fingerprint !== fingerprint) throw new Error("Tento formulář již byl použit. Obnovte detail.");
        return;
      }
      const line = await tx.propertyBudgetLine.findFirst({ where: { id: budgetId, propertyId: id }, include: { conditionPlanExecution: true } });
      if (!line) throw new Error("Rozpočtová položka nebyla nalezena.");
      if (line.conditionPlanExecution) throw new Error("Rozpočet řízené CAPEX realizace patří do modulu Kvalita a CAPEX.");
      if (line.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Rozpočet se mezitím změnil. Obnovte detail a zkontrolujte aktuální limit.");
      if (line.amountCents === amountCents) throw new Error("Nový limit se neliší od aktuálního.");
      const updatedAt = new Date(Math.max(Date.now(), line.updatedAt.getTime() + 1));
      const before = { id: line.id, propertyId: id, year: line.year, kind: line.kind, category: line.category, title: line.title, amountCents: line.amountCents, note: line.note, createdAt: line.createdAt.toISOString(), updatedAt: line.updatedAt.toISOString() };
      const changed = await tx.propertyBudgetLine.updateMany({ where: { id: budgetId, propertyId: id, updatedAt: line.updatedAt }, data: { amountCents, updatedAt } });
      if (changed.count !== 1) throw new Error("Rozpočet se mezitím změnil. Obnovte detail.");
      await tx.auditLog.create({ data: { id: auditId, createdAt: updatedAt, userId: access.user.id, propertyId: id, action: "PROPERTY_BUDGET_LIMIT_REVISED", entityType: "PropertyBudgetLine", entityId: budgetId, details: { reason, fingerprint, before, after: { ...before, amountCents, updatedAt: updatedAt.toISOString() } } } });
    });
    return goWithMessage(request, returnTo, "ok", "Revize limitu je zaznamenána v historii rozpočtu.");
  } catch (error) {
    return goWithMessage(request, returnTo, "error", error instanceof Error ? error.message : "Revizi se nepodařilo uložit.");
  }
}
