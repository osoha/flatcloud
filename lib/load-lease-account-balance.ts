import { prisma } from "./db";
import { leaseAccountBalance } from "./lease-account-balance";

/** Caller must first authorize this lease through the unit/property access check. */
export async function loadLeaseAccountBalance(leaseId: string, now = new Date()) {
  const [charges, transactions, credits] = await Promise.all([
    prisma.charge.findMany({ where: { leaseId }, include: {
      allocations: { include: { transaction: { select: { bookedAt: true, status: true } } } },
      securityDepositOffsets: true, creditApplications: { include: { credit: { select: { effectiveAt: true } } } },
    } }),
    prisma.bankTransaction.findMany({ where: { amountCents: { gt: 0 }, status: { not: "IGNORED" }, OR: [
      { allocations: { some: { charge: { leaseId } } } }, { source: "manual", suggestedLeaseId: leaseId },
    ] }, include: { allocations: { include: { charge: { select: { leaseId: true } } } }, securityDepositReceipts: true } }),
    prisma.leaseCredit.findMany({ where: { leaseId }, include: { applications: true } }),
  ]);
  return leaseAccountBalance({ leaseId, charges, transactions, credits }, now);
}
