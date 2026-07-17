import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { validateOwnerBankAccount } from "@/lib/owner-bank-account";
import { requirePortfolioManager, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; accountId: string }> }) {
  const user = await requirePortfolioManager();
  if (!user) return go(request, "/login");
  const { id, accountId } = await params;
  try {
    const existing = await prisma.ownerBankAccount.findFirst({ where: { id: accountId, ownerId: id } });
    if (!existing) throw new Error("Bankovní účet vlastníka nebyl nalezen.");
    const form = await request.formData();
    if (text(form, "mode") === "delete") {
      const [unitUses, leaseUses] = await Promise.all([
        prisma.unitOwnership.count({ where: { ownerBankAccountId: accountId } }),
        prisma.lease.count({ where: { ownerBankAccountId: accountId } }),
      ]);
      if (unitUses > 0) throw new Error("Účet je vybraný u vlastnictví jednotky. Nejprve u jednotky zvolte jiný účet.");
      if (leaseUses > 0) throw new Error("Účet je uložený u nájemní smlouvy. Účet ponechte v evidenci a případně jej označte jako neaktivní.");
      await prisma.ownerBankAccount.delete({ where: { id: accountId } });
      await audit(user.id, "OWNER_BANK_ACCOUNT_DELETED", "OwnerBankAccount", accountId, { ownerId: id });
      return goWithMessage(request, `/vlastnici/${id}`, "ok", "Bankovní účet byl odstraněn.");
    }
    const account = validateOwnerBankAccount({
      label: text(form, "label"),
      accountNumber: text(form, "accountNumber"),
      bankCode: text(form, "bankCode"),
      iban: text(form, "iban"),
      currency: text(form, "currency") || "CZK",
    });
    const updated = await prisma.ownerBankAccount.update({ where: { id: accountId }, data: { ...account, active: boolValue(form, "active") } });
    await audit(user.id, "OWNER_BANK_ACCOUNT_UPDATED", "OwnerBankAccount", updated.id, { ownerId: id, active: updated.active });
    return goWithMessage(request, `/vlastnici/${id}`, "ok", "Bankovní účet byl upraven.");
  } catch (error) {
    return goWithMessage(request, `/vlastnici/${id}`, "error", error instanceof Error ? error.message : "Účet se nepodařilo upravit.");
  }
}
