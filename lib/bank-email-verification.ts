import { createHash } from "node:crypto";
import { prisma } from "./db";
import { bankAccountMatches } from "./inbound-bank/bank-email";
import { linkIsUsedByUnit } from "./bank-verification-scope";

function normalizedVs(value?: string | null) {
  return (value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function verificationCodeForAccount(ownerBankAccountId: string) {
  const raw = createHash("sha256").update(`flatcloud-bank-email-account:${ownerBankAccountId}`).digest().readUInt32BE(0);
  return String(10_000_000 + (raw % 90_000_000));
}

export async function matchingOwnerBankAccounts(recipientAccount?: string | null) {
  if (!recipientAccount) return [];
  const accounts = await prisma.ownerBankAccount.findMany({ where: { active: true } });
  return accounts.filter((account) => bankAccountMatches(account, recipientAccount));
}

export async function touchOwnerBankNotification(recipientAccount: string | null | undefined, receivedAt: Date) {
  const accounts = await matchingOwnerBankAccounts(recipientAccount);
  if (accounts.length) {
    await prisma.ownerBankAccount.updateMany({
      where: { id: { in: accounts.map((account) => account.id) } },
      data: { lastNotificationAt: receivedAt },
    });
  }
  return accounts;
}

export async function touchPropertyPaymentNotification(propertyId: string, recipientAccount: string | null | undefined, receivedAt: Date) {
  const accounts = await touchOwnerBankNotification(recipientAccount, receivedAt);
  if (!accounts.length) return [];
  const accountIds = accounts.map((account) => account.id);
  await prisma.propertyPaymentAccount.updateMany({
    where: { propertyId, active: true, ownerBankAccountId: { in: accountIds } },
    data: { lastNotificationAt: receivedAt },
  });
  return accounts;
}

export async function tryVerifyNotificationPayment(input: {
  inboxId: string;
  amountCents: number | null;
  recipientAccount?: string | null;
  variableSymbol?: string | null;
  receivedAt: Date;
}) {
  const accounts = await touchOwnerBankNotification(input.recipientAccount, input.receivedAt);
  if (input.amountCents !== 100) return null;
  const vs = normalizedVs(input.variableSymbol);
  if (!vs || !accounts.length) return null;

  const links = await prisma.propertyPaymentAccount.findMany({
    where: { active: true, property: { active: true }, ownerBankAccountId: { in: accounts.map((account) => account.id) } },
    include: { property: { include: { units: { select: { id: true, ownerships: { select: { ownerBankAccountId: true } } } } } } },
  });
  const candidates = links.filter((link) => linkIsUsedByUnit(link.ownerBankAccountId, link.property.units) && normalizedVs(verificationCodeForAccount(link.ownerBankAccountId)) === vs);
  if (!candidates.length) return null;

  const link = candidates[0];
  const verifiedOwnerBankAccountIds = accounts.map((account) => account.id);
  const affectedOwnerships = await prisma.unitOwnership.findMany({ where: { ownerBankAccountId: { in: verifiedOwnerBankAccountIds } }, select: { unitId: true, unit: { select: { propertyId: true } } } });
  const coveredUnitIds = [...new Set(affectedOwnerships.map((ownership) => ownership.unitId))];
  const affectedPropertyIds = [...new Set(affectedOwnerships.map((ownership) => ownership.unit.propertyId))];
  await prisma.$transaction([
    prisma.ownerBankAccount.updateMany({ where: { id: { in: verifiedOwnerBankAccountIds } }, data: { notificationVerifiedAt: input.receivedAt, lastNotificationAt: input.receivedAt } }),
    prisma.inboxPayment.update({
      where: { id: input.inboxId },
      data: {
        status: "IGNORED",
        propertyId: link.propertyId,
        parseNote: `Ověřovací platba 1,00 Kč přijata. Bankovní e-mail je ověřen pro ${coveredUnitIds.length} jednotek používajících tento účet.`,
      },
    }),
    prisma.auditLog.create({
      data: {
        propertyId: link.propertyId,
        action: "BANK_EMAIL_ACCOUNT_VERIFIED",
        entityType: "OwnerBankAccount",
        entityId: link.ownerBankAccountId,
        details: { inboxId: input.inboxId, verifiedOwnerBankAccountIds, propertyIds: affectedPropertyIds, unitIds: coveredUnitIds },
      },
    }),
  ]);
  return { linkId: link.id, accountId: link.ownerBankAccountId, propertyId: link.propertyId };
}

export async function manuallyVerifyNotificationPayment(input: { inboxId: string; linkId: string; userId: string }) {
  const [inbox, link] = await Promise.all([
    prisma.inboxPayment.findUnique({ where: { id: input.inboxId } }),
    prisma.propertyPaymentAccount.findUnique({ where: { id: input.linkId }, include: { ownerBankAccount: true, property: { include: { units: { select: { id: true, ownerships: { select: { ownerBankAccountId: true } } } } } } } }),
  ]);
  if (!inbox) throw new Error("Bankovní e-mail nebyl nalezen.");
  if (!link || !link.active) throw new Error("Vybrané propojení bankovního účtu není aktivní.");
  if (!linkIsUsedByUnit(link.ownerBankAccountId, link.property.units)) throw new Error("Bankovní účet není přiřazen žádné jednotce této nemovitosti. Ověření nelze použít pro celý objekt.");
  if (inbox.amountCents !== 100) throw new Error("Ruční potvrzení testu je možné pouze pro platbu 1,00 Kč.");
  if (!bankAccountMatches(link.ownerBankAccount, inbox.recipientAccount)) throw new Error("Cílový účet e-mailu neodpovídá vybranému bankovnímu účtu.");
  if (normalizedVs(inbox.variableSymbol) !== normalizedVs(verificationCodeForAccount(link.ownerBankAccountId))) throw new Error("Variabilní symbol neodpovídá testovacímu kódu vybraného účtu.");
  const matchingAccounts = await matchingOwnerBankAccounts(inbox.recipientAccount);
  const verifiedOwnerBankAccountIds = matchingAccounts.map((account) => account.id);
  const affectedOwnerships = await prisma.unitOwnership.findMany({ where: { ownerBankAccountId: { in: verifiedOwnerBankAccountIds } }, select: { unitId: true, unit: { select: { propertyId: true } } } });
  const coveredUnitIds = [...new Set(affectedOwnerships.map((ownership) => ownership.unitId))];
  const affectedPropertyIds = [...new Set(affectedOwnerships.map((ownership) => ownership.unit.propertyId))];

  await prisma.$transaction([
    prisma.ownerBankAccount.updateMany({
      where: { id: { in: verifiedOwnerBankAccountIds }, active: true },
      data: { notificationVerifiedAt: inbox.receivedAt, lastNotificationAt: inbox.receivedAt },
    }),
    prisma.inboxPayment.update({
      where: { id: inbox.id },
      data: {
        status: "IGNORED",
        propertyId: link.propertyId,
        parseNote: `Testovací platba 1,00 Kč byla ručně potvrzena hlavním administrátorem. Bankovní e-mail je ověřen pro ${coveredUnitIds.length} jednotek používajících tento účet.`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: input.userId,
        propertyId: link.propertyId,
        action: "BANK_EMAIL_ACCOUNT_VERIFIED_MANUALLY",
        entityType: "OwnerBankAccount",
        entityId: link.ownerBankAccountId,
        details: { inboxId: inbox.id, verifiedOwnerBankAccountIds, propertyIds: affectedPropertyIds, unitIds: coveredUnitIds },
      },
    }),
  ]);
  return { linkId: link.id, accountId: link.ownerBankAccountId, propertyId: link.propertyId };
}
