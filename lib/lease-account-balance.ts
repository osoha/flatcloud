import { businessDateKey, businessTodayKey } from "./calendar";
import { overdueDebtCents } from "./charges";

type Payment = { amountCents: number; transaction: { bookedAt: Date; status: string } };
type CreditUse = { amountCents: number; credit: { effectiveAt: Date } };
type DepositOffset = { amountCents: number; effectiveAt: Date };
type BalanceCharge = {
  active: boolean; amountCents: number; dueDate: Date;
  debtTreatment?: "CURRENT" | "HISTORICAL" | "EXCLUDED";
  allocations: Payment[]; creditApplications: CreditUse[]; securityDepositOffsets: DepositOffset[];
};
type BalanceTransaction = {
  amountCents: number; bookedAt: Date; status: string; source: string; suggestedLeaseId: string | null;
  allocations: { amountCents: number; charge: { leaseId: string } }[];
  securityDepositReceipts: { amountCents: number; type: string; leaseId: string }[];
};
type BalanceCredit = { amountCents: number; effectiveAt: Date; applications: { amountCents: number }[] };

/** Free credit minus overdue debt. Payments already applied to a charge are not free overpayments. */
export function leaseAccountBalance(input: {
  leaseId: string; charges: BalanceCharge[]; transactions: BalanceTransaction[]; credits: BalanceCredit[];
}, now = new Date()) {
  const today = businessTodayKey(now);
  const effective = (date: Date) => businessDateKey(date) <= today;
  let overdueCents = 0;
  for (const charge of input.charges) {
    const allocations = charge.allocations.filter(row => row.transaction.status !== "IGNORED" && effective(row.transaction.bookedAt));
    const creditApplications = charge.creditApplications.filter(row => effective(row.credit.effectiveAt));
    const securityDepositOffsets = charge.securityDepositOffsets.filter(row => effective(row.effectiveAt));
    const current = { ...charge, allocations, creditApplications, securityDepositOffsets };
    overdueCents += overdueDebtCents(current, now);

  }
  let unappliedPaymentCents = 0;
  for (const transaction of input.transactions) {
    if (transaction.amountCents <= 0 || transaction.status === "IGNORED" || !effective(transaction.bookedAt)) continue;
    const assignedLeaseIds = new Set(transaction.allocations.map(row => row.charge.leaseId));
    const rentAssignedHere = assignedLeaseIds.size === 1 && assignedLeaseIds.has(input.leaseId);
    // A matching suggestion alone is not a confirmed payment. A manually recorded payment is.
    const manualUnallocated = transaction.source === "manual" && transaction.suggestedLeaseId === input.leaseId && !transaction.allocations.length && !transaction.securityDepositReceipts.length;
    if (!rentAssignedHere && !manualUnallocated) continue;
    if (transaction.securityDepositReceipts.some(row => row.leaseId !== input.leaseId)) continue;
    if (transaction.suggestedLeaseId && transaction.suggestedLeaseId !== input.leaseId) continue;
    const used = transaction.allocations.reduce((sum, row) => sum + row.amountCents, 0)
      + transaction.securityDepositReceipts.filter(row => row.type === "RECEIVED").reduce((sum, row) => sum + row.amountCents, 0);
    unappliedPaymentCents += Math.max(0, transaction.amountCents - used);
  }
  const creditCents = input.credits.filter(row => effective(row.effectiveAt)).reduce((sum, row) =>
    sum + Math.max(0, row.amountCents - row.applications.reduce((used, item) => used + item.amountCents, 0)), 0);
  return { balanceCents: unappliedPaymentCents + creditCents - overdueCents, overdueCents, unappliedPaymentCents, creditCents };
}
