import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { syncBankAccount } from "@/lib/banking/sync";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) return go(request, "/portfolio");
  const access = await requireManagedProperty(account.propertyId);
  if (!access) return go(request, "/login");
  try {
    const result = await syncBankAccount(account.id);
    await audit(access.user.id, "BANK_SYNC", "BankAccount", account.id, { propertyId: account.propertyId, ...result });
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "ok", `Načteno ${result.received} transakcí (${result.created} nových, ${result.updated} existujících), zpracováno ${result.processed}.`);
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "error", error instanceof Error ? error.message : "Synchronizace selhala.");
  }
}
