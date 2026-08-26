import { createHash } from "node:crypto";
import { prisma } from "./db";
import { bankAccountMatches } from "./inbound-bank/bank-email";

function normalizedVs(value?: string | null) {
  return (value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function verificationCodeForLink(linkId: string) {
  const raw = createHash("sha256").update(`flatcloud-bank-email-link:${linkId}`).digest().readUInt32BE(0);
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
    where: { active: true, ownerBankAccountId: { in: accounts.map((account) => account.id) } },
  });
  const candidates = links.filter((link) => normalizedVs(verificationCodeForLink(link.id)) === vs);
  if (candidates.length !== 1) return null;

  const link = candidates[0];
  await prisma.$transaction([
    prisma.propertyPaymentAccount.update({
      where: { id: link.id },
      data: { notificationVerifiedAt: input.receivedAt, lastNotificationAt: input.receivedAt },
    }),
    prisma.inboxPayment.update({
      where: { id: input.inboxId },
      data: {
        status: "IGNORED",
        propertyId: link.propertyId,
        parseNote: "Ověřovací platba 1,00 Kč přijata. E-mailové notifikace pro tento účet a nemovitost jsou funkční.",
      },
    }),
    prisma.auditLog.create({
      data: {
        propertyId: link.propertyId,
        action: "BANK_EMAIL_ACCOUNT_VERIFIED",
        entityType: "PropertyPaymentAccount",
        entityId: link.id,
        details: { inboxId: input.inboxId, ownerBankAccountId: link.ownerBankAccountId },
      },
    }),
  ]);
  return { linkId: link.id, accountId: link.ownerBankAccountId, propertyId: link.propertyId };
}

export async function manuallyVerifyNotificationPayment(input: { inboxId: string; linkId: string; userId: string }) {
  const [inbox, link] = await Promise.all([
    prisma.inboxPayment.findUnique({ where: { id: input.inboxId } }),
    prisma.propertyPaymentAccount.findUnique({ where: { id: input.linkId }, include: { ownerBankAccount: true } }),
  ]);
  if (!inbox) throw new Error("Bankovní e-mail nebyl nalezen.");
  if (!link || !link.active) throw new Error("Vybrané propojení bankovního účtu není aktivní.");
  if (inbox.amountCents !== 100) throw new Error("Ruční potvrzení testu je možné pouze pro platbu 1,00 Kč.");
  if (!bankAccountMatches(link.ownerBankAccount, inbox.recipientAccount)) throw new Error("Cílový účet e-mailu neodpovídá vybranému bankovnímu účtu.");
  if (normalizedVs(inbox.variableSymbol) !== normalizedVs(verificationCodeForLink(link.id))) throw new Error("Variabilní symbol neodpovídá testovacímu kódu vybraného účtu a nemovitosti.");

  await prisma.$transaction([
    prisma.propertyPaymentAccount.update({
      where: { id: link.id },
      data: { notificationVerifiedAt: inbox.receivedAt, lastNotificationAt: inbox.receivedAt },
    }),
    prisma.ownerBankAccount.update({
      where: { id: link.ownerBankAccountId },
      data: { lastNotificationAt: inbox.receivedAt },
    }),
    prisma.inboxPayment.update({
      where: { id: inbox.id },
      data: {
        status: "IGNORED",
        propertyId: link.propertyId,
        parseNote: "Testovací platba 1,00 Kč byla ručně potvrzena hlavním administrátorem. E-mailové notifikace pro tento účet a nemovitost jsou funkční.",
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: input.userId,
        propertyId: link.propertyId,
        action: "BANK_EMAIL_ACCOUNT_VERIFIED_MANUALLY",
        entityType: "PropertyPaymentAccount",
        entityId: link.id,
        details: { inboxId: inbox.id, ownerBankAccountId: link.ownerBankAccountId },
      },
    }),
  ]);
  return { linkId: link.id, accountId: link.ownerBankAccountId, propertyId: link.propertyId };
}
