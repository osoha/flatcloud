import { prisma } from "@/lib/db";
import { moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { recomputeTransactionStatus } from "@/lib/matching";
import { resolveCollectionTasksIfSettled } from "@/lib/tasks";
import { go, goWithMessage } from "@/lib/route-response";
import { outstandingCents } from "@/lib/charges";
import { serializableTransaction } from "@/lib/serializable";
import { assertActiveChargeForPayment, assertTransactionAcceptsRentAllocation } from "@/lib/payment-safety";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; transactionId: string }> }) {
  const { id, transactionId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const chargeId = text(form, "chargeId", true)!;
    const result = await serializableTransaction(async (tx) => {
      const transaction = await tx.bankTransaction.findFirst({ where: { id: transactionId, bankAccount: { propertyId: id } }, include: { allocations: true, securityDepositReceipts: true } });
      const charge = await tx.charge.findFirst({ where: { id: chargeId, lease: { unit: { propertyId: id } } }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true } });
      if (!transaction || !charge) throw new Error("Platba nebo předpis nebyly nalezeny.");
      assertTransactionAcceptsRentAllocation(transaction.status);
      if (transaction.amountCents <= 0) throw new Error("Odchozí platbu nelze přiřadit k nájemnému.");
      assertActiveChargeForPayment(charge.active);
      const allocated = transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0) + transaction.securityDepositReceipts.filter((row)=>row.type==="RECEIVED").reduce((sum,row)=>sum+row.amountCents,0);
      const remainingTransaction = transaction.amountCents - allocated;
      const remainingCharge = outstandingCents(charge);
      const requested = text(form, "amount") ? moneyToCents(form, "amount") : Math.min(remainingTransaction, remainingCharge);
      if (requested <= 0 || requested > remainingTransaction || requested > remainingCharge) throw new Error("Částka přesahuje zůstatek platby nebo předpisu.");
      await tx.paymentAllocation.upsert({ where: { transactionId_chargeId: { transactionId, chargeId } }, update: { amountCents: { increment: requested } }, create: { transactionId, chargeId, amountCents: requested } });
      await tx.bankTransaction.update({ where: { id: transactionId }, data: { suggestedLeaseId: charge.leaseId, matchNote: "Ručně přiřazeno správcem." } });
      return { requested, leaseId: charge.leaseId };
    });
    await recomputeTransactionStatus(transactionId);
    await resolveCollectionTasksIfSettled(result.leaseId);
    await audit(access.user.id, "PAYMENT_ALLOCATED", "BankTransaction", transactionId, { propertyId: id, chargeId, amountCents: result.requested }, id);
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "ok", "Platba byla přiřazena k předpisu.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "error", error instanceof Error ? error.message : "Platbu se nepodařilo přiřadit.");
  }
}
