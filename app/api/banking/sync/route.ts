import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { syncBankAccount } from "@/lib/banking/sync";
import { go, goWithMessage } from "@/lib/route-response";

/**
 * Kompatibilní endpoint pro starší formuláře z verzí V6/V7.
 * Nová verze používá endpoint /api/banking/accounts/[accountId]/sync,
 * ale tento soubor může bezpečně zůstat v repozitáři.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const propertyId = String(form.get("propertyId") ?? "").trim();

  if (!propertyId) return go(request, "/portfolio");

  const access = await requireManagedProperty(propertyId);
  if (!access) return go(request, "/login");

  const account = await prisma.bankAccount.findFirst({
    where: { propertyId },
    orderBy: { lastSyncedAt: "desc" },
  });

  if (!account) {
    return goWithMessage(
      request,
      `/nemovitosti/${propertyId}/banka`,
      "error",
      "K nemovitosti není připojen žádný bankovní účet.",
    );
  }

  try {
    const result = await syncBankAccount(account.id);
    await audit(access.user.id, "BANK_SYNC", "BankAccount", account.id, {
      propertyId,
      ...result,
    });

    return goWithMessage(
      request,
      `/nemovitosti/${propertyId}/banka`,
      "ok",
      `Načteno ${result.received} příchozích transakcí (${result.created} nových, ${result.updated} aktualizovaných), zpracováno ${result.processed}.`,
    );
  } catch (error) {
    return goWithMessage(
      request,
      `/nemovitosti/${propertyId}/banka`,
      "error",
      error instanceof Error ? error.message : "Synchronizace selhala.",
    );
  }
}
