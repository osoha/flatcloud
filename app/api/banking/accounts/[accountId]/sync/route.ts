import { prisma } from "@/lib/db";
import { bankingProvider } from "@/lib/banking";
import { requireManagedProperty, audit } from "@/lib/management";
import { processPropertyTransactions } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) return go(request, "/portfolio");
  const access = await requireManagedProperty(account.propertyId);
  if (!access) return go(request, "/login");
  try {
    const provider = bankingProvider(account.provider);
    const incoming = await provider.sync(account);
    const ids: string[] = [];
    for (const item of incoming) {
      const saved = await prisma.bankTransaction.upsert({
        where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: item.externalId } },
        update: { ...item },
        create: { ...item, bankAccountId: account.id },
      });
      ids.push(saved.id);
    }
    const balance = await provider.balance(account).catch(() => null);
    await prisma.bankAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(), ...(balance ? { balanceCents: balance.amountCents, balanceUpdatedAt: new Date() } : {}) } });
    const processed = await processPropertyTransactions(account.propertyId, ids);
    await audit(access.user.id, "BANK_SYNC", "BankAccount", account.id, { propertyId: account.propertyId, count: incoming.length, processed });
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "ok", `Načteno ${incoming.length} transakcí, zpracováno ${processed}.`);
  } catch (error) {
    await prisma.bankAccount.update({ where: { id: account.id }, data: { connectionStatus: "ERROR" } }).catch(() => null);
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "error", error instanceof Error ? error.message : "Synchronizace selhala.");
  }
}
