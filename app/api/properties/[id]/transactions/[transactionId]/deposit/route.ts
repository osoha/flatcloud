import { SecurityDepositMovementType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { audit } from "@/lib/management";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { recomputeTransactionStatus } from "@/lib/matching";
import { go, goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";
import { assertTransactionAcceptsDeposit } from "@/lib/payment-safety";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; transactionId: string }> }) {
  const { id, transactionId } = await params; const user = await currentUser(); if (!user) return go(request, "/login");
  try {
    const form = await request.formData(); const leaseId = text(form, "leaseId", true)!; const amountCents = moneyToCents(form, "amount"); const effectiveAt = dateValue(form, "effectiveAt", true)!;
    const { lease, movement } = await serializableTransaction(async (tx) => {
      const transaction = await tx.bankTransaction.findFirst({ where: { id: transactionId, bankAccount: { propertyId: id }, amountCents: { gt: 0 } }, include: { allocations: true, securityDepositReceipts: true } }); if (!transaction) throw new Error("Platba nebyla nalezena.");
      assertTransactionAcceptsDeposit(transaction.status);
      const lease = await tx.lease.findFirst({ where: { id: leaseId, unit: editableUnitWhere(user, id) }, select: { id: true, tenantId: true, unitId: true } }); if (!lease) throw new Error("Smlouva nebyla nalezena nebo k ní nemáte právo editace.");
      const used = transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0) + transaction.securityDepositReceipts.filter((row) => row.type === "RECEIVED").reduce((sum, row) => sum + row.amountCents, 0); if (amountCents <= 0 || amountCents > transaction.amountCents - used) throw new Error("Částka převyšuje nepoužitou část platby.");
      const movement = await tx.securityDepositMovement.create({ data: { leaseId, type: SecurityDepositMovementType.RECEIVED, amountCents, effectiveAt, note: text(form, "note"), bankTransactionId: transactionId, createdById: user.id } });
      return { lease, movement };
    });
    await recomputeTransactionStatus(transactionId); await audit(user.id, "SECURITY_DEPOSIT_RECEIVED", "SecurityDepositMovement", movement.id, { leaseId, tenantId: lease.tenantId, unitId: lease.unitId, amount: amountCents, transactionId }, id); return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "ok", "Platba byla zaúčtována jako kauce.");
  } catch (error) { return goWithMessage(request, `/nemovitosti/${id}/platby/${transactionId}`, "error", error instanceof Error ? error.message : "Platbu se nepodařilo zaúčtovat jako kauci."); }
}
