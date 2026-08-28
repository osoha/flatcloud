import { prisma } from "./db";
import { leaseAccessWhere } from "./access";
import { calculateSecurityDepositSnapshot } from "./security-deposit-core";

export const securityDepositLeaseInclude = {
  tenant: true,
  unit: { include: { property: true } },
  securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" as const }, { createdAt: "asc" as const }] },
  securityDepositMovements: { orderBy: [{ effectiveAt: "asc" as const }, { createdAt: "asc" as const }] },
};

export async function findVisibleSecurityDepositLeases(user: { id: string; role: string; allProperties?: boolean }) {
  return prisma.lease.findMany({ where: leaseAccessWhere(user), include: securityDepositLeaseInclude, orderBy: { startDate: "desc" } });
}

export function securityDepositSnapshot(lease: { depositCents: number; endDate: Date | null; terminatedOn?: Date | null; securityDepositTerms: Parameters<typeof calculateSecurityDepositSnapshot>[0]["terms"]; securityDepositMovements: Parameters<typeof calculateSecurityDepositSnapshot>[0]["movements"] }, asOf = new Date()) {
  return calculateSecurityDepositSnapshot({ depositCents: lease.depositCents, terms: lease.securityDepositTerms, movements: lease.securityDepositMovements, asOf, leaseEnded: Boolean(lease.terminatedOn || lease.endDate && lease.endDate <= asOf) });
}
