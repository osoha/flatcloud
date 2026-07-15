import { MatchRuleAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, intValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { normalizeIban, processPropertyTransactions } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const action = (text(form, "action") || "IGNORE") as MatchRuleAction;
    const targetLeaseId = text(form, "targetLeaseId");
    if (action !== "IGNORE" && !targetLeaseId) throw new Error("Pro párovací pravidlo vyberte cílovou smlouvu.");
    if (targetLeaseId) {
      const lease = await prisma.lease.findFirst({ where: { id: targetLeaseId, unit: { propertyId: id } } });
      if (!lease) throw new Error("Vybraná smlouva nepatří do této nemovitosti.");
    }
    const bankAccountId = text(form, "bankAccountId");
    if (bankAccountId && !(await prisma.bankAccount.findFirst({ where: { id: bankAccountId, propertyId: id } }))) throw new Error("Vybraný účet nepatří k nemovitosti.");
    const counterpartyIban = normalizeIban(text(form, "counterpartyIban"));
    const counterpartyNameContains = text(form, "counterpartyNameContains");
    const variableSymbol = text(form, "variableSymbol");
    const messageContains = text(form, "messageContains");
    const amountRaw = text(form, "amount");
    const amountCents = amountRaw ? moneyToCents(form, "amount") : null;
    if (!bankAccountId && !counterpartyIban && !counterpartyNameContains && !variableSymbol && !messageContains && amountCents === null) throw new Error("Pravidlo musí obsahovat alespoň jednu podmínku.");
    const rule = await prisma.bankMatchingRule.create({
      data: {
        propertyId: id,
        bankAccountId,
        name: text(form, "name", true)!,
        action,
        priority: intValue(form, "priority", 100),
        active: boolValue(form, "active"),
        counterpartyIban: counterpartyIban || null,
        counterpartyNameContains,
        variableSymbol,
        messageContains,
        amountCents,
        targetLeaseId,
      },
    });
    await processPropertyTransactions(id);
    await audit(access.user.id, "MATCH_RULE_CREATED", "BankMatchingRule", rule.id, { propertyId: id, action, targetLeaseId });
    return goWithMessage(request, `/nemovitosti/${id}/banka`, "ok", "Párovací pravidlo bylo vytvořeno a aplikováno.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/banka`, "error", error instanceof Error ? error.message : "Pravidlo se nepodařilo vytvořit.");
  }
}
