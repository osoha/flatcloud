import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { syncBankAccount } from "@/lib/banking/sync";
import { go, goWithMessage } from "@/lib/route-response";

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Vyberte platné datum od.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now()) throw new Error("Datum nesmí být v budoucnosti.");
  return date;
}

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) return go(request, "/portfolio");
  const access = await requireManagedProperty(account.propertyId);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const dateFrom = parseDate(form.get("dateFrom"));
    const result = await syncBankAccount(account.id, { dateFrom, strategy: "longest" });
    await audit(access.user.id, "BANK_HISTORY_SYNC", "BankAccount", account.id, { propertyId: account.propertyId, dateFrom: dateFrom.toISOString(), ...result });
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "ok", `Historie od ${dateFrom.toLocaleDateString("cs-CZ")} načtena: ${result.created} nových, ${result.updated} duplicitních nebo aktualizovaných transakcí.`);
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "error", error instanceof Error ? error.message : "Historická synchronizace selhala.");
  }
}
