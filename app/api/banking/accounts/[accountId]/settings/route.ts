import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) return go(request, "/portfolio");
  const access = await requireManagedProperty(account.propertyId);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId");
    if (ownerId && !(await prisma.owner.findUnique({ where: { id: ownerId } }))) throw new Error("Vlastník nebyl nalezen.");
    await prisma.bankAccount.update({ where: { id: accountId }, data: { ownerId, accountName: text(form, "accountName"), autoSyncEnabled: form.get("autoSyncEnabled") === "on" } });
    await audit(access.user.id, "BANK_ACCOUNT_UPDATED", "BankAccount", accountId, { propertyId: account.propertyId, ownerId });
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "ok", "Nastavení bankovního účtu bylo uloženo.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${account.propertyId}/banka`, "error", error instanceof Error ? error.message : "Nastavení účtu se nepodařilo uložit.");
  }
}
