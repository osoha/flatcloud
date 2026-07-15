import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { normalizeIban, processPropertyTransactions } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; transactionId: string }> }) {
  const { id, transactionId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const transaction = await prisma.bankTransaction.findFirst({ where: { id: transactionId, bankAccount: { propertyId: id } }, include: { allocations: true } });
    if (!transaction) throw new Error("Platba nebyla nalezena.");
    if (transaction.allocations.length) throw new Error("Nejprve odstraňte existující přiřazení platby.");
    const form = await request.formData();
    const future = boolValue(form, "future");
    let ruleId: string | null = null;
    if (future) {
      const useIban = boolValue(form, "useIban") && transaction.counterpartyIban;
      const useName = boolValue(form, "useName") && transaction.counterpartyName;
      const useVs = boolValue(form, "useVs") && transaction.variableSymbol;
      const useMessage = boolValue(form, "useMessage") && transaction.message;
      const useAmount = boolValue(form, "useAmount");
      if (!useIban && !useName && !useVs && !useMessage && !useAmount) throw new Error("Pro budoucí pravidlo vyberte alespoň jednu podmínku.");
      const rule = await prisma.bankMatchingRule.create({
        data: {
          propertyId: id,
          bankAccountId: transaction.bankAccountId,
          name: text(form, "ruleName") || `Ignorovat ${transaction.counterpartyName || transaction.message || "opakovanou platbu"}`,
          action: "IGNORE",
          priority: 10,
          active: true,
          counterpartyIban: useIban ? normalizeIban(transaction.counterpartyIban) : null,
          counterpartyNameContains: useName ? transaction.counterpartyName : null,
          variableSymbol: useVs ? transaction.variableSymbol : null,
          messageContains: useMessage ? transaction.message : null,
          amountCents: useAmount ? transaction.amountCents : null,
        },
      });
      ruleId = rule.id;
    }
    await prisma.bankTransaction.update({ where: { id: transactionId }, data: { status: PaymentStatus.IGNORED, matchedRuleId: ruleId, suggestedLeaseId: null, matchNote: future ? "Ignorováno a vytvořeno pravidlo pro budoucí transakce." : "Ručně ignorováno správcem." } });
    if (future) await processPropertyTransactions(id);
    await audit(access.user.id, "PAYMENT_IGNORED", "BankTransaction", transactionId, { propertyId: id, futureRule: future, ruleId });
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "ok", future ? "Platba byla ignorována a pravidlo platí i pro budoucí transakce." : "Platba byla ignorována.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "error", error instanceof Error ? error.message : "Platbu se nepodařilo ignorovat.");
  }
}
