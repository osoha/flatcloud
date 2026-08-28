import { MatchRuleAction, PaymentStatus } from "@prisma/client";
import { prisma } from "./db";
import { bankAccountMatches, normalizeBankAccount } from "./inbound-bank/bank-email";
import { resolveCollectionTasksIfSettled } from "./tasks";
import { outstandingCents } from "./charges";

type TransactionStatusInput = {
  amountCents: number;
  suggestedLeaseId?: string | null;
  allocations: Array<{ amountCents: number; charge: { amountCents: number; allocations: Array<{ amountCents: number }>; securityDepositOffsets?: Array<{ amountCents: number }>; creditApplications?: Array<{ amountCents: number }> } }>;
  securityDepositReceipts: Array<{ type: string; amountCents: number }>;
};

export function expectedTransactionStatus(transaction: TransactionStatusInput) {
  const used = transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0)
    + transaction.securityDepositReceipts.filter((row) => row.type === "RECEIVED").reduce((sum, row) => sum + row.amountCents, 0);
  if (used > transaction.amountCents) return { status: null, used, invalid: true } as const;
  if (used === 0) return { status: transaction.suggestedLeaseId ? PaymentStatus.SUGGESTED : PaymentStatus.UNMATCHED, used, invalid: false } as const;
  if (used < transaction.amountCents) return { status: PaymentStatus.OVERPAYMENT, used, invalid: false } as const;
  const partial = transaction.allocations.some((row) => outstandingCents(row.charge) > 0);
  return { status: partial ? PaymentStatus.PARTIAL : PaymentStatus.MATCHED, used, invalid: false } as const;
}

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
    include: { allocations: true, securityDepositReceipts: true, bankAccount: true },
  });
  if (!transaction || transaction.amountCents <= 0) return;
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, unit: { propertyId: transaction.bankAccount.propertyId } },
    include: { charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { dueDate: "asc" } } },
  });
  if (!lease) return;

  let remaining = transaction.amountCents - transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0) - transaction.securityDepositReceipts.filter((row)=>row.type==="RECEIVED").reduce((sum,row)=>sum+row.amountCents,0);
  for (const charge of lease.charges) {
    if (remaining <= 0) break;
    const outstanding = outstandingCents(charge);
    if (!outstanding) continue;
    const amount = Math.min(remaining, outstanding);
    await prisma.paymentAllocation.upsert({
      where: { transactionId_chargeId: { transactionId, chargeId: charge.id } },
      update: { amountCents: { increment: amount } },
      create: { transactionId, chargeId: charge.id, amountCents: amount },
    });
    remaining -= amount;
  }
  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { suggestedLeaseId: leaseId, matchNote: note, matchedRuleId: matchedRuleId || null },
  });
  await recomputeTransactionStatus(transactionId);
  await resolveCollectionTasksIfSettled(leaseId);
}

export async function recomputeTransactionStatus(transactionId: string) {
  const transaction = await prisma.bankTransaction.findUnique({ where: { id: transactionId }, include: { allocations: { include: { charge: { include: { allocations: true, securityDepositOffsets: true, creditApplications: true } } } }, securityDepositReceipts: true } });
  if (!transaction) return;
  if (transaction.status === PaymentStatus.IGNORED) return;
  const expected = expectedTransactionStatus(transaction);
  if (expected.invalid || !expected.status) return;
  await prisma.bankTransaction.update({ where: { id: transactionId }, data: { status: expected.status } });
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

  const leases = await prisma.lease.findMany({
    where: { unit: { propertyId } },
    include: {
      tenant: true,
      ownerBankAccount: true,
      charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { dueDate: "asc" } },
    },
  });
  const txVs = (transaction.variableSymbol || "").replace(/^0+(?=\d)/, "");
  const payerAccount = normalizeBankAccount(transaction.counterpartyIban);
  const recipient = transaction.recipientAccount || transaction.bankAccount.iban;
  const scored = leases.map((lease) => {
    const outstanding = lease.charges.map((charge) => outstandingCents(charge)).filter((value) => value > 0);
    const totalOutstanding = outstanding.reduce((sum, value) => sum + value, 0);
    const exactAmount = outstanding.includes(transaction.amountCents) || totalOutstanding === transaction.amountCents;
    const vs = Boolean(txVs && lease.variableSymbol.replace(/^0+(?=\d)/, "") === txVs);
    const payer = Boolean(payerAccount && [lease.tenantBankAccount, ...lease.tenant.payerAccounts].map(normalizeBankAccount).filter(Boolean).includes(payerAccount));
    const ownerAccount = Boolean(recipient && lease.ownerBankAccount && bankAccountMatches(lease.ownerBankAccount, recipient));
    return { lease, exactAmount, vs, payer, ownerAccount };
  });

  const choose = async (rows: typeof scored, note: string, suggest = false) => {
    if (rows.length !== 1) return false;
    if (suggest) await setSuggestion(transaction.id, rows[0].lease.id, note);
    else await allocateTransactionToLease(transaction.id, rows[0].lease.id, note);
    return true;
  };

  if (recipient && await choose(scored.filter((row) => row.ownerAccount && row.vs && row.exactAmount), "Automaticky: cílový účet vlastníka + VS + přesná částka.")) return;
  if (recipient && await choose(scored.filter((row) => row.ownerAccount && row.vs), "Automaticky: cílový účet vlastníka + VS.")) return;
  if (recipient && await choose(scored.filter((row) => row.ownerAccount && row.payer && row.exactAmount), "Automaticky: cílový účet vlastníka + známý účet plátce + přesná částka.")) return;
  if (await choose(scored.filter((row) => row.payer && row.exactAmount), "Automaticky: známý účet plátce + přesná částka.")) return;
  if (recipient && await choose(scored.filter((row) => row.ownerAccount && row.payer), "Návrh podle cílového účtu vlastníka a známého účtu plátce; částka nesouhlasí přesně s otevřeným předpisem.", true)) return;

  await prisma.bankTransaction.update({ where: { id: transaction.id }, data: { status: PaymentStatus.UNMATCHED, matchNote: "Nenalezeno jednoznačné pravidlo. Platba je v globální frontě hlavního administrátora." } });
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
