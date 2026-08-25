import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { allocateTransactionToLease, processTransaction } from "@/lib/matching";
import { bankAccountMatches, normalizeBankAccount } from "@/lib/inbound-bank/rb";

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

  if (vs) {
    const leases = await prisma.lease.findMany({
      where: {
        status: { in: ["ACTIVE", "FUTURE"] },
        ...(ownerAccountIds.length ? { ownerBankAccountId: { in: ownerAccountIds } } : {}),
      },
      include: { unit: true, ownerBankAccount: true, tenant: true },
    });
    const exact = leases.filter((lease) => normalizedVs(lease.variableSymbol) === vs);
    if (exact.length === 1) return { propertyId: exact[0].unit.propertyId, leaseId: exact[0].id, ownerId: exact[0].ownerBankAccount?.ownerId || null, reason: "cílový účet + VS" };
  }

  if (input.counterpartyAccount) {
    const payer = normalizeBankAccount(input.counterpartyAccount);
    const leases = await prisma.lease.findMany({
      where: { status: { in: ["ACTIVE", "FUTURE"] } },
      include: { unit: true, tenant: true, ownerBankAccount: true },
    });
    const exact = leases.filter((lease) => {
      if (ownerAccountIds.length && (!lease.ownerBankAccountId || !ownerAccountIds.includes(lease.ownerBankAccountId))) return false;
      const aliases = [lease.tenantBankAccount, ...lease.tenant.payerAccounts].map(normalizeBankAccount).filter(Boolean);
      return aliases.includes(payer);
    });
    if (exact.length === 1) return { propertyId: exact[0].unit.propertyId, leaseId: exact[0].id, ownerId: exact[0].ownerBankAccount?.ownerId || null, reason: "cílový účet + známý účet plátce" };
  }

  if (ownerAccountIds.length) {
    const [leaseRows, ownershipRows] = await Promise.all([
      prisma.lease.findMany({ where: { ownerBankAccountId: { in: ownerAccountIds }, status: { in: ["ACTIVE", "FUTURE"] } }, include: { unit: true, ownerBankAccount: true } }),
      prisma.unitOwnership.findMany({ where: { ownerBankAccountId: { in: ownerAccountIds } }, include: { unit: true, ownerBankAccount: true } }),
    ]);
    const propertyIds = new Set([...leaseRows.map((row) => row.unit.propertyId), ...ownershipRows.map((row) => row.unit.propertyId)]);
    if (propertyIds.size === 1) {
      const propertyId = [...propertyIds][0];
      const ownerId = leaseRows.find((row) => row.unit.propertyId === propertyId)?.ownerBankAccount?.ownerId || ownershipRows.find((row) => row.unit.propertyId === propertyId)?.ownerBankAccount?.ownerId || null;
      return { propertyId, leaseId: null, ownerId, reason: "jednoznačný cílový účet objektu" };
    }
  }

  return { propertyId: null, leaseId: null, ownerId: null, reason: "nelze jednoznačně určit objekt" };
}

async function emailBankAccount(propertyId: string, recipientAccount?: string | null, ownerId?: string | null) {
  const fingerprint = createHash("sha256").update(normalizeBankAccount(recipientAccount) || "unknown").digest("hex").slice(0, 20);
  const externalAccountId = `rb-email:${propertyId}:${fingerprint}`;
  return prisma.bankAccount.upsert({
    where: { provider_externalAccountId: { provider: "rb-email", externalAccountId } },
    update: { bankName: "Raiffeisenbank · e-mail", ibanMasked: maskedAccount(recipientAccount), ...(ownerId ? { ownerId } : {}) },
    create: {
      propertyId,
      ownerId: ownerId || undefined,
      provider: "rb-email",
      bankName: "Raiffeisenbank · e-mail",
      accountName: "Sběrný e-mail bankovních notifikací",
      iban: normalizeBankAccount(recipientAccount).startsWith("CZ") ? normalizeBankAccount(recipientAccount) : undefined,
      ibanMasked: maskedAccount(recipientAccount),
      externalAccountId,
      connectionStatus: "CONNECTED",
      autoSyncEnabled: false,
    },
  });
}

export async function materializeInboxPayment(inboxId: string, explicitLeaseId?: string) {
  const inbox = await prisma.inboxPayment.findUnique({ where: { id: inboxId } });
  if (!inbox || !inbox.amountCents || inbox.amountCents <= 0) return { imported: false, reason: "Platba nemá kladnou částku." };
  if (inbox.transactionId) return { imported: true, transactionId: inbox.transactionId, reason: "Platba už byla importována." };

  let route = await inferRoute(inbox);
  if (explicitLeaseId) {
    const lease = await prisma.lease.findUnique({ where: { id: explicitLeaseId }, include: { unit: true, ownerBankAccount: true } });
    if (!lease) return { imported: false, reason: "Vybraná smlouva nebyla nalezena." };
    route = { propertyId: lease.unit.propertyId, leaseId: lease.id, ownerId: lease.ownerBankAccount?.ownerId || null, reason: "ruční potvrzení hlavním administrátorem" };
  }
  if (!route.propertyId) {
    await prisma.inboxPayment.update({ where: { id: inbox.id }, data: { status: "UNMATCHED", parseNote: `${inbox.parseNote || ""} ${route.reason}.`.trim() } });
    return { imported: false, reason: route.reason };
  }

  const account = await emailBankAccount(route.propertyId, inbox.recipientAccount, route.ownerId);
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
      source: "email-rb",
      matchNote: `Import ze sběrného e-mailu; směrování: ${route.reason}.`,
    },
  });

  if (explicitLeaseId || route.leaseId) {
    await allocateTransactionToLease(transaction.id, explicitLeaseId || route.leaseId!, `RB e-mail: ${route.reason}.`);
  } else {
    await processTransaction(transaction.id);
  }
  await prisma.inboxPayment.update({ where: { id: inbox.id }, data: { status: "IMPORTED", propertyId: route.propertyId, transactionId: transaction.id } });
  return { imported: true, transactionId: transaction.id, propertyId: route.propertyId, reason: route.reason };
}
