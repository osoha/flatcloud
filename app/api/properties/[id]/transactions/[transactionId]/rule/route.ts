import { MatchRuleAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { normalizeIban, processTransaction } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; transactionId: string }> }) {
  const { id, transactionId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const transaction = await prisma.bankTransaction.findFirst({ where: { id: transactionId, bankAccount: { propertyId: id } }, include: { allocations: true } });
    if (!transaction) throw new Error("Platba nebyla nalezena.");
    if (transaction.allocations.length) throw new Error("Platba už má ruční nebo automatické přiřazení.");
    const form = await request.formData();
    const targetLeaseId = text(form, "targetLeaseId", true)!;
    const lease = await prisma.lease.findFirst({ where: { id: targetLeaseId, unit: { propertyId: id } } });
    if (!lease) throw new Error("Vybraná smlouva nebyla nalezena.");
    const action = (text(form, "action") || "MATCH_LEASE") as MatchRuleAction;
    const useIban = boolValue(form, "useIban") && transaction.counterpartyIban;
    const useName = boolValue(form, "useName") && transaction.counterpartyName;
    const useVs = boolValue(form, "useVs") && transaction.variableSymbol;
    const useMessage = boolValue(form, "useMessage") && transaction.message;
    const useAmount = boolValue(form, "useAmount");
    if (!useIban && !useName && !useVs && !useMessage && !useAmount) throw new Error("Vyberte alespoň jednu podmínku pravidla.");
    const rule = await prisma.bankMatchingRule.create({
      data: {
        propertyId: id,
        bankAccountId: transaction.bankAccountId,
        name: text(form, "ruleName") || `Párovat ${transaction.counterpartyName || lease.variableSymbol}`,
        action,
        priority: 20,
        active: true,
        targetLeaseId,
        counterpartyIban: useIban ? normalizeIban(transaction.counterpartyIban) : null,
        counterpartyNameContains: useName ? transaction.counterpartyName : null,
        variableSymbol: useVs ? transaction.variableSymbol : null,
        messageContains: useMessage ? transaction.message : null,
        amountCents: useAmount ? transaction.amountCents : null,
      },
    });
    await prisma.bankTransaction.update({ where: { id: transactionId }, data: { status: "UNMATCHED", matchedRuleId: null, suggestedLeaseId: null } });
    await processTransaction(transactionId);
    await audit(access.user.id, "PAYMENT_RULE_CREATED", "BankMatchingRule", rule.id, { propertyId: id, transactionId, targetLeaseId, action });
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "ok", "Pravidlo bylo vytvořeno a platba znovu zpracována.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "error", error instanceof Error ? error.message : "Pravidlo se nepodařilo vytvořit.");
  }
}
