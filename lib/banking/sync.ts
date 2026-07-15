import { prisma } from "@/lib/db";
import { bankingProvider } from "@/lib/banking";
import { processPropertyTransactions } from "@/lib/matching";
import { openCredentials, sealCredentials } from "@/lib/banking/secret";
import type { SyncOptions } from "@/lib/banking/types";

export type BankSyncResult = {
  received: number;
  created: number;
  updated: number;
  processed: number;
};

export async function syncBankAccount(accountId: string, options?: SyncOptions): Promise<BankSyncResult> {
  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Bankovní účet nebyl nalezen.");
  await prisma.bankAccount.update({ where: { id: account.id }, data: { lastSyncAttemptAt: new Date(), lastSyncError: null } });
  try {
    const provider = bankingProvider(account.provider);
    const result = await provider.sync({
      id: account.id,
      externalAccountId: account.externalAccountId,
      externalSessionId: account.externalSessionId,
      lastSyncedAt: account.lastSyncedAt,
      credentials: openCredentials(account.credentialsEncrypted),
    }, options);
    const incoming = result.transactions.filter((item) => item.amountCents > 0);
    const ids: string[] = [];
    let created = 0;
    let updated = 0;
    for (const item of incoming) {
      const existing = await prisma.bankTransaction.findUnique({
        where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: item.externalId } },
        select: { id: true },
      });
      const saved = await prisma.bankTransaction.upsert({
        where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: item.externalId } },
        update: { ...item },
        create: { ...item, bankAccountId: account.id },
      });
      existing ? updated += 1 : created += 1;
      ids.push(saved.id);
    }
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncError: null,
        connectionStatus: "CONNECTED",
        ...(result.balance ? { balanceCents: result.balance.amountCents, balanceUpdatedAt: new Date() } : {}),
        ...(result.credentials ? { credentialsEncrypted: sealCredentials(result.credentials) } : {}),
      },
    });
    const processed = await processPropertyTransactions(account.propertyId, ids);
    return { received: incoming.length, created, updated, processed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronizace selhala.";
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { connectionStatus: "ERROR", lastSyncError: message },
    }).catch(() => null);
    throw error;
  }
}
