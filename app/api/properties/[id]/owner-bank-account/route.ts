import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { ownerSelfServiceScope, requireOwnedAccount } from "@/lib/owner-self-service";
import { normalizeAccountNumber, normalizeBankCode, normalizeIban, samePhysicalBankAccount, validateOwnerBankAccount } from "@/lib/owner-bank-account";
import { go, goWithMessage } from "@/lib/route-response";
import { leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { assertUniqueVariableSymbol } from "@/lib/variable-symbol";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id: propertyId } = await params;
  const back = `/nemovitosti/${propertyId}/banka`;
  try {
    const form = await request.formData();
    const accountId = text(form, "accountId");
    const scope = accountId ? await requireOwnedAccount(user, propertyId, accountId) : await ownerSelfServiceScope(user, propertyId);
    if (!scope) throw new Error("Vlastnictví účtu nelze bezpečně ověřit. Obraťte se na správce nemovitosti.");

    const account = validateOwnerBankAccount({
      label: text(form, "label"), accountNumber: text(form, "accountNumber"), bankCode: text(form, "bankCode"), iban: text(form, "iban"), currency: "CZK",
    });
    const selectedUnitIds = [...new Set(form.getAll("unitIds").filter((value): value is string => typeof value === "string" && Boolean(value)))];
    const authorizedByUnitId = new Map(scope.unitOwnerships.map((ownership) => [ownership.unitId, ownership]));
    if (!accountId && !selectedUnitIds.length) throw new Error("Vyberte alespoň jednu jednotku, ke které má být nový účet přiřazen.");
    if (selectedUnitIds.some((unitId) => !authorizedByUnitId.has(unitId))) throw new Error("Vybraná jednotka nepatří do vašeho oprávněného rozsahu.");
    const previous = accountId ? scope.paymentAccounts.find((item) => item.id === accountId) : null;
    const identityChanged = Boolean(previous && (
      normalizeAccountNumber(previous.accountNumber) !== (account.accountNumber || "") ||
      normalizeBankCode(previous.bankCode) !== (account.bankCode || "") ||
      normalizeIban(previous.iban) !== (account.iban || "")
    ));
    const duplicate = scope.allOwnerAccounts.find((candidate) => candidate.id !== accountId && samePhysicalBankAccount(candidate, account));
    if (duplicate) throw new Error("Tento bankovní účet již existuje. Aktivujte / použijte existující účet.");

    const saved = await prisma.$transaction(async (tx) => {
      const savedAccount = accountId
        ? await tx.ownerBankAccount.update({ where: { id: accountId, ownerId: scope.id }, data: { ...account, active: true, ...(identityChanged ? { notificationVerifiedAt: null } : {}) } })
        : await tx.ownerBankAccount.create({ data: { ownerId: scope.id, ...account, active: true } });

      for (const unitId of selectedUnitIds) {
        const ownership = authorizedByUnitId.get(unitId);
        if (!ownership || ownership.ownerId !== scope.id) throw new Error("Vlastnictví vybrané jednotky nelze ověřit.");
        const leaseRows = await tx.lease.findMany({ where: { unitId }, select: { id: true, variableSymbol: true, startDate: true, endDate: true, terminatedOn: true, cancelledAt: true } });
        const affectedLeases = leaseRows.filter((lease) => leaseStatusAt(lease) !== "ENDED");
        for (const lease of affectedLeases) await assertUniqueVariableSymbol(tx, savedAccount.id, lease.variableSymbol, lease.id);
        await tx.unitOwnership.update({ where: { id: ownership.id, ownerId: scope.id }, data: { ownerBankAccountId: savedAccount.id } });
        if (affectedLeases.length) await tx.lease.updateMany({ where: { id: { in: affectedLeases.map((lease) => lease.id) } }, data: { ownerBankAccountId: savedAccount.id } });
      }

      await tx.propertyPaymentAccount.upsert({
        where: { propertyId_ownerBankAccountId: { propertyId, ownerBankAccountId: savedAccount.id } },
        update: { active: true }, create: { propertyId, ownerBankAccountId: savedAccount.id, active: true, primary: false },
      });
      return savedAccount;
    });
    await audit(user.id, accountId ? "OWNER_BANK_ACCOUNT_UPDATED" : "OWNER_BANK_ACCOUNT_CREATED", "OwnerBankAccount", saved.id, { ownerId: scope.id, ownerSelfService: true, selectedUnitIds, identityChanged }, propertyId);
    return goWithMessage(request, `${back}#ucet-${saved.id}`, "ok", selectedUnitIds.length ? "Bankovní účet byl uložen a přiřazen k vybraným jednotkám." : "Údaje bankovního účtu byly uloženy.");
  } catch (error) {
    return goWithMessage(request, back, "error", error instanceof Error ? error.message : "Bankovní účet se nepodařilo uložit.");
  }
}
