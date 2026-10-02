import { matchingAccountBankRule } from "@/lib/account-bank-rules";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { allocateTransactionToLease, processTransaction } from "@/lib/matching";
import { MatchRuleAction } from "@prisma/client";
import { bankAccountMatches, bankNameForCode, normalizeBankAccount } from "@/lib/inbound-bank/bank-email";
import { touchPropertyPaymentNotification, tryVerifyNotificationPayment } from "@/lib/bank-email-verification";
import { runExpenseRules } from "@/lib/bank-expense-rules";
import { reconcileInboxReview, reconcileTransactionReview } from "@/lib/bank-review-tasks";

function normalizedVs(value?: string | null) {
  return (value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function maskedAccount(value?: string | null) {
  const normalized = normalizeBankAccount(value);
  if (!normalized) return "E-MAIL NOTIFIKACE";
  if (normalized.startsWith("CZ") && normalized.length > 8) return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) return `${normalized.slice(0, Math.min(4, slash))}…${normalized.slice(Math.max(0, slash - 4))}` + normalized.slice(slash);
  return normalized;
}

async function ownerAccountIdsForRecipient(recipientAccount?: string | null) {
  if (!recipientAccount) return [] as string[];
  const accounts = await prisma.ownerBankAccount.findMany({ where: { active: true } });
  return accounts.filter((account) => bankAccountMatches(account, recipientAccount)).map((account) => account.id);
}

async function inferRoute(input: { recipientAccount?: string | null; variableSymbol?: string | null; counterpartyAccount?: string | null }) {
  const ownerAccountIds = await ownerAccountIdsForRecipient(input.recipientAccount);
  const vs = normalizedVs(input.variableSymbol);

  if (ownerAccountIds.length && vs) {
    const leases = await prisma.lease.findMany({
      where: {
        ...(ownerAccountIds.length ? { ownerBankAccountId: { in: ownerAccountIds } } : {}),
      },
      include: { unit: true, ownerBankAccount: true, tenant: true },
    });
    const exact = leases.filter((lease) => normalizedVs(lease.variableSymbol) === vs);
    if (exact.length === 1) return { propertyId: exact[0].unit.propertyId, leaseId: exact[0].id, ownerId: exact[0].ownerBankAccount?.ownerId || null, reason: "cílový účet + VS", strong: true };
  }

  if (ownerAccountIds.length && input.counterpartyAccount) {
    const payer = normalizeBankAccount(input.counterpartyAccount);
    const leases = await prisma.lease.findMany({
      where: {},
      include: { unit: true, tenant: true, ownerBankAccount: true },
    });
    const exact = leases.filter((lease) => {
      if (ownerAccountIds.length && (!lease.ownerBankAccountId || !ownerAccountIds.includes(lease.ownerBankAccountId))) return false;
      const aliases = [lease.tenantBankAccount, ...lease.tenant.payerAccounts].map(normalizeBankAccount).filter(Boolean);
      return aliases.includes(payer);
    });
    if (exact.length === 1) return { propertyId: exact[0].unit.propertyId, leaseId: exact[0].id, ownerId: exact[0].ownerBankAccount?.ownerId || null, reason: "cílový účet + známý účet plátce", strong: true };
  }

  if (ownerAccountIds.length) {
    const [propertyLinks, leaseRows, ownershipRows] = await Promise.all([
      prisma.propertyPaymentAccount.findMany({ where: { ownerBankAccountId: { in: ownerAccountIds }, active: true }, include: { ownerBankAccount: true } }),
      prisma.lease.findMany({ where: { ownerBankAccountId: { in: ownerAccountIds } }, include: { unit: true, ownerBankAccount: true } }),
      prisma.unitOwnership.findMany({ where: { ownerBankAccountId: { in: ownerAccountIds } }, include: { unit: true, ownerBankAccount: true } }),
    ]);
    const propertyIds = new Set([...propertyLinks.map((row)=>row.propertyId), ...leaseRows.map((row) => row.unit.propertyId), ...ownershipRows.map((row) => row.unit.propertyId)]);
    if (propertyIds.size === 1) {
      const propertyId = [...propertyIds][0];
      const ownerId = propertyLinks.find((row)=>row.propertyId===propertyId)?.ownerBankAccount.ownerId || leaseRows.find((row) => row.unit.propertyId === propertyId)?.ownerBankAccount?.ownerId || ownershipRows.find((row) => row.unit.propertyId === propertyId)?.ownerBankAccount?.ownerId || null;
      return { propertyId, leaseId: null, ownerId, reason: "příjem na známý účet bez vazby na nájemní evidenci", strong: false };
    }
  }

  return { propertyId: null, leaseId: null, ownerId: null, reason: "nelze jednoznačně určit objekt", strong: false };
}

function inboxRuleMatches(rule: { bankAccount: { propertyId: string; provider: string; externalAccountId: string; iban: string | null } | null; counterpartyIban: string | null; counterpartyNameContains: string | null; variableSymbol: string | null; messageContains: string | null; amountCents: number | null }, inbox: { recipientAccount: string | null; counterpartyAccount: string | null; counterpartyName: string | null; variableSymbol: string | null; message: string | null; subject: string | null; amountCents: number | null }) {
  if (rule.bankAccount) {
    const normalizedRecipient = normalizeBankAccount(inbox.recipientAccount);
    const fingerprint = createHash("sha256").update(normalizedRecipient || "unknown").digest("hex").slice(0, 20);
    const syntheticAccountMatches = rule.bankAccount.provider === "bank-email"
      && rule.bankAccount.externalAccountId === `bank-email:${rule.bankAccount.propertyId}:${fingerprint}`;
    const identifiableProviderAccountMatches = rule.bankAccount.provider !== "bank-email"
      && Boolean(rule.bankAccount.iban)
      && bankAccountMatches({ iban: rule.bankAccount.iban }, inbox.recipientAccount);
    if (!syntheticAccountMatches && !identifiableProviderAccountMatches) return false;
  }
  if (rule.counterpartyIban && normalizeBankAccount(rule.counterpartyIban) !== normalizeBankAccount(inbox.counterpartyAccount)) return false;
  if (rule.counterpartyNameContains && !(inbox.counterpartyName || "").toLocaleLowerCase("cs-CZ").includes(rule.counterpartyNameContains.toLocaleLowerCase("cs-CZ"))) return false;
  if (rule.variableSymbol && normalizedVs(rule.variableSymbol) !== normalizedVs(inbox.variableSymbol)) return false;
  if (rule.messageContains && !`${inbox.message || ""} ${inbox.subject || ""}`.toLocaleLowerCase("cs-CZ").includes(rule.messageContains.toLocaleLowerCase("cs-CZ"))) return false;
  if (rule.amountCents !== null && rule.amountCents !== inbox.amountCents) return false;
  return true;
}

async function matchingRuleForInbox(propertyId: string, inbox: Parameters<typeof inboxRuleMatches>[1]) {
  const rules = await prisma.bankMatchingRule.findMany({ where: { propertyId, active: true }, include: { bankAccount: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  return rules.find((rule) => inboxRuleMatches(rule, inbox)) || null;
}

function bankDisplayName(bank?: string | null) {
  const name = bankNameForCode(bank);
  return name === "Neznámá banka" ? "Bankovní účet" : name;
}

async function emailBankAccount(propertyId: string, recipientAccount?: string | null, ownerId?: string | null, bank?: string | null) {
  const fingerprint = createHash("sha256").update(normalizeBankAccount(recipientAccount) || "unknown").digest("hex").slice(0, 20);
  const externalAccountId = `bank-email:${propertyId}:${fingerprint}`;
  const bankName = `${bankDisplayName(bank)} · e-mail`;
  return prisma.bankAccount.upsert({
    where: { provider_externalAccountId: { provider: "bank-email", externalAccountId } },
    update: { bankName, iban: normalizeBankAccount(recipientAccount) || null, ibanMasked: maskedAccount(recipientAccount), ...(ownerId ? { ownerId } : {}) },
    create: {
      propertyId,
      ownerId: ownerId || undefined,
      provider: "bank-email",
      bankName,
      accountName: "Sběrný e-mail bankovních notifikací",
      iban: normalizeBankAccount(recipientAccount) || undefined,
      ibanMasked: maskedAccount(recipientAccount),
      externalAccountId,
    },
  });
}

export async function materializeInboxPayment(inboxId: string, explicitLeaseId?: string, explicitExpensePropertyId?: string) {
  const inbox = await prisma.inboxPayment.findUnique({ where: { id: inboxId } });
  if (!inbox || !inbox.amountCents) return { imported: false, reason: "Pohyb nemá nenulovou částku." };
  if (inbox.amountCents < 0 && explicitLeaseId) return { imported: false, reason: "Odchozí pohyb nelze přiřadit k nájemní smlouvě." };
  if (inbox.transactionId) return { imported: true, transactionId: inbox.transactionId, reason: "Platba už byla importována." };

  if (!inbox.sourceTrusted && !explicitLeaseId && !explicitExpensePropertyId) return { imported: false, reason: "Zdroj vyžaduje ruční potvrzení." };

  const verification = await tryVerifyNotificationPayment({
    inboxId: inbox.id,
    amountCents: inbox.amountCents,
    currency: inbox.currency,
    recipientAccount: inbox.recipientAccount,
    variableSymbol: inbox.variableSymbol,
    receivedAt: inbox.receivedAt,
  });
  if (verification) {
    await reconcileInboxReview(inbox.id);
    return { imported: true, propertyId: verification.propertyId, reason: "Ověřovací platba 1 Kč potvrdila bankovní e-mailové notifikace." };
  }

  // VS and the counterparty of an outgoing transfer must not route it to a tenant.
  // Account rules run before house routing, so shared-account movements need no guessed house.
  const accountMatch = !explicitLeaseId && !explicitExpensePropertyId && inbox.sourceTrusted ? await matchingAccountBankRule(inbox) : { rule: null, ambiguous: false };
  if (accountMatch.ambiguous) {
    await prisma.inboxPayment.update({ where: { id: inbox.id }, data: { status: "UNMATCHED", parseNote: "Více účtových pravidel má stejnou prioritu a odlišný cíl. Potvrďte přiřazení ručně." } });
    await reconcileInboxReview(inbox.id);
    return { imported: false, reason: "Účtová pravidla mají nejednoznačný cíl." };
  }
  if (accountMatch.rule?.action === "IGNORE") {
    const reason = `Ignorováno účtovým pravidlem: ${accountMatch.rule.name}.`;
    await prisma.inboxPayment.update({ where: { id: inbox.id }, data: { status: "IGNORED", parseNote: reason } });
    await reconcileInboxReview(inbox.id);
    return { imported: false, ignored: true, reason };
  }

  if (inbox.currency !== "CZK") return { imported: false, reason: "Cizí měna vyžaduje ruční kontrolu; automatické zaúčtování není podporované." };
  let route = await inferRoute(inbox.amountCents < 0 ? { recipientAccount: inbox.recipientAccount } : inbox);
  if (explicitExpensePropertyId) {
    if (inbox.amountCents >= 0) return { imported: false, reason: "Tato cesta je určena pouze pro odchozí pohyby." };
    const links = await prisma.propertyPaymentAccount.findMany({ where: { propertyId: explicitExpensePropertyId, active: true, ownerBankAccount: { active: true } }, include: { ownerBankAccount: true } });
    const link = links.find(l => bankAccountMatches(l.ownerBankAccount, inbox.recipientAccount));
    if (!link) return { imported: false, reason: "Vybraný dům nemá přiřazený vlastní účet tohoto pohybu." };
    route = { propertyId: explicitExpensePropertyId, leaseId: null, ownerId: link.ownerBankAccount.ownerId, strong: false, reason: "ruční směrování výdaje na známý účet domu" };
  }
  if (explicitLeaseId) {
    const lease = await prisma.lease.findUnique({ where: { id: explicitLeaseId }, include: { unit: true, ownerBankAccount: true } });
    if (!lease) return { imported: false, reason: "Vybraná smlouva nebyla nalezena." };
    route = { propertyId: lease.unit.propertyId, leaseId: lease.id, ownerId: lease.ownerBankAccount?.ownerId || null, reason: "ruční potvrzení oprávněným uživatelem", strong: true };
  }
  const ruleLease=accountMatch.rule?.targetLease;
  if (accountMatch.rule && (!ruleLease?.ownerBankAccount || !bankAccountMatches(ruleLease.ownerBankAccount,inbox.recipientAccount))) {
    await prisma.inboxPayment.update({where:{id:inbox.id},data:{status:"UNMATCHED",parseNote:"Smlouva v účtovém pravidle už nepoužívá tento bankovní účet. Potvrďte cíl ručně."}});
    await reconcileInboxReview(inbox.id);
    return {imported:false,reason:"Cíl pravidla neodpovídá bankovnímu účtu."};
  }
  if (ruleLease && inbox.amountCents > 0 && ruleLease.ownerBankAccount && bankAccountMatches(ruleLease.ownerBankAccount,inbox.recipientAccount)) {
    route={propertyId:ruleLease.unit.propertyId,leaseId:accountMatch.rule!.action === "MATCH_LEASE"?ruleLease.id:null,ownerId:ruleLease.ownerBankAccount.ownerId,strong:true,reason:`účtové pravidlo: ${accountMatch.rule!.name}`};
  }
  if (!route.propertyId) {
    await prisma.inboxPayment.update({ where: { id: inbox.id }, data: { status: "UNMATCHED", parseNote: `${inbox.parseNote || ""} ${route.reason}.`.trim() } });
    await reconcileInboxReview(inbox.id);
    return { imported: false, reason: route.reason };
  }

  await touchPropertyPaymentNotification(route.propertyId, inbox.recipientAccount, inbox.receivedAt);
  const matchingRule = accountMatch.rule || explicitLeaseId || inbox.amountCents < 0 ? null : await matchingRuleForInbox(route.propertyId, inbox);
  if (matchingRule?.action === MatchRuleAction.IGNORE) {
    const reason = `Ignorováno pravidlem: ${matchingRule.name}.`;
    await prisma.inboxPayment.update({ where: { id: inbox.id }, data: { status: "IGNORED", propertyId: route.propertyId, parseNote: reason } });
    await reconcileInboxReview(inbox.id);
    return { imported: false, ignored: true, propertyId: route.propertyId, reason };
  }
  const account = await emailBankAccount(route.propertyId, inbox.recipientAccount, route.ownerId, inbox.bank);
  const transaction = await prisma.bankTransaction.upsert({
    where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: `email:${inbox.id}` } },
    update: {},
    create: {
      bankAccountId: account.id,
      externalId: `email:${inbox.id}`,
      bookedAt: inbox.bookedAt || inbox.receivedAt,
      amountCents: inbox.amountCents,
      currency: inbox.currency,
      counterpartyName: inbox.counterpartyName,
      counterpartyIban: inbox.counterpartyAccount,
      recipientAccount: inbox.recipientAccount,
      variableSymbol: inbox.variableSymbol,
      message: inbox.message || inbox.subject,
      source: "email-bank",
      matchNote: `Import ze sběrného e-mailu; směrování: ${route.reason}.`,
    },
  });

  if (inbox.amountCents < 0) {
    await prisma.bankTransaction.update({ where: { id: transaction.id }, data: { status: "IGNORED", matchNote: "Odchozí pohyb k posouzení v Bankovních výdajích." } });
    await runExpenseRules(route.propertyId, [transaction.id]);
    await reconcileTransactionReview(transaction.id);
  } else if (accountMatch.rule?.action === "SUGGEST_LEASE" && ruleLease) {
    await prisma.bankTransaction.update({where:{id:transaction.id},data:{status:"SUGGESTED",suggestedLeaseId:ruleLease.id,matchNote:`Návrh účtovým pravidlem: ${accountMatch.rule.name}.`}});
    await reconcileTransactionReview(transaction.id);
  } else if (explicitLeaseId || route.leaseId) {
    await allocateTransactionToLease(transaction.id, explicitLeaseId || route.leaseId!, `Bankovní e-mail: ${route.reason}.`);
  } else {
    await processTransaction(transaction.id);
  }
  await prisma.inboxPayment.update({ where: { id: inbox.id }, data: { status: "IMPORTED", propertyId: route.propertyId, transactionId: transaction.id } });
  await reconcileInboxReview(inbox.id);
  return { imported: true, transactionId: transaction.id, propertyId: route.propertyId, reason: route.reason };
}
