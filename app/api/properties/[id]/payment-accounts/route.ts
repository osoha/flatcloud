import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login");
  const { id } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/banka`, "error", "Nemáte oprávnění měnit účty nemovitosti.");
  try {
    const form = await request.formData();
    const accountId = text(form, "accountId", true)!;
    const mode = text(form, "mode") || "add";
    const property = await prisma.property.findUnique({ where: { id }, include: { ownerships: true, units: { include: { ownerships: true } } } });
    if (!property) throw new Error("Nemovitost nebyla nalezena.");
    const account = await prisma.ownerBankAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.active) throw new Error("Vybraný účet nebyl nalezen nebo není aktivní.");
    const allowedOwnerIds = new Set([property.ownerId, ...property.ownerships.map((row)=>row.ownerId), ...property.units.flatMap((unit)=>unit.ownerships.map((row)=>row.ownerId))]);
    if (!allowedOwnerIds.has(account.ownerId)) throw new Error("Účet nepatří vlastníkovi ani spoluvlastníkovi této nemovitosti.");
    if (mode === "remove") {
      const [leaseUse, ownershipUse] = await Promise.all([
        prisma.lease.count({ where: { ownerBankAccountId: accountId, status: { in: ["ACTIVE", "FUTURE"] }, unit: { propertyId: id } } }),
        prisma.unitOwnership.count({ where: { ownerBankAccountId: accountId, unit: { propertyId: id } } }),
      ]);
      if (leaseUse || ownershipUse) throw new Error("Účet nelze z objektu odebrat, protože jej používá jednotka nebo aktivní/budoucí smlouva. Nejprve změňte účet u těchto záznamů.");
      await prisma.propertyPaymentAccount.deleteMany({ where: { propertyId: id, ownerBankAccountId: accountId } });
      await audit(user.id, "PROPERTY_PAYMENT_ACCOUNT_REMOVED", "OwnerBankAccount", accountId, {}, id);
      return goWithMessage(request, `/nemovitosti/${id}/banka`, "ok", "Účet byl z nemovitosti odebrán.");
    }
    const primary = boolValue(form, "primary");
    await prisma.$transaction(async (tx) => {
      if (primary) await tx.propertyPaymentAccount.updateMany({ where: { propertyId: id }, data: { primary: false } });
      await tx.propertyPaymentAccount.upsert({
        where: { propertyId_ownerBankAccountId: { propertyId: id, ownerBankAccountId: accountId } },
        update: { active: true, primary },
        create: { propertyId: id, ownerBankAccountId: accountId, active: true, primary },
      });
    });
    await audit(user.id, "PROPERTY_PAYMENT_ACCOUNT_ADDED", "OwnerBankAccount", accountId, { primary }, id);
    return goWithMessage(request, `/nemovitosti/${id}/banka`, "ok", "Účet pro nájemné byl přiřazen k nemovitosti.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/banka`, "error", error instanceof Error ? error.message : "Účet se nepodařilo uložit.");
  }
}
