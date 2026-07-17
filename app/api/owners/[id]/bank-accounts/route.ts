import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { validateOwnerBankAccount } from "@/lib/owner-bank-account";
import { requirePortfolioManager, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortfolioManager();
  if (!user) return go(request, "/login");
  const { id } = await params;
  try {
    const owner = await prisma.owner.findUnique({ where: { id }, select: { id: true } });
    if (!owner) throw new Error("Vlastník nebyl nalezen.");
    const form = await request.formData();
    const account = validateOwnerBankAccount({
      label: text(form, "label"),
      accountNumber: text(form, "accountNumber"),
      bankCode: text(form, "bankCode"),
      iban: text(form, "iban"),
      currency: text(form, "currency") || "CZK",
    });
    const created = await prisma.ownerBankAccount.create({ data: { ownerId: id, ...account, active: boolValue(form, "active") } });
    await audit(user.id, "OWNER_BANK_ACCOUNT_CREATED", "OwnerBankAccount", created.id, { ownerId: id });
    return goWithMessage(request, `/vlastnici/${id}`, "ok", "Bankovní účet vlastníka byl přidán.");
  } catch (error) {
    return goWithMessage(request, `/vlastnici/${id}`, "error", error instanceof Error ? error.message : "Účet se nepodařilo přidat.");
  }
}
