import { MatchRuleAction, PaymentStatus } from "@prisma/client";
import { prisma } from "./db";

export function normalizeIban(value?: string | null) {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

function normalizeText(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("cs-CZ");
}

function ruleMatches(rule: {
  bankAccountId: string | null;
  counterpartyIban: string | null;
  counterpartyNameContains: string | null;
  variableSymbol: string | null;
  messageContains: string | null;
  amountCents: number | null;
}, transaction: {
  bankAccountId: string;
  counterpartyIban: string | null;
  counterpartyName: string | null;
  variableSymbol: string | null;
  message: string | null;
  amountCents: number;
}) {
  if (rule.bankAccountId && rule.bankAccountId !== transaction.bankAccountId) return false;
  if (rule.counterpartyIban && normalizeIban(rule.counterpartyIban) !== normalizeIban(transaction.counterpartyIban)) return false;
  if (rule.counterpartyNameContains && !normalizeText(transaction.counterpartyName).includes(normalizeText(rule.counterpartyNameContains))) return false;
  if (rule.variableSymbol && rule.variableSymbol.replace(/^0+/, "") !== (transaction.variableSymbol || "").replace(/^0+/, "")) return false;
  if (rule.messageContains && !normalizeText(transaction.message).includes(normalizeText(rule.messageContains))) return false;
  if (rule.amountCents !== null && rule.amountCents !== transaction.amountCents) return false;
  return true;
}

async function setSuggestion(transactionId: string, leaseId: string, note: string, matchedRuleId?: string) {
  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { status: PaymentStatus.SUGGESTED, suggestedLeaseId: leaseId, matchNote: note, matchedRuleId: matchedRuleId || null },
  });
}

export async function allocateTransactionToLease(transactionId: string, leaseId: string, note: string, matchedRuleId?: string) {
  const transaction = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: { allocations: true, bankAccount: true },
  });
  if (!transaction || transaction.amountCents <= 0) return;
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, unit: { propertyId: transaction.bankAccount.propertyId } },
    include: { charges: { include: { allocations: true }, orderBy: { dueDate: "asc" } } },
  });
  if (!lease) return;

  let remaining = transaction.amountCents - transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0);
  let partialCharge = false;
  for (const charge of lease.charges) {
    if (remaining <= 0) break;
    const paid = charge.allocations.reduce((sum, row) => sum + row.amountCents, 0);
    const outstanding = Math.max(0, charge.amountCents - paid);
    if (!outstanding) continue;
    const amount = Math.min(remaining, outstanding);
    await prisma.paymentAllocation.upsert({
      where: { transactionId_chargeId: { transactionId, chargeId: charge.id } },
      update: { amountCents: { increment: amount } },
      create: { transactionId, chargeId: charge.id, amountCents: amount },
    });
    if (amount < outstanding) partialCharge = true;
    remaining -= amount;
  }

  const allocated = transaction.amountCents - remaining;
  const status = allocated === 0
    ? PaymentStatus.SUGGESTED
    : remaining > 0
      ? PaymentStatus.OVERPAYMENT
      : partialCharge
        ? PaymentStatus.PARTIAL
        : PaymentStatus.MATCHED;
  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { status, suggestedLeaseId: leaseId, matchNote: note, matchedRuleId: matchedRuleId || null },
  });
}

export async function recomputeTransactionStatus(transactionId: string) {
  const transaction = await prisma.bankTransaction.findUnique({ where: { id: transactionId }, include: { allocations: { include: { charge: true } } } });
  if (!transaction) return;
  if (transaction.status === PaymentStatus.IGNORED) return;
  const allocated = transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0);
  let status: PaymentStatus = PaymentStatus.UNMATCHED;
  if (allocated > 0) {
    const partial = transaction.allocations.some((row) => row.amountCents < row.charge.amountCents);
    status = allocated < transaction.amountCents ? PaymentStatus.OVERPAYMENT : partial ? PaymentStatus.PARTIAL : PaymentStatus.MATCHED;
  } else if (transaction.suggestedLeaseId) status = PaymentStatus.SUGGESTED;
  await prisma.bankTransaction.update({ where: { id: transactionId }, data: { status } });
}

export async function processTransaction(transactionId: string) {
  const transaction = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: { bankAccount: true, allocations: true },
  });
  if (!transaction || transaction.allocations.length || transaction.status === PaymentStatus.IGNORED) return;
  if (transaction.amountCents <= 0) {
    await prisma.bankTransaction.update({ where: { id: transactionId }, data: { status: PaymentStatus.IGNORED, matchNote: "Odchozí platba – mimo evidenci nájmů." } });
    return;
  }

  const propertyId = transaction.bankAccount.propertyId;
  const rules = await prisma.bankMatchingRule.findMany({
    where: { propertyId, active: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  for (const rule of rules) {
    if (!ruleMatches(rule, transaction)) continue;
    if (rule.action === MatchRuleAction.IGNORE) {
      await prisma.bankTransaction.update({ where: { id: transaction.id }, data: { status: PaymentStatus.IGNORED, matchedRuleId: rule.id, matchNote: `Ignorováno pravidlem: ${rule.name}` } });
      return;
    }
    if (rule.targetLeaseId && rule.action === MatchRuleAction.MATCH_LEASE) {
      await allocateTransactionToLease(transaction.id, rule.targetLeaseId, `Automaticky pravidlem: ${rule.name}`, rule.id);
      return;
    }
    if (rule.targetLeaseId && rule.action === MatchRuleAction.SUGGEST_LEASE) {
      await setSuggestion(transaction.id, rule.targetLeaseId, `Navrženo pravidlem: ${rule.name}`, rule.id);
      return;
    }
  }

  if (transaction.variableSymbol) {
    const leases = await prisma.lease.findMany({
      where: { variableSymbol: transaction.variableSymbol, unit: { propertyId }, status: { in: ["ACTIVE", "FUTURE"] } },
      select: { id: true },
      take: 2,
    });
    if (leases.length === 1) {
      await allocateTransactionToLease(transaction.id, leases[0].id, "Automaticky podle variabilního symbolu.");
      return;
    }
  }

  const payerIban = normalizeIban(transaction.counterpartyIban);
  if (payerIban) {
    const leases = await prisma.lease.findMany({
      where: {
        unit: { propertyId },
        status: { in: ["ACTIVE", "FUTURE"] },
        OR: [
          { tenantBankAccount: payerIban },
          { tenant: { payerAccounts: { has: payerIban } } },
        ],
      },
      select: { id: true },
      take: 2,
    });
    if (leases.length === 1) {
      await allocateTransactionToLease(transaction.id, leases[0].id, "Automaticky podle účtu nájemníka ve smlouvě nebo známého účtu plátce.");
      return;
    }
  }

  await prisma.bankTransaction.update({ where: { id: transaction.id }, data: { status: PaymentStatus.UNMATCHED, matchNote: "Nenalezeno jednoznačné pravidlo." } });
}

export async function processPropertyTransactions(propertyId: string, onlyIds?: string[]) {
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccount: { propertyId },
      amountCents: { gt: 0 },
      ...(onlyIds?.length ? { id: { in: onlyIds } } : { status: { in: [PaymentStatus.UNMATCHED, PaymentStatus.SUGGESTED] } }),
    },
    select: { id: true },
    orderBy: { bookedAt: "asc" },
  });
  for (const transaction of transactions) await processTransaction(transaction.id);
  return transactions.length;
}
