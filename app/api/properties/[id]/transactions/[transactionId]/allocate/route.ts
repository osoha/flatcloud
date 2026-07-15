import { prisma } from "@/lib/db";
import { moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { recomputeTransactionStatus } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; transactionId: string }> }) {
  const { id, transactionId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const chargeId = text(form, "chargeId", true)!;
    const transaction = await prisma.bankTransaction.findFirst({ where: { id: transactionId, bankAccount: { propertyId: id } }, include: { allocations: true } });
    const charge = await prisma.charge.findFirst({ where: { id: chargeId, lease: { unit: { propertyId: id } } }, include: { allocations: true } });
    if (!transaction || !charge) throw new Error("Platba nebo předpis nebyly nalezeny.");
    if (transaction.amountCents <= 0) throw new Error("Odchozí platbu nelze přiřadit k nájemnému.");
    const allocated = transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0);
    const remainingTransaction = transaction.amountCents - allocated;
    const chargePaid = charge.allocations.reduce((sum, row) => sum + row.amountCents, 0);
    const remainingCharge = charge.amountCents - chargePaid;
    const requested = text(form, "amount") ? moneyToCents(form, "amount") : Math.min(remainingTransaction, remainingCharge);
    if (requested <= 0 || requested > remainingTransaction || requested > remainingCharge) throw new Error("Částka přesahuje zůstatek platby nebo předpisu.");
    await prisma.paymentAllocation.upsert({
      where: { transactionId_chargeId: { transactionId, chargeId } },
      update: { amountCents: { increment: requested } },
      create: { transactionId, chargeId, amountCents: requested },
    });
    await prisma.bankTransaction.update({ where: { id: transactionId }, data: { suggestedLeaseId: charge.leaseId, matchNote: "Ručně přiřazeno správcem." } });
    await recomputeTransactionStatus(transactionId);
    await audit(access.user.id, "PAYMENT_ALLOCATED", "BankTransaction", transactionId, { propertyId: id, chargeId, amountCents: requested });
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "ok", "Platba byla přiřazena k předpisu.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "error", error instanceof Error ? error.message : "Platbu se nepodařilo přiřadit.");
  }
}
