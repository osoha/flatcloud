import { OwnerType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { validateOwnerBankAccount } from "@/lib/owner-bank-account";
import { requirePortfolioManager, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await requirePortfolioManager();
  if (!user) return go(request, "/login");
  try {
    const form = await request.formData();
    const hasAccount = Boolean(text(form, "accountNumber") || text(form, "iban"));
    const paymentAccount = hasAccount ? validateOwnerBankAccount({
      label: text(form, "accountLabel"),
      accountNumber: text(form, "accountNumber"),
      bankCode: text(form, "bankCode"),
      iban: text(form, "iban"),
      currency: text(form, "currency") || "CZK",
    }) : null;
    const owner = await prisma.owner.create({
      data: {
        name: text(form, "name", true)!,
        type: (text(form, "type") || "COMPANY") as OwnerType,
        ico: text(form, "ico"),
        email: text(form, "email"),
        phone: text(form, "phone"),
        address: text(form, "address"),
        note: text(form, "note"),
        ...(paymentAccount ? { paymentAccounts: { create: { ...paymentAccount, active: true } } } : {}),
      },
    });
    await audit(user.id, "OWNER_CREATED", "Owner", owner.id, { name: owner.name, paymentAccountCreated: Boolean(paymentAccount) });
    return goWithMessage(request, `/vlastnici/${owner.id}`, "ok", "Vlastník byl vytvořen.");
  } catch (error) {
    return goWithMessage(request, "/vlastnici", "error", error instanceof Error ? error.message : "Vlastníka se nepodařilo vytvořit.");
  }
}
