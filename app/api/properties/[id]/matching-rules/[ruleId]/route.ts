import { MatchRuleAction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, intValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { normalizeIban, processPropertyTransactions } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.bankMatchingRule.findFirst({ where: { id: ruleId, propertyId: id } });
    if (!existing) throw new Error("Pravidlo nebylo nalezeno.");
    const form = await request.formData();
    if (text(form, "mode") === "delete") {
      await prisma.bankMatchingRule.delete({ where: { id: ruleId } });
      await audit(access.user.id, "MATCH_RULE_DELETED", "BankMatchingRule", ruleId, { propertyId: id });
      return goWithMessage(request, `/nemovitosti/${id}/banka`, "ok", "Pravidlo bylo odstraněno.");
    }
    const action = (text(form, "action") || existing.action) as MatchRuleAction;
    const targetLeaseId = text(form, "targetLeaseId");
    if (action !== "IGNORE" && !targetLeaseId) throw new Error("Pro párovací pravidlo vyberte cílovou smlouvu.");
    const amountRaw = text(form, "amount");
    await prisma.bankMatchingRule.update({
      where: { id: ruleId },
      data: {
        name: text(form, "name", true)!,
        action,
        priority: intValue(form, "priority", existing.priority),
        active: boolValue(form, "active"),
        bankAccountId: text(form, "bankAccountId"),
        counterpartyIban: normalizeIban(text(form, "counterpartyIban")) || null,
        counterpartyNameContains: text(form, "counterpartyNameContains"),
        variableSymbol: text(form, "variableSymbol"),
        messageContains: text(form, "messageContains"),
        amountCents: amountRaw ? moneyToCents(form, "amount") : null,
        targetLeaseId,
      },
    });
    await processPropertyTransactions(id);
    await audit(access.user.id, "MATCH_RULE_UPDATED", "BankMatchingRule", ruleId, { propertyId: id, action });
    return goWithMessage(request, `/nemovitosti/${id}/banka`, "ok", "Pravidlo bylo upraveno.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/banka`, "error", error instanceof Error ? error.message : "Pravidlo se nepodařilo upravit.");
  }
}
